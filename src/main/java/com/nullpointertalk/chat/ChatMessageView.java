package com.nullpointertalk.chat;

/** Forma que sai pelo topico STOMP e pelo endpoint REST de historico - as mesmas duas rotas. */
public record ChatMessageView(
        String id, String roomId, String stableId, String name, String text, String imageUrl, long timestamp) {

    static ChatMessageView of(ChatMessage message) {
        return new ChatMessageView(
                message.getId(),
                message.getRoomId(),
                message.getStableId(),
                message.getName(),
                message.getText(),
                message.getImageUrl(),
                message.getTimestamp().toEpochMilli());
    }
}
