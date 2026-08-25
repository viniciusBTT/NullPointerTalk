package com.nullpointertalk.room;

import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Catalogo de salas, agora persistido no Postgres via RoomRepository (fase anterior:
 * lista fixa no codigo, sem CRUD). RoomInfo continua um tipo imutavel separado da
 * entidade JPA - Jackson serializa RoomInfo pra roomsJson em AppShellController sem
 * nunca tocar em proxy/estado de entidade.
 */
@Component
public class RoomCatalog implements RoomDirectory {

    private final RoomRepository repository;

    public RoomCatalog(RoomRepository repository) {
        this.repository = repository;
    }

    @Override
    public List<RoomInfo> all() {
        return repository.findAllByOrderByCreatedAtAsc().stream()
                .map(RoomCatalog::toInfo)
                .toList();
    }

    @Override
    public RoomInfo find(String id) {
        return repository.findById(id).map(RoomCatalog::toInfo).orElse(null);
    }

    static RoomInfo toInfo(Room room) {
        return new RoomInfo(room.getId(), room.getName(), room.getIcon());
    }
}
