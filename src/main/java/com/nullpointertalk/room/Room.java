package com.nullpointertalk.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Sala persistida no Postgres. O id e' o slug (ex: "estudos") reaproveitado como esta
 * hoje - segmento de URL, nome da sala no LiveKit, e agora topico STOMP e chave de
 * localStorage no cliente - por isso e' a propria chave primaria, e nao uma surrogate
 * key: uma PK numerica exigiria um join id<->slug em todo lugar que ja usa o id como
 * string.
 */
@Entity
@Table(name = "rooms")
@Getter
@Setter
@NoArgsConstructor
public class Room {

    @Id
    @Column(length = 32)
    private String id;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(nullable = false, length = 32)
    private String icon;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public Room(String id, String name, String icon, Instant createdAt) {
        this.id = id;
        this.name = name;
        this.icon = icon;
        this.createdAt = createdAt;
    }
}
