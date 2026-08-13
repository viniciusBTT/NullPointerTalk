package com.nullpointertalk.room;

import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Salas fixas do laboratorio, definidas no codigo (fase 1: sem CRUD, sem persistencia).
 */
@Component
public class RoomCatalog {

    private final List<RoomInfo> rooms = List.of(
            new RoomInfo("geral", "Geral", "💬"),
            new RoomInfo("jogos", "Jogos", "🎮"),
            new RoomInfo("estudos", "Estudos", "📚"),
            new RoomInfo("musica", "Musica", "🎵"));

    public List<RoomInfo> all() {
        return rooms;
    }

    public RoomInfo find(String id) {
        return rooms.stream()
                .filter(room -> room.id().equals(id))
                .findFirst()
                .orElse(null);
    }
}
