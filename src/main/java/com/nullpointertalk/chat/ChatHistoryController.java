package com.nullpointertalk.chat;

import com.nullpointertalk.room.RoomDirectory;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Um unico endpoint pras duas necessidades do cliente: carregar o historico pra
 * renderizar o painel de chat (sem "after") e contar nao-lidas de uma sala que a pessoa
 * ainda nao abriu nesta sessao (com "after" = ultimo timestamp lido, salvo no
 * localStorage). Nao ha motivo pra um segundo caminho so pra "contar" quando "listar"
 * ja responde a mesma pergunta.
 */
@RestController
@RequestMapping("/api/rooms")
public class ChatHistoryController {

    private final ChatMessageRepository repository;
    private final RoomDirectory roomDirectory;

    public ChatHistoryController(ChatMessageRepository repository, RoomDirectory roomDirectory) {
        this.repository = repository;
        this.roomDirectory = roomDirectory;
    }

    @GetMapping("/{roomId}/messages")
    public List<ChatMessageView> history(@PathVariable String roomId,
            @RequestParam(required = false) Long after) {
        if (roomDirectory.find(roomId) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala desconhecida: " + roomId);
        }
        List<ChatMessage> messages = after == null
                ? repository.findTop250ByRoomIdOrderByTimestampDesc(roomId).reversed()
                : repository.findByRoomIdAndTimestampAfterOrderByTimestampAsc(roomId, Instant.ofEpochMilli(after));
        return messages.stream().map(ChatMessageView::of).toList();
    }
}
