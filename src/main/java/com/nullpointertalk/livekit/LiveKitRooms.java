package com.nullpointertalk.livekit;

import java.util.List;
import java.util.Map;

/**
 * O pedaco da RoomService do LiveKit que a presenca usa.
 *
 * Existe como interface pra que o PresenceServiceTest possa injetar um fake escrito a
 * mao (cache, single-flight e degradacao sao a parte com regra de negocio de verdade, e
 * testar isso nao deveria exigir subir um LiveKit nem trazer uma lib de mock).
 */
public interface LiveKitRooms {

    /**
     * Salas que existem AGORA no LiveKit, mapeadas pro numero de participantes.
     *
     * Cuidado ao interpretar: uma sala em que ninguem nunca entrou esta AUSENTE do mapa,
     * e uma sala que acabou de esvaziar continua PRESENTE com 0 por até ~5 min (o
     * empty_timeout do LiveKit). Ou seja, filtre pela contagem, nao pela presenca da chave.
     *
     * O valor e' null quando a contagem veio ausente/ilegivel na resposta.
     */
    Map<String, Integer> listRooms();

    /** Participantes ativos de uma sala. */
    List<LiveKitParticipant> listParticipants(String roomId);

    /**
     * Apaga a sala no LiveKit, derrubando quem estiver conectado com
     * DisconnectReason.ROOM_DELETED (o cliente distingue isso de uma queda de rede
     * normal). Melhor esforco: uma sala que o LiveKit nunca criou (ninguem entrou ainda)
     * nao e' erro, so nao tem o que apagar.
     */
    void deleteRoom(String roomId);
}
