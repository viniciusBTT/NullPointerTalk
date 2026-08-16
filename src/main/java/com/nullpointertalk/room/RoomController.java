package com.nullpointertalk.room;

import com.nullpointertalk.config.TurnCredentialsService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import tools.jackson.databind.ObjectMapper;

@Controller
public class RoomController {

    private final RoomCatalog roomCatalog;
    private final TurnCredentialsService turnCredentialsService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String stunUrl;
    private final String turnUrl;

    public RoomController(RoomCatalog roomCatalog,
            TurnCredentialsService turnCredentialsService,
            @Value("${webrtc.ice-servers[0].urls}") String stunUrl,
            @Value("${webrtc.turn.urls:}") String turnUrl) {
        this.roomCatalog = roomCatalog;
        this.turnCredentialsService = turnCredentialsService;
        this.stunUrl = stunUrl;
        this.turnUrl = turnUrl;
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId, Model model) {
        RoomInfo room = roomCatalog.find(roomId);
        if (room == null) {
            return "redirect:/";
        }
        model.addAttribute("room", room);
        model.addAttribute("iceServersJson", objectMapper.writeValueAsString(buildIceServers()));
        return "room";
    }

    /** STUN sempre presente; TURN so entra na lista se webrtc.turn.urls estiver configurado (perfil vps). */
    private List<Map<String, String>> buildIceServers() {
        List<Map<String, String>> servers = new ArrayList<>();
        servers.add(Map.of("urls", stunUrl));
        if (!turnUrl.isBlank() && turnCredentialsService.isEnabled()) {
            TurnCredentialsService.TurnCredential credential = turnCredentialsService.generate();
            servers.add(Map.of(
                    "urls", turnUrl,
                    "username", credential.username(),
                    "credential", credential.credential()));
        }
        return servers;
    }
}
