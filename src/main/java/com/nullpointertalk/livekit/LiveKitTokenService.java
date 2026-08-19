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
 * e' so um JWS compacto - header fixo + payload com o "video grant" da sala, assinado
 * com o segredo compartilhado com o livekit.yaml (mesmo esquema de segredo compartilhado
 * que o TurnCredentialsService usava com o coturn, so trocando HMAC-SHA1 por HMAC-SHA256
 * e um payload JSON estruturado em vez de um timestamp cru).
 */
@Component
public class LiveKitTokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final String HEADER_JSON = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String apiKey;
    private final String apiSecret;
    private final long ttlSeconds;

    public LiveKitTokenService(
            @Value("${livekit.api-key}") String apiKey,
            @Value("${livekit.api-secret}") String apiSecret,
            @Value("${livekit.token-ttl-seconds:86400}") long ttlSeconds) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.ttlSeconds = ttlSeconds;
    }

    public String createToken(String roomId, String identity, String displayName) {
        long now = Instant.now().getEpochSecond();

        ObjectNode videoGrant = objectMapper.createObjectNode();
        videoGrant.put("room", roomId);
        videoGrant.put("roomJoin", true);
        videoGrant.put("canPublish", true);
        videoGrant.put("canSubscribe", true);
        videoGrant.put("canPublishData", true);

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("iss", apiKey);
        payload.put("sub", identity);
        payload.put("name", displayName);
        payload.put("nbf", now);
        payload.put("exp", now + ttlSeconds);
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
