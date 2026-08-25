package com.nullpointertalk.room;

import java.util.List;

/**
 * O catalogo de salas, como quem consome (AppShellController, RoomTokenController,
 * PresenceService, ChatController) precisa ve-lo.
 *
 * Existe como interface pelo mesmo motivo de LiveKitRooms: permite injetar um fake
 * escrito a mao em teste, sem subir Postgres nem trazer Mockito.
 */
public interface RoomDirectory {

    List<RoomInfo> all();

    RoomInfo find(String id);
}
