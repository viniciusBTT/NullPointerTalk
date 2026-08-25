package com.nullpointertalk.room;

import com.nullpointertalk.livekit.LiveKitParticipant;
import com.nullpointertalk.livekit.LiveKitRooms;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Quem esta em cada canal, com cache.
 *
 * A sidebar de todo navegador aberto faz polling nisso, e sem cache N navegadores viram
 * N vezes o trafego pro LiveKit. Com o cache, o custo e' no maximo um lote de chamadas
 * por janela de 1,5s independente de quantas abas estejam olhando.
 */
@Service
public class PresenceService {

    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);

    private final RoomDirectory roomCatalog;
    private final LiveKitRooms liveKit;
    private final long okTtlNanos;
    private final long failTtlNanos;

    private final AtomicReference<Snapshot> cache = new AtomicReference<>();
    private final ReentrantLock refreshLock = new ReentrantLock();

    public PresenceService(RoomDirectory roomCatalog,
            LiveKitRooms liveKit,
            @Value("${livekit.presence-cache-ms:1500}") long cacheMs,
            @Value("${livekit.presence-failure-cache-ms:5000}") long failureCacheMs) {
        this.roomCatalog = roomCatalog;
        this.liveKit = liveKit;
        this.okTtlNanos = cacheMs * 1_000_000L;
        this.failTtlNanos = failureCacheMs * 1_000_000L;
    }

    /**
     * Mapa imutavel com UMA chave por canal do catalogo, sempre - lista vazia quando
     * ninguem esta la. Estabilidade de contrato vale mais que alguns bytes: a sidebar
     * renderiza as linhas de forma incondicional e nunca precisa distinguir "vazio" de
     * "ausente".
     */
    public Map<String, List<LiveKitParticipant>> snapshot() {
        Snapshot current = cache.get();
        if (isFresh(current)) {
            return current.byRoom();
        }

        // tryLock, e nao synchronized: se o LiveKit travar, com synchronized TODA
        // requisicao concorrente enfileira atras de um timeout de 3s e as threads do
        // Tomcat empilham - uma dependencia lenta viraria indisponibilidade do app
        // inteiro. Assim so uma thread paga a latencia; as outras devolvem o snapshot
        // anterior em microssegundos.
        if (!refreshLock.tryLock()) {
            return current != null ? current.byRoom() : emptyCatalogMap();
        }
        try {
            current = cache.get(); // outra thread pode ter acabado de atualizar
            if (isFresh(current)) {
                return current.byRoom();
            }
            Snapshot fresh = new Snapshot(fetch(), System.nanoTime(), false);
            cache.set(fresh);
            return fresh.byRoom();
        } catch (RuntimeException e) {
            // Serve o ultimo mapa conhecido em vez de um mapa vazio: "todo mundo saiu" e'
            // mentira ativa, dado de 5s atras e' quase sempre verdade.
            Map<String, List<LiveKitParticipant>> lastKnown =
                    current != null ? current.byRoom() : emptyCatalogMap();
            log.warn("Presenca indisponivel, servindo dado anterior: {}", e.getMessage());
            cache.set(new Snapshot(lastKnown, System.nanoTime(), true));
            return lastKnown;
        } finally {
            refreshLock.unlock();
        }
    }

    /** true se o ultimo fetch falhou - vira o header X-Presence-Stale. */
    public boolean isStale() {
        Snapshot current = cache.get();
        return current == null || current.stale();
    }

    /**
     * ListRooms primeiro, de proposito: e' UMA requisicao que ja diz quais canais tem
     * gente, e so esses precisam de um ListParticipants. Em repouso isso e' 1 requisicao
     * por janela em vez de uma por canal - e nao existe RPC "todos os participantes de
     * todas as salas" no LiveKit pra fazer isso de uma vez.
     */
    private Map<String, List<LiveKitParticipant>> fetch() {
        Map<String, Integer> active = liveKit.listRooms();
        Map<String, List<LiveKitParticipant>> byRoom = new LinkedHashMap<>();

        for (RoomInfo room : roomCatalog.all()) {
            Integer count = active.containsKey(room.id()) ? active.get(room.id()) : Integer.valueOf(0);
            // count == null significa "nao consegui ler a contagem" - nesse caso pergunta
            // de verdade. Pular so com um 0 confirmado e' o que torna a otimizacao segura.
            if (count != null && count == 0) {
                byRoom.put(room.id(), List.of());
                continue;
            }
            byRoom.put(room.id(), List.copyOf(liveKit.listParticipants(room.id())));
        }
        // Uma falha de um canal aborta o refresh inteiro (o catch acima serve o anterior).
        // Um mapa parcial seria renderizado como "essas pessoas sairam", que e' pior que
        // um mapa 1,5s velho mas coerente.
        return Map.copyOf(byRoom);
    }

    private boolean isFresh(Snapshot snapshot) {
        if (snapshot == null) {
            return false;
        }
        long ttl = snapshot.stale() ? failTtlNanos : okTtlNanos;
        // nanoTime, nao currentTimeMillis: monotonico, imune a ajuste de NTP.
        return System.nanoTime() - snapshot.fetchedAtNanos() < ttl;
    }

    private Map<String, List<LiveKitParticipant>> emptyCatalogMap() {
        Map<String, List<LiveKitParticipant>> empty = new LinkedHashMap<>();
        roomCatalog.all().forEach(room -> empty.put(room.id(), List.of()));
        return Map.copyOf(empty);
    }

    /**
     * Imutavel de proposito: o AtomicReference da a barreira de memoria, e a
     * imutabilidade e' o que permite N threads do Tomcat serializarem a MESMA instancia
     * em paralelo. Um HashMap mutavel compartilhado aqui daria
     * ConcurrentModificationException no primeiro refresh que sobrepusesse uma resposta.
     */
    private record Snapshot(Map<String, List<LiveKitParticipant>> byRoom,
            long fetchedAtNanos,
            boolean stale) {
    }
}
