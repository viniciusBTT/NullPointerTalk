package com.nullpointertalk.chat;

import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Uma mensagem de chat persistida, append-only. roomId + timestamp e' o par de consulta
 * de tudo aqui (historico, contagem de nao-lidas, trim do cap de 250), daí o indice
 * composto - sem spring.data.mongodb.auto-index-creation=true ele nunca e' criado.
 */
@Document(collection = "chat_messages")
@CompoundIndex(name = "room_timestamp", def = "{'roomId': 1, 'timestamp': 1}")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    @Id
    private String id;

    private String roomId;
    private String stableId;
    private String name;
    private String text;
    private String imageUrl;
    private Instant timestamp;
}
