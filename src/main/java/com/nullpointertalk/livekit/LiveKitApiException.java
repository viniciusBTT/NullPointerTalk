package com.nullpointertalk.livekit;

/** Falha ao falar com a RoomService do LiveKit (rede, timeout, auth ou erro Twirp). */
public class LiveKitApiException extends RuntimeException {

    public LiveKitApiException(String message) {
        super(message);
    }

    public LiveKitApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
