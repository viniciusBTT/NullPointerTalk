package com.nullpointertalk.chat;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ChatMessageRepository extends MongoRepository<ChatMessage, String> {

    long countByRoomId(String roomId);

    /** Usado pra achar o excedente mais antigo quando o cap de 250 estoura. */
    List<ChatMessage> findByRoomIdOrderByTimestampAsc(String roomId, Pageable pageable);

    /** Carga completa de historico (ate 250, o maximo retido por sala). */
    List<ChatMessage> findTop250ByRoomIdOrderByTimestampDesc(String roomId);

    /** Carga incremental - usado tanto pro "o que chegou desde X" quanto pra contar nao-lidas. */
    List<ChatMessage> findByRoomIdAndTimestampAfterOrderByTimestampAsc(String roomId, Instant after);

    void deleteByRoomId(String roomId);
}
