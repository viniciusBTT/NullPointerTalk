package com.nullpointertalk.chat;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

/**
 * Grava mensagem e mantem o cap de 250 por sala. O trim e' sincrono, por insercao (conta,
 * se passou de 250 apaga o excedente mais antigo): sob envio concorrente na mesma sala a
 * contagem pode passar de 250 por uma mensagem ou duas ate a proxima insercao corrigir -
 * aceitavel pra um chat de laboratorio, nao vale um lock distribuido so por isso.
 */
@Service
public class ChatService {

    private static final int MAX_MESSAGES_PER_ROOM = 250;

    private final ChatMessageRepository repository;

    public ChatService(ChatMessageRepository repository) {
        this.repository = repository;
    }

    public ChatMessage save(String roomId, String stableId, String name, String text) {
        ChatMessage saved = repository.save(new ChatMessage(null, roomId, stableId, name, text, Instant.now()));
        trimIfNeeded(roomId);
        return saved;
    }

    private void trimIfNeeded(String roomId) {
        long count = repository.countByRoomId(roomId);
        if (count <= MAX_MESSAGES_PER_ROOM) {
            return;
        }
        int overflow = (int) (count - MAX_MESSAGES_PER_ROOM);
        List<ChatMessage> oldest = repository.findByRoomIdOrderByTimestampAsc(roomId, PageRequest.of(0, overflow));
        repository.deleteAll(oldest);
    }
}
