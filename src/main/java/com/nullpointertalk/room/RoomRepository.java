package com.nullpointertalk.room;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, String> {

    List<Room> findAllByOrderByCreatedAtAsc();
}
