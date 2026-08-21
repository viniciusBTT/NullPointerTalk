package com.nullpointertalk.livekit;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Cliente da RoomService do LiveKit, falado em Twirp sobre HTTP.
 *
 * Twirp e' so "POST /twirp/<pacote>.<Servico>/<Metodo> com JSON no corpo", entao nao
 * precisa de SDK: java.net.http.HttpClient (stdlib) + Jackson dao conta, o que mantem o
 * projeto sem dependencia nova - mesma decisao do LiveKitTokenService com o JWT.
 *
 * Detalhes do wire protocol que foram conferidos na fonte do LiveKit, nao supostos:
 *
 *  - A API roda na MESMA porta da sinalizacao WebSocket (7880). Nao ha porta separada.
 *  - O JSON de resposta e' snake_case com todos os campos emitidos: o codigo gerado usa
 *    protojson com UseProtoNames=true e EmitUnpopulated=true, porque o LiveKit nao liga
 *    as flags jsonCamelCase/jsonSkipDefaults do Twirp. Os campos que lemos aqui
 *    (rooms, participants, identity, name, state) sao palavras unicas e portanto imunes
 *    a essa questao; so num_participants precisa do fallback defensivo.
 *  - int64 do protobuf vira STRING em JSON (joined_at: "1755720000"); enums viram o nome
 *    ("ACTIVE"). Nao lemos nenhum int64 hoje, mas vale saber antes de adicionar campo.
 *  - Erro Twirp e' {"code","msg","meta"} com status non-2xx. Falha de AUTENTICACAO,
 *    porem, e' 401 devolvido pelo middleware ANTES do Twirp, e pode nao ter esse formato -
 *    por isso o status vem sempre antes do parse do corpo.
 */
@Component
public class LiveKitRoomService implements LiveKitRooms {

    private static final Logger log = LoggerFactory.getLogger(LiveKitRoomService.class);
    private static final String TWIRP_PREFIX = "/twirp/livekit.RoomService/";

    /**
     * Participantes que nao sao pessoas numa aba de navegador. Hoje o projeto nao usa
     * nenhum deles, mas filtrar agora custa uma linha e evita que um egress de gravacao
     * apareca como "alguem" na sidebar se algum dia for ligado.
     */
    private static final Set<String> NON_HUMAN_KINDS = Set.of(
            "INGRESS", "EGRESS", "AGENT", "SIP", "CONNECTOR", "BRIDGE");

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final LiveKitTokenService tokenService;
    private final String apiBaseUrl;
    private final Duration requestTimeout;

    public LiveKitRoomService(LiveKitTokenService tokenService,
            @Value("${livekit.url}") String liveKitUrl,
            @Value("${livekit.api-url:}") String liveKitApiUrl,
            @Value("${livekit.http-timeout-ms:3000}") long timeoutMs) {
        this.tokenService = tokenService;
        this.apiBaseUrl = toHttpBaseUrl(
                liveKitApiUrl == null || liveKitApiUrl.isBlank() ? liveKitUrl : liveKitApiUrl);
        this.requestTimeout = Duration.ofMillis(timeoutMs);
        // HTTP_1_1 explicito: o default do JDK e' HTTP_2, que tenta um upgrade h2c em
        // conexao sem TLS. O servidor Go do LiveKit nao serve h2c, entao cada conexao
        // nova queimaria uma negociacao inutil antes de cair pro 1.1.
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        log.info("RoomService do LiveKit em {}", this.apiBaseUrl);
    }

    @Override
    public Map<String, Integer> listRooms() {
        JsonNode root = post("ListRooms", "{\"names\":[]}", tokenService.createRoomListToken());
        Map<String, Integer> rooms = new LinkedHashMap<>();
        for (JsonNode room : root.path("rooms")) {
            String name = room.path("name").asString("");
            if (name.isBlank()) {
                continue;
            }
            rooms.put(name, participantCount(room));
        }
        return rooms;
    }

    /**
     * null (e nao 0) quando a contagem nao pode ser lida. Quem chama trata isso como
     * "nao sei" e pergunta de verdade, em vez de assumir sala vazia - degradar pra uma
     * requisicao a mais e' aceitavel, degradar pra resposta errada nao e'.
     */
    private Integer participantCount(JsonNode room) {
        // snake_case e' o que o LiveKit emite hoje; o fallback camelCase existe pra que
        // uma mudanca de configuracao do lado deles degrade pra "pergunta de verdade"
        // em vez de "acha que a sala esta vazia".
        JsonNode count = room.hasNonNull("num_participants")
                ? room.get("num_participants")
                : room.get("numParticipants");
        if (count == null || count.isNull()) {
            return null;
        }
        int value = count.asInt(-1);
        return value < 0 ? null : value;
    }

    @Override
    public List<LiveKitParticipant> listParticipants(String roomId) {
        String body = objectMapper.writeValueAsString(
                objectMapper.createObjectNode().put("room", roomId));
        JsonNode root = post("ListParticipants", body, tokenService.createRoomAdminToken(roomId));

        List<LiveKitParticipant> participants = new ArrayList<>();
        for (JsonNode node : root.path("participants")) {
            String identity = node.path("identity").asString("");
            if (identity.isBlank()) {
                continue;
            }
            if ("DISCONNECTED".equals(node.path("state").asString(""))) {
                continue;
            }
            if (node.path("permission").path("hidden").asBoolean(false)) {
                continue;
            }
            String kind = node.path("kind").asString("STANDARD");
            if (NON_HUMAN_KINDS.contains(kind)) {
                continue;
            }
            String name = node.path("name").asString("");
            participants.add(new LiveKitParticipant(identity, name.isBlank() ? "Anonimo" : name));
        }
        return participants;
    }

    private JsonNode post(String method, String jsonBody, String bearerToken) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(apiBaseUrl + TWIRP_PREFIX + method))
                // Obrigatorio: sem timeout por requisicao o cliente do JDK espera o socket
                // morrer, e o connectTimeout do builder so cobre o aperto de mao inicial.
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                // "Bearer " com B maiusculo - o middleware do LiveKit compara o prefixo
                // de forma sensivel a caixa.
                .header("Authorization", "Bearer " + bearerToken)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            // HttpTimeoutException tambem cai aqui (extends IOException).
            throw new LiveKitApiException("Falha de rede ao chamar " + method, e);
        } catch (InterruptedException e) {
            // Re-armar a flag, senao o shutdown gracioso do Tomcat para de funcionar.
            Thread.currentThread().interrupt();
            throw new LiveKitApiException("Interrompido ao chamar " + method, e);
        }

        if (response.statusCode() / 100 != 2) {
            throw new LiveKitApiException(
                    "%s respondeu HTTP %d: %s".formatted(method, response.statusCode(), twirpError(response.body())));
        }

        try {
            return objectMapper.readTree(response.body());
        } catch (JacksonException e) {
            throw new LiveKitApiException("Resposta ilegivel de " + method, e);
        }
    }

    /**
     * Melhor esforco: extrai code/msg do corpo Twirp so pro log. Uma falha ao parsear
     * nunca pode mascarar o status HTTP, que e' a informacao que realmente importa
     * (401 de auth, por exemplo, nem vem em formato Twirp).
     */
    private String twirpError(String body) {
        try {
            JsonNode error = objectMapper.readTree(body);
            String code = error.path("code").asString("");
            String message = error.path("msg").asString("");
            if (!code.isBlank() || !message.isBlank()) {
                return code + " " + message;
            }
        } catch (JacksonException ignored) {
            // corpo nao-Twirp - devolve cru abaixo
        }
        return body == null || body.length() <= 200 ? String.valueOf(body) : body.substring(0, 200) + "…";
    }

    /**
     * ws:// -> http://, wss:// -> https://, http(s):// passa direto.
     *
     * Deliberadamente startsWith + substring, e nao replace("ws","http") nem
     * replaceFirst("^ws","http"): a forma ingenua mutila hosts que tem "ws" no nome,
     * tipo wss://livekit.ws-exemplo.com. Coberto por LiveKitUrlTest.
     */
    static String toHttpBaseUrl(String url) {
        String trimmed = url == null ? "" : url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (trimmed.startsWith("wss://")) {
            return "https://" + trimmed.substring("wss://".length());
        }
        if (trimmed.startsWith("ws://")) {
            return "http://" + trimmed.substring("ws://".length());
        }
        if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
            return trimmed;
        }
        throw new IllegalArgumentException("livekit.url/livekit.api-url com esquema inesperado: " + url);
    }
}
