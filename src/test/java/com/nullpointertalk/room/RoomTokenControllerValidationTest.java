package com.nullpointertalk.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * Regressao direta pro bug que motivou a validacao: identity/name sem @Size/@NotBlank
 * aceitavam qualquer coisa. Sem @Validated na classe (ver comentario em
 * RoomTokenController) - com ela, a violacao vira jakarta.validation.ConstraintViolationException
 * cru e a resposta e' 500, nao 400 - confirmado na pratica antes deste teste existir.
 *
 * java.net.http.HttpClient direto, mesma escolha ja usada em LiveKitRoomService: o
 * projeto nao tem TestRestTemplate no classpath (starters de teste modulares do Boot
 * 4.1, sem o pacote classico spring-boot-starter-test).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RoomTokenControllerValidationTest {

    @LocalServerPort
    private int port;

    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void identityEmBrancoDevolve400() throws Exception {
        HttpResponse<String> response = get("/room/estudos/token?identity=&name=Fulano");

        assertEquals(400, response.statusCode());
    }

    @Test
    void nomeMuitoLongoDevolve400() throws Exception {
        String nomeGigante = "x".repeat(200);
        HttpResponse<String> response = get("/room/estudos/token?identity=abc123&name=" + nomeGigante);

        assertEquals(400, response.statusCode());
    }

    @Test
    void identityValidaDevolve200ComTokenEUrl() throws Exception {
        HttpResponse<String> response = get("/room/estudos/token?identity=abc123&name=Fulano");

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"token\""));
        assertTrue(response.body().contains("\"url\""));
    }

    @Test
    void salaDesconhecidaDevolve404() throws Exception {
        HttpResponse<String> response = get("/room/nao-existe/token?identity=abc123&name=Fulano");

        assertEquals(404, response.statusCode());
    }
}
