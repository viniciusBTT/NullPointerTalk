package com.nullpointertalk.room;

import com.nullpointertalk.livekit.LiveKitTokenService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Controller
public class RoomController {

    private final RoomCatalog roomCatalog;
    private final LiveKitTokenService liveKitTokenService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String liveKitUrl;

    public RoomController(RoomCatalog roomCatalog,
            LiveKitTokenService liveKitTokenService,
            @Value("${livekit.url}") String liveKitUrl) {
        this.roomCatalog = roomCatalog;
        this.liveKitTokenService = liveKitTokenService;
        this.liveKitUrl = liveKitUrl;
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId, Model model) {
        RoomInfo room = roomCatalog.find(roomId);
        if (room == null) {
            return "redirect:/";
        }
        model.addAttribute("room", room);
        return "room";
    }

    /**
     * Emite o token de acesso do LiveKit para esta sala - chamado via fetch pelo room.js
     * antes de conectar, depois que o cliente ja gerou seu proprio peerId/identity.
     */
    @GetMapping(value = "/room/{roomId}/token", produces = "application/json")
    @ResponseBody
    public String token(@PathVariable String roomId,
            @RequestParam String identity,
            @RequestParam(defaultValue = "Anonimo") String name) {
        RoomInfo room = roomCatalog.find(roomId);
        if (room == null) {
            throw new IllegalArgumentException("Sala desconhecida: " + roomId);
        }
        String token = liveKitTokenService.createToken(room.id(), identity, name);
        ObjectNode response = objectMapper.createObjectNode();
        response.put("token", token);
        response.put("url", liveKitUrl);
        return objectMapper.writeValueAsString(response);
    }
}
