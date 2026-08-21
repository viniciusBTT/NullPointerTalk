package com.nullpointertalk.livekit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class LiveKitUrlTest {

    @Test
    void convertesquemaWebSocketParaHttp() {
        assertEquals("http://localhost:7880", LiveKitRoomService.toHttpBaseUrl("ws://localhost:7880"));
        assertEquals("https://livekit.exemplo.com", LiveKitRoomService.toHttpBaseUrl("wss://livekit.exemplo.com"));
    }

    @Test
    void mantemUrlQueJaEhHttp() {
        assertEquals("http://localhost:7880", LiveKitRoomService.toHttpBaseUrl("http://localhost:7880"));
        assertEquals("https://livekit.exemplo.com", LiveKitRoomService.toHttpBaseUrl("https://livekit.exemplo.com"));
    }

    @Test
    void removeBarrasFinaisEEspacos() {
        assertEquals("https://livekit.exemplo.com", LiveKitRoomService.toHttpBaseUrl("wss://livekit.exemplo.com/"));
        assertEquals("https://livekit.exemplo.com", LiveKitRoomService.toHttpBaseUrl("  wss://livekit.exemplo.com//  "));
    }

    /**
     * A regressao que justifica startsWith+substring em vez de replace("ws","http"):
     * a forma ingenua transformaria isto em "wss://livekit.http-exemplo.com".
     */
    @Test
    void naoMutilaHostQueContemWsNoNome() {
        assertEquals("https://livekit.ws-exemplo.com",
                LiveKitRoomService.toHttpBaseUrl("wss://livekit.ws-exemplo.com"));
        assertEquals("http://ws.exemplo.com:7880",
                LiveKitRoomService.toHttpBaseUrl("ws://ws.exemplo.com:7880"));
    }

    @Test
    void recusaEsquemaDesconhecido() {
        assertThrows(IllegalArgumentException.class, () -> LiveKitRoomService.toHttpBaseUrl("localhost:7880"));
        assertThrows(IllegalArgumentException.class, () -> LiveKitRoomService.toHttpBaseUrl(""));
    }
}
