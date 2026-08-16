package com.nullpointertalk.config;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Gera credenciais TURN de curta duracao para o coturn, no esquema "TURN REST API"
 * (draft-uberti-behave-turn-rest) que o coturn entende nativamente com --use-auth-secret:
 * username = timestamp unix de expiracao, credential = HMAC-SHA1(username) usando o segredo
 * compartilhado com o coturn. Em vez de embutir usuario/senha fixos no HTML da sala, cada
 * carregamento de pagina gera uma credencial nova que expira sozinha.
 */
@Component
public class TurnCredentialsService {

    private static final String HMAC_ALGORITHM = "HmacSHA1";

    private final String secret;
    private final long ttlSeconds;

    public TurnCredentialsService(
            @Value("${webrtc.turn.secret:}") String secret,
            @Value("${webrtc.turn.ttl-seconds:86400}") long ttlSeconds) {
        this.secret = secret;
        this.ttlSeconds = ttlSeconds;
    }

    /** false quando webrtc.turn.secret nao esta configurado (perfil local/ngrok) - so STUN entra. */
    public boolean isEnabled() {
        return secret != null && !secret.isBlank();
    }

    public TurnCredential generate() {
        long expiresAt = Instant.now().getEpochSecond() + ttlSeconds;
        String username = Long.toString(expiresAt);
        return new TurnCredential(username, sign(username));
    }

    private String sign(String username) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] hash = mac.doFinal(username.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Falha ao gerar credencial TURN", e);
        }
    }

    public record TurnCredential(String username, String credential) {
    }
}
