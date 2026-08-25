package com.nullpointertalk.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Roda contra o Mongo real (mesmo padrao de BackendApplicationTests): o comportamento
 * que importa aqui - contar, comparar com 250, apagar o excedente mais antigo - so faz
 * sentido observado contra o banco de verdade, um fake em memoria so reimplementaria a
 * mesma logica e nao provaria nada sobre a query do Spring Data.
 */
@SpringBootTest
class ChatServiceTest {

    private static final String ROOM_ID = "sala-de-teste-cap-250";

    @Autowired
    private ChatService chatService;

    @Autowired
    private ChatMessageRepository repository;

    @AfterEach
    void limpa() {
        repository.deleteByRoomId(ROOM_ID);
    }

    @Test
    void mantemNoMaximo250MensagensPorSala() {
        for (int i = 0; i < 253; i++) {
            chatService.save(ROOM_ID, "stable-id", "Fulano", "mensagem " + i);
        }

        assertEquals(250, repository.countByRoomId(ROOM_ID));
    }

    @Test
    void apagaAsMaisAntigasPrimeiro() {
        for (int i = 0; i < 252; i++) {
            chatService.save(ROOM_ID, "stable-id", "Fulano", "mensagem " + i);
        }

        List<ChatMessage> restantes = repository.findTop250ByRoomIdOrderByTimestampDesc(ROOM_ID);
        assertTrue(restantes.stream().noneMatch(m -> m.getText().equals("mensagem 0")),
                "a mais antiga (mensagem 0) deveria ter sido apagada");
        assertTrue(restantes.stream().anyMatch(m -> m.getText().equals("mensagem 251")),
                "a mais recente deveria continuar la");
    }
}
