package com.nullpointertalk.signaling;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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

        // Registrar o novo peer e ler o estado atual da sala precisam ser atomicos em relacao
        // a saida do ultimo peer de uma sala (afterConnectionClosed) - senao um join concorrente
        // com o fechamento da sala pode ficar "orfao": sua sessao entra no mapa da sala, mas a
        // sala e removida de `rooms` mesmo assim, e ninguem mais a descobre depois.
        Map<String, WebSocketSession> room;
        List<WebSocketSession> existingSessions;
        ArrayNode existingPeers = objectMapper.createArrayNode();
        synchronized (rooms) {
            room = rooms.computeIfAbsent(roomId, id -> new ConcurrentHashMap<>());
            room.forEach((existingPeerId, existingSession) -> {
                ObjectNode peer = objectMapper.createObjectNode();
                peer.put("peerId", existingPeerId);
                peer.put("name", (String) existingSession.getAttributes().get("name"));
                existingPeers.add(peer);
            });
            existingSessions = new ArrayList<>(room.values());
            // Registrar o peer antes de notificar os outros: se ficasse depois, uma mensagem
            // relayed (ex: offer) endereçada a este peerId poderia chegar entre a notificação e o
            // registro e ser descartada por handleTextMessage por nao encontrar a sessao ainda.
            room.put(peerId, session);
        }

        ObjectNode peersMessage = objectMapper.createObjectNode();
        peersMessage.put("type", "peers");
        peersMessage.set("peers", existingPeers);
        send(session, peersMessage);

        ObjectNode joinedMessage = objectMapper.createObjectNode();
        joinedMessage.put("type", "peer-joined");
        joinedMessage.put("peerId", peerId);
        joinedMessage.put("name", name);
        // Notifica só quem já estava na sala antes deste peer - a lista foi capturada antes do
        // put, então o próprio peer novo não recebe um "peer-joined" sobre si mesmo.
        existingSessions.forEach(existingSession -> send(existingSession, joinedMessage));
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
        String name = (String) session.getAttributes().get("name");
        if (roomId == null || peerId == null) {
            return;
        }

        boolean removed;
        List<WebSocketSession> remainingSessions;
        synchronized (rooms) {
            Map<String, WebSocketSession> room = rooms.get(roomId);
            if (room == null) {
                return;
            }

            // remove(key, value) só apaga a entrada se ela ainda apontar pra esta sessão -
            // evita que o close tardio de uma sessão morta (rede caiu, mas o servidor só
            // percebeu depois) expulse a sessão nova que já reconectou com o mesmo peerId.
            removed = room.remove(peerId, session);
            if (!removed) {
                return;
            }

            remainingSessions = new ArrayList<>(room.values());
            if (room.isEmpty()) {
                rooms.remove(roomId, room);
            }
        }

        ObjectNode leftMessage = objectMapper.createObjectNode();
        leftMessage.put("type", "peer-left");
        leftMessage.put("peerId", peerId);
        leftMessage.put("name", name);
        remainingSessions.forEach(remainingSession -> send(remainingSession, leftMessage));
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
