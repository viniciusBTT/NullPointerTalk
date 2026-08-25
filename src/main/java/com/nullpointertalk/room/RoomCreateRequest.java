package com.nullpointertalk.room;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * id vira, sem alteracao, segmento de URL, nome da sala no LiveKit e segmento de topico
 * STOMP - daí o regex de slug seguro em vez de aceitar qualquer string.
 */
public record RoomCreateRequest(
        @NotBlank @Pattern(regexp = "^[a-z0-9-]{1,32}$", message = "use apenas minusculas, numeros e hifen") String id,
        @NotBlank @Size(max = 60) String name,
        @NotBlank @Size(max = 32) String icon) {
}
