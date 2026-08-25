package com.nullpointertalk.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.nullpointertalk.livekit.LiveKitApiException;
import com.nullpointertalk.livekit.LiveKitParticipant;
import com.nullpointertalk.livekit.LiveKitRooms;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/**
 * Fake escrito a mao em vez de Mockito: mantem o projeto sem dependencia nova e deixa
 * explicito o que esta sendo contado (numero de chamadas por metodo), que e' exatamente
 * o que estes testes precisam observar.
 */
class PresenceServiceTest {

    /**
     * Fixture de teste, sem relacao com o seed real de producao (estudos/jogos) -
     * so precisa dos ids que estes testes ja usavam antes do catalogo virar persistido.
     */
    private static final class FakeRoomDirectory implements RoomDirectory {
        private final List<RoomInfo> rooms = List.of(
                new RoomInfo("geral", "Geral", "💬"),
                new RoomInfo("jogos", "Jogos", "🎮"),
                new RoomInfo("estudos", "Estudos", "📚"));

        @Override
        public List<RoomInfo> all() {
            return rooms;
        }

        @Override
        public RoomInfo find(String id) {
            return rooms.stream().filter(room -> room.id().equals(id)).findFirst().orElse(null);
        }
    }

    private final FakeRoomDirectory catalog = new FakeRoomDirectory();

    private static final class FakeLiveKit implements LiveKitRooms {
        final AtomicInteger listRoomsCalls = new AtomicInteger();
        final AtomicInteger listParticipantsCalls = new AtomicInteger();
        Map<String, Integer> rooms = new LinkedHashMap<>();
        RuntimeException failure;
        CountDownLatch entered;
        CountDownLatch release;

        @Override
        public Map<String, Integer> listRooms() {
            listRoomsCalls.incrementAndGet();
            if (entered != null) {
                entered.countDown();
            }
            if (release != null) {
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (failure != null) {
                throw failure;
            }
            return rooms;
        }

        @Override
        public List<LiveKitParticipant> listParticipants(String roomId) {
            listParticipantsCalls.incrementAndGet();
            if (failure != null) {
                throw failure;
            }
            return List.of(new LiveKitParticipant("id-" + roomId, "Alguem em " + roomId));
        }

        @Override
        public void deleteRoom(String roomId) {
            // no-op: nenhum teste de presenca exercita exclusao de sala.
        }
    }

    @Test
    void sempreDevolveUmaChavePorCanalDoCatalogo() {
        FakeLiveKit fake = new FakeLiveKit();
        PresenceService service = new PresenceService(catalog, fake, 60_000, 60_000);

        Map<String, List<LiveKitParticipant>> snapshot = service.snapshot();

        List<String> esperados = new ArrayList<>();
        catalog.all().forEach(room -> esperados.add(room.id()));
        assertEquals(esperados.size(), snapshot.size());
        esperados.forEach(id -> assertNotNull(snapshot.get(id), "faltou a chave " + id));
    }

    @Test
    void naoConsultaParticipantesDeSalaVazia() {
        FakeLiveKit fake = new FakeLiveKit();
        // Duas salas conhecidas pelo LiveKit: uma com gente, outra que acabou de esvaziar
        // (o LiveKit mantem a sala listada com 0 por ~5 min depois do ultimo sair).
        fake.rooms.put("geral", 2);
        fake.rooms.put("jogos", 0);
        PresenceService service = new PresenceService(catalog, fake, 60_000, 60_000);

        Map<String, List<LiveKitParticipant>> snapshot = service.snapshot();

        assertEquals(1, fake.listParticipantsCalls.get(), "so a sala com gente deveria ser consultada");
        assertEquals(1, snapshot.get("geral").size());
        assertTrue(snapshot.get("jogos").isEmpty());
        assertTrue(snapshot.get("estudos").isEmpty(), "sala ausente do ListRooms conta como vazia");
    }

    /** Contagem ilegivel (null) tem que abrir o ListParticipants, nao assumir sala vazia. */
    @Test
    void perguntaDeVerdadeQuandoAContagemNaoVeio() {
        FakeLiveKit fake = new FakeLiveKit();
        fake.rooms.put("geral", null);
        PresenceService service = new PresenceService(catalog, fake, 60_000, 60_000);

        Map<String, List<LiveKitParticipant>> snapshot = service.snapshot();

        assertEquals(1, fake.listParticipantsCalls.get());
        assertEquals(1, snapshot.get("geral").size());
    }

    @Test
    void reaproveitaOCacheDentroDoTtl() {
        FakeLiveKit fake = new FakeLiveKit();
        fake.rooms.put("geral", 1);
        PresenceService service = new PresenceService(catalog, fake, 60_000, 60_000);

        service.snapshot();
        service.snapshot();
        service.snapshot();

        assertEquals(1, fake.listRoomsCalls.get(), "tres leituras deveriam gerar um unico fetch");
        assertFalse(service.isStale());
    }

    /**
     * O ponto do tryLock: a segunda thread NAO pode ficar bloqueada esperando o fetch da
     * primeira. Com synchronized, uma dependencia lenta empilharia threads do Tomcat.
     */
    @Test
    void leitorConcorrenteNaoBloqueiaEsperandoOFetch() throws Exception {
        FakeLiveKit fake = new FakeLiveKit();
        fake.rooms.put("geral", 1);
        fake.entered = new CountDownLatch(1);
        fake.release = new CountDownLatch(1);
        PresenceService service = new PresenceService(catalog, fake, 60_000, 60_000);

        Thread primeira = new Thread(service::snapshot);
        primeira.start();
        assertTrue(fake.entered.await(5, TimeUnit.SECONDS), "o fetch deveria ter comecado");

        // Enquanto a primeira esta presa dentro do LiveKit, esta chamada precisa retornar
        // na hora - com um mapa valido, ainda que sem dado nenhum.
        Map<String, List<LiveKitParticipant>> durante = service.snapshot();
        assertEquals(catalog.all().size(), durante.size());

        fake.release.countDown();
        primeira.join(5_000);
        assertEquals(1, fake.listRoomsCalls.get(), "as duas leituras deveriam compartilhar um fetch");
    }

    @Test
    void serveOUltimoDadoConhecidoQuandoOLiveKitFalha() {
        FakeLiveKit fake = new FakeLiveKit();
        fake.rooms.put("geral", 1);
        // ttl 0 = todo snapshot() tenta buscar de novo; falha fica cacheada por 60s
        PresenceService service = new PresenceService(catalog, fake, 0, 60_000);

        Map<String, List<LiveKitParticipant>> bom = service.snapshot();
        assertEquals(1, bom.get("geral").size());
        assertFalse(service.isStale());

        fake.failure = new LiveKitApiException("LiveKit fora do ar");
        Map<String, List<LiveKitParticipant>> degradado = service.snapshot();

        assertEquals(1, degradado.get("geral").size(), "deveria manter o dado anterior, nao esvaziar");
        assertTrue(service.isStale());

        // E o TTL de falha maior tem que evitar martelar o LiveKit a cada poll.
        int chamadasAteAgora = fake.listRoomsCalls.get();
        service.snapshot();
        service.snapshot();
        assertEquals(chamadasAteAgora, fake.listRoomsCalls.get(), "falha deveria ficar cacheada");
    }

    @Test
    void degradaParaMapaVazioSeAPrimeiraLeituraJaFalhar() {
        FakeLiveKit fake = new FakeLiveKit();
        fake.failure = new LiveKitApiException("LiveKit nunca respondeu");
        PresenceService service = new PresenceService(catalog, fake, 0, 60_000);

        Map<String, List<LiveKitParticipant>> snapshot = service.snapshot();

        assertEquals(catalog.all().size(), snapshot.size());
        snapshot.values().forEach(list -> assertTrue(list.isEmpty()));
        assertTrue(service.isStale());
    }
}
