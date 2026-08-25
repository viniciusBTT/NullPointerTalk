package com.nullpointertalk.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Type;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/**
 * Prova de verdade de que o wire STOMP funciona de ponta a ponta - conecta em /ws/chat,
 * publica em /app/chat/{roomId} e confirma que /topic/room/{roomId} recebe a mesma
 * mensagem, agora persistida. Isso valida em particular que a conversao JSON funciona
 * (o projeto esta no Jackson 3 - tools.jackson - e nao no Jackson 2 classico, que e' o
 * que MappingJackson2MessageConverter espera).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChatControllerStompTest {

    private static final String TEST_ROOM_ID = "estudos";

    @LocalServerPort
    private int port;

    @Autowired
    private ChatMessageRepository repository;

    private StompSession session;

    @AfterEach
    void disconnect() {
        if (session != null && session.isConnected()) {
            session.disconnect();
        }
    }

    @Test
    void mensagemPublicadaChegaNoTopicoDaSalaEFicaPersistida() throws Exception {
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new JacksonJsonMessageConverter());

        session = stompClient.connectAsync("ws://localhost:" + port + "/ws/chat",
                new StompSessionHandlerAdapter() {
                }).get(5, TimeUnit.SECONDS);

        BlockingQueue<ChatMessageView> received = new LinkedBlockingQueue<>();
        session.subscribe("/topic/room/" + TEST_ROOM_ID, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return ChatMessageView.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                received.add((ChatMessageView) payload);
            }
        });

        String text = "mensagem de teste " + Instant.now().toEpochMilli();
        session.send("/app/chat/" + TEST_ROOM_ID,
                new ChatMessageRequest(text, "Fulano de Teste", "stable-id-teste"));

        ChatMessageView view = received.poll(5, TimeUnit.SECONDS);
        assertEquals(text, view != null ? view.text() : null, "a mensagem publicada deveria chegar no topico");
        assertEquals(TEST_ROOM_ID, view.roomId());
        assertEquals("stable-id-teste", view.stableId());

        List<ChatMessage> persisted = repository.findTop250ByRoomIdOrderByTimestampDesc(TEST_ROOM_ID);
        assertTrue(persisted.stream().anyMatch(m -> m.getText().equals(text)), "deveria ter sido salva no Mongo");

        repository.deleteById(view.id());
    }

    @Test
    void mensagemPraSalaDesconhecidaNaoQuebraASessaoNemDistribuiNada() throws Exception {
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new JacksonJsonMessageConverter());

        session = stompClient.connectAsync("ws://localhost:" + port + "/ws/chat",
                new StompSessionHandlerAdapter() {
                }).get(5, TimeUnit.SECONDS);

        BlockingQueue<ChatMessageView> received = new LinkedBlockingQueue<>();
        session.subscribe("/topic/room/sala-que-nao-existe", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return ChatMessageView.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                received.add((ChatMessageView) payload);
            }
        });

        session.send("/app/chat/sala-que-nao-existe",
                new ChatMessageRequest("nao deveria ir a lugar nenhum", "Fulano", "stable-id-teste"));

        assertEquals(null, received.poll(2, TimeUnit.SECONDS), "sala desconhecida nao deveria distribuir nada");
        assertTrue(session.isConnected(), "a sessao deveria continuar de pe apos o descarte silencioso");
    }
}
