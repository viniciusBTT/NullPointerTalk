package com.nullpointertalk.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload que o cliente publica em /app/chat/{roomId}. text não é mais @NotBlank: uma
 * mensagem pode ser só uma imagem - quem garante que pelo menos um dos dois (text ou
 * imageUrl) veio preenchido é o ChatController, não bean validation.
 */
public record ChatMessageRequest(
        @Size(max = 500) String text,
        @NotBlank @Size(max = 60) String name,
        @NotBlank @Size(max = 100) String stableId,
        @Size(max = 200) String imageUrl) {
}
