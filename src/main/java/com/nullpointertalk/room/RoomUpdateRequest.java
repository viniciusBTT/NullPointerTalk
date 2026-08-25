package com.nullpointertalk.room;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RoomUpdateRequest(
        @NotBlank @Size(max = 60) String name,
        @NotBlank @Size(max = 32) String icon) {
}
