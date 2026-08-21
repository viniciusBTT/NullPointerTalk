/**
 * A grade de vídeo. Só existe quando alguém está realmente transmitindo imagem - numa
 * conversa só de voz o chat ocupa a coluna inteira, como no Discord.
 *
 * O render é IDEMPOTENTE e dirigido por snapshot, não por delta: recebe a lista completa
 * e reconcilia. É o que permite jogar fora o Map "attachedVideoTracks" que o código antigo
 * mantinha só pra não anexar a mesma track duas vezes no mesmo <video>.
 */

import { createTile, updateTile, destroyTile } from './tile.js';

export function initStage({ root, onParticipantClick }) {
    /** key -> { element, view } */
    const tiles = new Map();
    let focusedKey = null;

    root.addEventListener('click', (event) => {
        const tile = event.target.closest('.tile');
        if (!tile) {
            return;
        }
        const { key, identity } = tile.dataset;
        if (tile.classList.contains('tile--avatar')) {
            onParticipantClick?.(identity, tile);
            return;
        }
        setFocused(focusedKey === key ? null : key);
    });

    function setFocused(key) {
        focusedKey = key;
        root.classList.toggle('stage--focused', key !== null);
        for (const [tileKey, entry] of tiles) {
            entry.element.classList.toggle('tile--focused', tileKey === key);
        }
    }

    /**
     * Uma pessoa pode aparecer em mais de um tile: a câmera dela e a tela dela são tiles
     * independentes (o código antigo tinha um <video> por participante, então tela
     * SUBSTITUÍA câmera e nunca dava pra ver as duas).
     */
    function buildViews({ participants, videoPubs }) {
        const views = new Map();
        const byIdentity = new Map(participants.map((p) => [p.identity, p]));

        for (const pub of videoPubs) {
            const participant = byIdentity.get(pub.identity);
            views.set(pub.key, {
                key: pub.key,
                kind: 'video',
                pub,
                identity: pub.identity,
                stableId: pub.stableId,
                name: pub.name,
                isLocal: pub.isLocal,
                source: pub.source,
                speaking: participant?.speaking ?? false,
                quality: participant?.quality ?? 'unknown',
                micOn: participant?.micOn ?? false,
                listeningAlong: participant?.listeningAlong ?? false,
            });
        }

        // Tiles de avatar só entram quando o stage já está visível. Numa chamada com
        // vídeo, mostrar quem está sem câmera completa a cena; numa chamada só de voz,
        // não faz sentido abrir um stage cheio de círculos - a sidebar já lista todos.
        if (views.size > 0) {
            const withVideo = new Set(videoPubs.map((pub) => pub.identity));
            for (const participant of participants) {
                if (withVideo.has(participant.identity)) {
                    continue;
                }
                const key = `${participant.identity}|avatar`;
                views.set(key, { ...participant, key, kind: 'avatar', source: 'avatar' });
            }
        }
        return views;
    }

    /** Tela primeiro, depois quem está falando, depois o resto. */
    function sortKeys(views) {
        const weight = (view) => {
            if (view.source === 'screen_share') return 0;
            if (view.kind === 'video' && view.speaking) return 1;
            if (view.kind === 'video') return 2;
            return 3;
        };
        return [...views.values()]
            .sort((a, b) => weight(a) - weight(b) || a.key.localeCompare(b.key))
            .map((view) => view.key);
    }

    function render({ participants, videoPubs }) {
        const views = buildViews({ participants, videoPubs });

        for (const [key, entry] of [...tiles]) {
            if (!views.has(key)) {
                // REMOVE, nunca esconde: com adaptiveStream ligado, o LiveKit registra o
                // <video> num IntersectionObserver e PAUSA a subscrição de um elemento em
                // display:none. Um tile escondido viraria uma track parada.
                destroyTile(entry.element, entry.view);
                tiles.delete(key);
            }
        }

        for (const [key, view] of views) {
            const existing = tiles.get(key);
            if (existing) {
                // Nunca re-anexa: a track de um tile é definida pelo par
                // (participante, fonte), que não muda enquanto a chave existir.
                updateTile(existing.element, view);
                existing.view = view;
            } else {
                tiles.set(key, { element: createTile(view), view });
            }
        }

        // Com menos de ~20 tiles, reordenar tudo com append é mais barato (e muito mais
        // simples) que calcular o conjunto mínimo de movimentos.
        for (const key of sortKeys(views)) {
            root.appendChild(tiles.get(key).element);
        }

        if (focusedKey && !views.has(focusedKey)) {
            setFocused(null);
        }

        const hasVideo = videoPubs.length > 0;
        root.classList.toggle('hidden', !hasVideo);
        return hasVideo;
    }

    function setSpeaking(identities) {
        const speaking = new Set(identities);
        for (const entry of tiles.values()) {
            const on = speaking.has(entry.view.identity);
            entry.view.speaking = on;
            entry.element.classList.toggle('tile--speaking', on);
        }
    }

    function clear() {
        for (const [key, entry] of [...tiles]) {
            destroyTile(entry.element, entry.view);
            tiles.delete(key);
        }
        setFocused(null);
        root.classList.add('hidden');
    }

    return { render, setSpeaking, clear };
}
