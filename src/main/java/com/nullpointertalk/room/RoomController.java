package com.nullpointertalk.room;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Controller
public class RoomController {

    private final RoomCatalog roomCatalog;
    private final String iceServerUrl;

    public RoomController(RoomCatalog roomCatalog,
            @Value("${webrtc.ice-servers[0].urls}") String iceServerUrl) {
        this.roomCatalog = roomCatalog;
        this.iceServerUrl = iceServerUrl;
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId, Model model) {
        RoomInfo room = roomCatalog.find(roomId);
        if (room == null) {
            return "redirect:/";
        }
        model.addAttribute("room", room);
        model.addAttribute("iceServerUrl", iceServerUrl);
        return "room";
    }
}
