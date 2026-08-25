package com.nullpointertalk.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload que o cliente publica em /app/chat/{roomId}. */
public record ChatMessageRequest(
        @NotBlank @Size(max = 500) String text,
        @NotBlank @Size(max = 60) String name,
        @NotBlank @Size(max = 100) String stableId) {
}
