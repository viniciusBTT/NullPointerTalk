package com.nullpointertalk.room;

/** Distribuido em /topic/room-catalog pra manter toda aba aberta sincronizada sem reload. */
public record RoomCatalogEvent(String type, RoomInfo room) {

    static RoomCatalogEvent created(RoomInfo room) {
        return new RoomCatalogEvent("created", room);
    }

    static RoomCatalogEvent updated(RoomInfo room) {
        return new RoomCatalogEvent("updated", room);
    }

    static RoomCatalogEvent deleted(RoomInfo room) {
        return new RoomCatalogEvent("deleted", room);
    }
}
