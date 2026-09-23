package com.nullpointertalk.chat;

import com.nullpointertalk.room.RoomDirectory;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Recebe SEND em /app/chat/{roomId}, salva e distribui manualmente com
 * SimpMessagingTemplate.convertAndSend (e nao @SendTo): assim uma mensagem pra sala
 * desconhecida ou invalida pode ser descartada cedo, sem forcar um broadcast do jeito
 * que @SendTo faria com qualquer retorno do metodo.
 */
@Controller
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ChatService chatService;
    private final RoomDirectory roomDirectory;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(ChatService chatService, RoomDirectory roomDirectory,
            SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.roomDirectory = roomDirectory;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat/{roomId}")
    public void receive(@DestinationVariable String roomId, @Valid ChatMessageRequest request) {
        if (roomDirectory.find(roomId) == null) {
            log.warn("Mensagem de chat pra sala desconhecida descartada: {}", roomId);
            return;
        }
        boolean hasText = request.text() != null && !request.text().isBlank();
        boolean hasImage = request.imageUrl() != null && !request.imageUrl().isBlank();
        if (!hasText && !hasImage) {
            log.warn("Mensagem de chat vazia (sem texto e sem imagem) descartada: {}", roomId);
            return;
        }
        ChatMessage saved = chatService.save(roomId, request.stableId(), request.name(), request.text(),
                request.imageUrl());
        messagingTemplate.convertAndSend("/topic/room/" + roomId, ChatMessageView.of(saved));
    }
}
