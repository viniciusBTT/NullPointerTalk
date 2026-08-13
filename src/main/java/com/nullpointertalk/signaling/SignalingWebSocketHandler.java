package com.nullpointertalk.signaling;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Relay de sinalizacao WebRTC (offer/answer/ice-candidate) entre peers da mesma sala.
 * Nunca interpreta o conteudo de sdp/candidate - so repassa para o peer alvo (campo "to").
 */
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, Map<String, WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Map<String, String> query = parseQuery(session);
        String roomId = query.get("roomId");
        String peerId = query.get("peerId");
        String name = query.getOrDefault("name", "Anonimo");

        if (roomId == null || peerId == null) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        session.getAttributes().put("roomId", roomId);
        session.getAttributes().put("peerId", peerId);
        session.getAttributes().put("name", name);

        Map<String, WebSocketSession> room = rooms.computeIfAbsent(roomId, id -> new ConcurrentHashMap<>());

        ArrayNode existingPeers = objectMapper.createArrayNode();
        room.forEach((existingPeerId, existingSession) -> {
            ObjectNode peer = objectMapper.createObjectNode();
            peer.put("peerId", existingPeerId);
            peer.put("name", (String) existingSession.getAttributes().get("name"));
            existingPeers.add(peer);
        });

        ObjectNode peersMessage = objectMapper.createObjectNode();
        peersMessage.put("type", "peers");
        peersMessage.set("peers", existingPeers);
        send(session, peersMessage);

        ObjectNode joinedMessage = objectMapper.createObjectNode();
        joinedMessage.put("type", "peer-joined");
        joinedMessage.put("peerId", peerId);
        joinedMessage.put("name", name);
        broadcast(room, joinedMessage);

        room.put(peerId, session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String roomId = (String) session.getAttributes().get("roomId");
        String peerId = (String) session.getAttributes().get("peerId");
        String name = (String) session.getAttributes().get("name");
        Map<String, WebSocketSession> room = rooms.get(roomId);
        if (room == null) {
            return;
        }

        JsonNode parsed = objectMapper.readTree(message.getPayload());
        if (!(parsed instanceof ObjectNode payload)) {
            return;
        }

        String targetPeerId = payload.path("to").asText(null);
        if (targetPeerId == null) {
            return;
        }

        WebSocketSession targetSession = room.get(targetPeerId);
        if (targetSession == null || !targetSession.isOpen()) {
            return;
        }

        payload.put("from", peerId);
        payload.put("name", name);
        send(targetSession, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = (String) session.getAttributes().get("roomId");
        String peerId = (String) session.getAttributes().get("peerId");
        if (roomId == null || peerId == null) {
            return;
        }

        Map<String, WebSocketSession> room = rooms.get(roomId);
        if (room == null) {
            return;
        }

        room.remove(peerId);

        ObjectNode leftMessage = objectMapper.createObjectNode();
        leftMessage.put("type", "peer-left");
        leftMessage.put("peerId", peerId);
        broadcast(room, leftMessage);

        if (room.isEmpty()) {
            rooms.remove(roomId, room);
        }
    }

    private void broadcast(Map<String, WebSocketSession> room, JsonNode message) {
        room.values().forEach(session -> send(session, message));
    }

    private void send(WebSocketSession session, JsonNode message) {
        if (!session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao enviar mensagem de sinalizacao", e);
        }
    }

    private Map<String, String> parseQuery(WebSocketSession session) {
        Map<String, String> params = new ConcurrentHashMap<>();
        String query = session.getUri() == null ? null : session.getUri().getQuery();
        if (query == null || query.isBlank()) {
            return params;
        }
        for (String pair : query.split("&")) {
            int separatorIndex = pair.indexOf('=');
            if (separatorIndex < 0) {
                continue;
            }
            String key = URLDecoder.decode(pair.substring(0, separatorIndex), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(separatorIndex + 1), StandardCharsets.UTF_8);
            params.put(key, value);
        }
        return params;
    }
}
