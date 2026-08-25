package com.nullpointertalk.room;

import com.nullpointertalk.livekit.LiveKitTokenService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Sem @Validated na classe de proposito: isso ligaria o MethodValidationInterceptor
 * baseado em AOP (de spring-context), que intercepta a chamada ANTES do MVC e lanca
 * jakarta.validation.ConstraintViolationException cru - sem @ExceptionHandler pra esse
 * tipo, vira 500. Sem @Validated, o proprio Spring MVC (desde o Framework 6.1) ja valida
 * @RequestParam/@PathVariable com anotacoes de constraint sozinho, e o erro sai como
 * HandlerMethodValidationException, que o MVC converte pra 400 automaticamente.
 * Confirmado na pratica: com @Validated a resposta era 500; sem, e' 400.
 */
@Controller
public class RoomTokenController {

    private final RoomCatalog roomCatalog;
    private final LiveKitTokenService liveKitTokenService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String liveKitUrl;

    public RoomTokenController(RoomCatalog roomCatalog,
            LiveKitTokenService liveKitTokenService,
            @Value("${livekit.url}") String liveKitUrl) {
        this.roomCatalog = roomCatalog;
        this.liveKitTokenService = liveKitTokenService;
        this.liveKitUrl = liveKitUrl;
    }

    /**
     * Emite o token de acesso do LiveKit para esta sala - chamado via fetch pelo cliente
     * antes de conectar, depois que ele ja gerou sua propria identity.
     */
    @GetMapping(value = "/room/{roomId}/token", produces = "application/json")
    @ResponseBody
    public String token(@PathVariable String roomId,
            @RequestParam @NotBlank @Size(max = 128) String identity,
            @RequestParam(defaultValue = "Anonimo") @Size(max = 60) String name) {
        RoomInfo room = roomCatalog.find(roomId);
        if (room == null) {
            // ResponseStatusException e nao IllegalArgumentException: esta ultima virava
            // 500 com pagina de ERRO EM HTML, e o res.json() do cliente estourava tentando
            // parsear. Com roteamento no cliente esse caminho passou a ser alcancavel de
            // verdade (bookmark antigo, id removido do catalogo entre o load e o clique).
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala desconhecida: " + roomId);
        }
        String token = liveKitTokenService.createToken(room.id(), identity, name);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("token", token);
        response.put("url", liveKitUrl);
        return objectMapper.writeValueAsString(response);
    }
}
