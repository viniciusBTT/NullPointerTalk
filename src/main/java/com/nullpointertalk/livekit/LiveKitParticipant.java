package com.nullpointertalk.livekit;

/**
 * Participante conectado, do jeito que a sidebar precisa: quem e' (identity, pra
 * deduplicar e pra marcar "voce") e como chamar (name).
 *
 * De proposito NAO carrega estado de mic/camera. O ListParticipants devolve isso, mas
 * o canal em que o usuario esta e' renderizado a partir dos eventos do LiveKit no
 * proprio navegador - que sao instantaneos - e pros OUTROS canais um badge de mic
 * atrasado em 5s seria pior que nao ter badge nenhum.
 */
public record LiveKitParticipant(String identity, String name) {
}
