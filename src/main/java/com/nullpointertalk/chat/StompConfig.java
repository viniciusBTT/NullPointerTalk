package com.nullpointertalk.chat;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP sobre WebSocket pro chat de texto. Endpoint same-origin (o app Thymeleaf fala
 * consigo mesmo), entao o handshake padrao do Spring ja basta - sem setAllowedOriginPatterns.
 *
 * Sem SockJS de proposito: o projeto ja nao tem nenhuma concessao a navegador antigo em
 * lugar nenhum (o proprio LiveKit ja exige WebSocket nativo pra sinalizacao), entao
 * vendorizar uma segunda lib so pra um fallback que nada mais no app precisa nao compensa.
 */
@Configuration
@EnableWebSocketMessageBroker
public class StompConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
