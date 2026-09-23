package com.nullpointertalk.chat;

import java.time.Instant;
import java.util.List;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Service;

import static org.springframework.data.mongodb.core.query.Criteria.where;

/**
 * Grava mensagem e mantem o cap de 250 por sala. O trim e' sincrono, por insercao (conta,
 * se passou de 250 apaga o excedente mais antigo): sob envio concorrente na mesma sala a
 * contagem pode passar de 250 por uma mensagem ou duas ate a proxima insercao corrigir -
 * aceitavel pra um chat de laboratorio, nao vale um lock distribuido so por isso.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final int MAX_MESSAGES_PER_ROOM = 250;

    private final ChatMessageRepository repository;
    private final GridFsTemplate gridFsTemplate;

    public ChatService(ChatMessageRepository repository, GridFsTemplate gridFsTemplate) {
        this.repository = repository;
        this.gridFsTemplate = gridFsTemplate;
    }

    public ChatMessage save(String roomId, String stableId, String name, String text, String imageUrl) {
        ChatMessage saved = repository
                .save(new ChatMessage(null, roomId, stableId, name, text, imageUrl, Instant.now()));
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
        oldest.forEach(this::deleteImageIfAny);
        repository.deleteAll(oldest);
    }

    // A mensagem sai do cap de 250 mas o arquivo dela no GridFS nao morre sozinho -
    // sem isso toda imagem enviada vira lixo permanente no Mongo assim que a mensagem
    // envelhece.
    private void deleteImageIfAny(ChatMessage message) {
        String imageId = ChatImageController.extractId(message.getImageUrl());
        if (imageId == null) {
            return;
        }
        try {
            gridFsTemplate.delete(new Query(where("_id").is(new ObjectId(imageId))));
        } catch (RuntimeException e) {
            log.warn("Falha ao apagar imagem {} da mensagem trimada", imageId, e);
        }
    }
}
