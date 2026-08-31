package com.nullpointertalk.room;

import com.nullpointertalk.chat.ChatMessageRepository;
import com.nullpointertalk.livekit.LiveKitRooms;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * CRUD de salas, aberto (sem login - igual ao resto do app). Sem GET de listagem de
 * proposito: quem abre a pagina do zero ja recebe a lista embutida no HTML por
 * AppShellController, e quem ja esta com a pagina aberta escuta /topic/room-catalog -
 * a mesma razao que AppShellController ja da pra nao duplicar essa fonte de verdade
 * num /api/rooms.
 */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomRepository repository;
    private final ChatMessageRepository chatMessageRepository;
    private final LiveKitRooms liveKit;
    private final SimpMessagingTemplate messagingTemplate;

    public RoomController(RoomRepository repository, ChatMessageRepository chatMessageRepository,
            LiveKitRooms liveKit, SimpMessagingTemplate messagingTemplate) {
        this.repository = repository;
        this.chatMessageRepository = chatMessageRepository;
        this.liveKit = liveKit;
        this.messagingTemplate = messagingTemplate;
    }

    @PostMapping
    public ResponseEntity<RoomInfo> create(@Valid @RequestBody RoomCreateRequest request) {
        if (repository.existsById(request.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sala ja existe: " + request.id());
        }
        Room saved = repository.save(new Room(request.id(), request.name(), request.icon(), Instant.now()));
        RoomInfo info = RoomCatalog.toInfo(saved);
        messagingTemplate.convertAndSend("/topic/room-catalog", RoomCatalogEvent.created(info));
        return ResponseEntity.status(HttpStatus.CREATED).body(info);
    }

    @PutMapping("/{roomId}")
    public RoomInfo update(@PathVariable String roomId, @Valid @RequestBody RoomUpdateRequest request) {
        Room room = repository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala desconhecida: " + roomId));
        room.setName(request.name());
        room.setIcon(request.icon());
        RoomInfo info = RoomCatalog.toInfo(repository.save(room));
        messagingTemplate.convertAndSend("/topic/room-catalog", RoomCatalogEvent.updated(info));
        return info;
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> delete(@PathVariable String roomId) {
        Room room = repository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala desconhecida: " + roomId));
        RoomInfo info = RoomCatalog.toInfo(room);
        repository.deleteById(roomId);
        // Obrigatorio, nao so limpeza: se o slug for reusado depois por uma sala nova,
        // o historico velho ressuscitaria sob o id novo sem isso.
        chatMessageRepository.deleteByRoomId(roomId);
        liveKit.deleteRoom(roomId);
        messagingTemplate.convertAndSend("/topic/room-catalog", RoomCatalogEvent.deleted(info));
        return ResponseEntity.noContent().build();
    }
}
