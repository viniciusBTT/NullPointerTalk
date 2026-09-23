package com.nullpointertalk.chat;

import com.mongodb.client.gridfs.model.GridFSFile;
import com.nullpointertalk.room.RoomDirectory;
import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import org.bson.types.ObjectId;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.data.mongodb.core.query.Criteria.where;

/**
 * Upload e download de imagens do chat, guardadas no GridFS do mesmo Mongo que ja
 * persiste o historico (ChatMessage) - sem volume/diretorio novo pra gerenciar em
 * producao, e sem depender de nenhuma dependencia nova no pom.xml (GridFsTemplate ja
 * vem autoconfigurado junto com spring-boot-starter-data-mongodb).
 */
@RestController
@RequestMapping("/api")
public class ChatImageController {

    private static final Set<String> ALLOWED_TYPES = Set.of("image/png", "image/jpeg", "image/webp", "image/gif");
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final String URL_PREFIX = "/api/images/";

    private final GridFsTemplate gridFsTemplate;
    private final RoomDirectory roomDirectory;

    public ChatImageController(GridFsTemplate gridFsTemplate, RoomDirectory roomDirectory) {
        this.gridFsTemplate = gridFsTemplate;
        this.roomDirectory = roomDirectory;
    }

    @PostMapping("/rooms/{roomId}/images")
    public UploadResponse upload(@PathVariable String roomId, @RequestParam("file") MultipartFile file) {
        if (roomDirectory.find(roomId) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sala desconhecida: " + roomId);
        }
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Arquivo vazio");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Imagem maior que 5MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Tipo de imagem nao suportado: " + contentType);
        }

        ObjectId id;
        try {
            id = gridFsTemplate.store(file.getInputStream(), file.getOriginalFilename(), contentType);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Falha ao salvar imagem", e);
        }
        return new UploadResponse(URL_PREFIX + id.toHexString());
    }

    @GetMapping("/images/{id}")
    public ResponseEntity<InputStreamResource> download(@PathVariable String id) throws IOException {
        ObjectId objectId;
        try {
            objectId = new ObjectId(id);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Imagem nao encontrada");
        }

        GridFSFile file = gridFsTemplate.findOne(new Query(where("_id").is(objectId)));
        if (file == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Imagem nao encontrada");
        }

        GridFsResource resource = gridFsTemplate.getResource(file);
        // Imagem enviada e' imutavel (o link nunca e' reescrito pra apontar pra outro
        // arquivo) - cache agressivo e seguro, poupa banda em quem rola o historico.
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(resource.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(new InputStreamResource(resource.getInputStream()));
    }

    /**
     * Extrai o ObjectId hex de uma URL "/api/images/{id}", ou null se nao bater o
     * padrao - usado pelo ChatService pra apagar o arquivo de uma mensagem trimada do
     * cap de 250 mensagens por sala.
     */
    static String extractId(String imageUrl) {
        if (imageUrl == null || !imageUrl.startsWith(URL_PREFIX)) {
            return null;
        }
        return imageUrl.substring(URL_PREFIX.length());
    }

    record UploadResponse(String url) {
    }
}
