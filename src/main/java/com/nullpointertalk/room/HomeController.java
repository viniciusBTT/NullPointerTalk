package com.nullpointertalk.room;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    private final RoomCatalog roomCatalog;

    public HomeController(RoomCatalog roomCatalog) {
        this.roomCatalog = roomCatalog;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("rooms", roomCatalog.all());
        return "home";
    }
}
