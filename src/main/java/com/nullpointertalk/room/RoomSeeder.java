package com.nullpointertalk.room;

import java.time.Instant;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** Garante as duas salas padrao do laboratorio na primeira subida (idempotente). */
@Component
public class RoomSeeder implements CommandLineRunner {

    private final RoomRepository repository;

    public RoomSeeder(RoomRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(String... args) {
        seed("estudos", "Estudos", "📚");
        seed("jogos", "Jogos", "🎮");
    }

    private void seed(String id, String name, String icon) {
        if (repository.existsById(id)) {
            return;
        }
        repository.save(new Room(id, name, icon, Instant.now()));
    }
}
