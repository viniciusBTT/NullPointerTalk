package com.nullpointertalk.room;

import com.nullpointertalk.livekit.LiveKitParticipant;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Presenca por canal, pra sidebar mostrar quem esta em cada sala sem precisar entrar nelas.
 *
 * Nao autenticado, e isso e' decisao consciente: expoe os nomes de exibicao de quem esta
 * online pra qualquer um que alcance o app. Combina com o resto do projeto (que nao tem
 * login nenhum) e com o comportamento do Discord dentro de um servidor; nao vaza token e
 * nao permite entrar em sala nenhuma.
 */
@RestController
public class PresenceController {

    private final PresenceService presenceService;

    public PresenceController(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    /**
     * Sempre 200, mesmo com o LiveKit fora do ar - a degradacao vai no X-Presence-Stale.
     *
     * Um 500 aqui seria o pior modo de falha possivel: o Spring devolveria a pagina de
     * erro em HTML, o res.json() do poller estouraria, e o cliente perderia a capacidade
     * de distinguir "LiveKit caiu" de "app quebrado". Um 503 tambem nao ajudaria, porque
     * a acao correta do cliente e' a mesma nos dois casos (seguir mostrando o que tem e
     * dar backoff) - o header carrega essa informacao sem exigir um segundo caminho de parse.
     */
    @GetMapping(value = "/api/presence", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, List<LiveKitParticipant>>> presence() {
        Map<String, List<LiveKitParticipant>> byRoom = presenceService.snapshot();
        return ResponseEntity.ok()
                // Tem nginx na frente na VPS: sem no-store um poll de 1,5s pode ser
                // cacheado e a sidebar congela sem ninguem entender por que.
                .cacheControl(CacheControl.noStore())
                .header("X-Presence-Stale", Boolean.toString(presenceService.isStale()))
                .body(byRoom);
    }
}
