package com.nullpointertalk.livekit;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Gera tokens de acesso do LiveKit (JWT HS256) na mao, sem depender do SDK de servidor:
 * e' so um JWS compacto - header fixo + payload com o "video grant", assinado com o
 * segredo compartilhado com o livekit.yaml.
 *
 * Emite dois tipos de token:
 *
 *  - token de CLIENTE (createToken): grant roomJoin, TTL longo, vai pro navegador.
 *  - token de API (createRoomListToken / createRoomAdminToken): grant roomList/roomAdmin,
 *    TTL curto, nunca sai do backend. Usado pra consultar a RoomService via Twirp.
 */
@Component
public class LiveKitTokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final String HEADER_JSON = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
    private static final String BACKEND_IDENTITY = "nullpointertalk-backend";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String apiKey;
    private final String apiSecret;
    private final long ttlSeconds;
    private final long apiTtlSeconds;

    public LiveKitTokenService(
            @Value("${livekit.api-key}") String apiKey,
            @Value("${livekit.api-secret}") String apiSecret,
            @Value("${livekit.token-ttl-seconds:86400}") long ttlSeconds,
            @Value("${livekit.api-token-ttl-seconds:300}") long apiTtlSeconds) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.ttlSeconds = ttlSeconds;
        this.apiTtlSeconds = apiTtlSeconds;
    }

    /** Token que o navegador usa pra entrar numa sala. */
    public String createToken(String roomId, String identity, String displayName) {
        ObjectNode videoGrant = objectMapper.createObjectNode();
        videoGrant.put("room", roomId);
        videoGrant.put("roomJoin", true);
        videoGrant.put("canPublish", true);
        videoGrant.put("canSubscribe", true);
        videoGrant.put("canPublishData", true);
        // Sem isso, LocalParticipant.setName() e' rejeitado com "does not have permission
        // to update own metadata" e trocar de nome so atualizaria a propria tela - os
        // outros participantes continuariam vendo o nome antigo ate a proxima entrada.
        // Nao amplia risco nenhum: a pessoa ja escolhe o nome que quiser ao entrar.
        videoGrant.put("canUpdateOwnMetadata", true);
        return buildToken(identity, displayName, ttlSeconds, videoGrant);
    }

    /** Token pra RoomService.ListRooms - nao referencia sala nenhuma, um serve pra todas. */
    public String createRoomListToken() {
        ObjectNode videoGrant = objectMapper.createObjectNode();
        videoGrant.put("roomList", true);
        return buildToken(BACKEND_IDENTITY, BACKEND_IDENTITY, apiTtlSeconds, videoGrant);
    }

    /**
     * Token pra RoomService.ListParticipants de UMA sala.
     *
     * E' um token por sala, e nao um token "global", porque o LiveKit compara a sala
     * pedida com a do grant por igualdade exata - de pkg/service/auth.go:
     *
     *     if !claims.Video.RoomAdmin || room != livekit.RoomName(claims.Video.Room) {
     *         return ErrPermissionDenied
     *     }
     *
     * Nao existe wildcard: roomAdmin sem room, ou com room="*", e' rejeitado.
     */
    public String createRoomAdminToken(String roomId) {
        ObjectNode videoGrant = objectMapper.createObjectNode();
        videoGrant.put("roomAdmin", true);
        videoGrant.put("room", roomId);
        return buildToken(BACKEND_IDENTITY, BACKEND_IDENTITY, apiTtlSeconds, videoGrant);
    }

    /**
     * Token pra RoomService.DeleteRoom (e CreateRoom) - roomCreate nao e' escopado por
     * sala como roomAdmin e', entao um token so serve pra apagar qualquer sala.
     */
    public String createRoomCreateToken() {
        ObjectNode videoGrant = objectMapper.createObjectNode();
        videoGrant.put("roomCreate", true);
        return buildToken(BACKEND_IDENTITY, BACKEND_IDENTITY, apiTtlSeconds, videoGrant);
    }

    private String buildToken(String identity, String displayName, long tokenTtlSeconds, ObjectNode videoGrant) {
        long now = Instant.now().getEpochSecond();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("iss", apiKey);
        payload.put("sub", identity);
        payload.put("name", displayName);
        // -5s de folga: o verificador do LiveKit aceita 1 minuto de leeway no nbf, entao
        // isso e' so cinturao-e-suspensorio pra relogios levemente dessincronizados.
        payload.put("nbf", now - 5);
        payload.put("exp", now + tokenTtlSeconds);
        payload.set("video", videoGrant);

        String encodedHeader = base64Url(HEADER_JSON);
        String encodedPayload = base64Url(objectMapper.writeValueAsString(payload));
        String signingInput = encodedHeader + "." + encodedPayload;
        String signature = BASE64_URL.encodeToString(sign(signingInput));
        return signingInput + "." + signature;
    }

    private byte[] sign(String signingInput) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(apiSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Falha ao assinar token do LiveKit", e);
        }
    }

    private String base64Url(String value) {
        return BASE64_URL.encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
