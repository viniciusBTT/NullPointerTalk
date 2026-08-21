/**
 * Quem o usuário é, do ponto de vista do LiveKit.
 *
 * A identity tem duas partes, `<userId>.<tabNonce>`, e as duas são necessárias:
 *
 *  - userId (uuid persistido): o LiveKit vê uma identity nova a cada F5 se ela for
 *    aleatória por page load, então a pessoa aparece duplicada na lista de presença até
 *    o servidor perceber que a conexão antiga morreu. É também a chave de volume por
 *    participante, "silenciar pra mim" e cor do avatar - tudo que precisa continuar
 *    valendo depois de recarregar.
 *
 *  - tabNonce: o LiveKit derruba o participante existente quando uma identity duplicada
 *    entra na mesma sala (DisconnectReason.DUPLICATE_IDENTITY). Sem o nonce, duas abas
 *    no mesmo canal ficariam se expulsando em loop.
 */

import { getPref, setPref, KEYS } from '../lib/prefs.js';

const SEPARATOR = '.';

function randomId() {
    // randomUUID exige contexto seguro (https ou localhost). Em http:// numa VPS sem
    // TLS ele simplesmente não existe, e aí o fallback evita quebrar a entrada na sala.
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedIdentity = null;

/** Id estável por navegador. Criado na primeira chamada e persistido. */
export function getStableUserId() {
    let id = getPref(KEYS.userId, null);
    if (typeof id !== 'string' || !id) {
        id = randomId();
        setPref(KEYS.userId, id);
    }
    return id;
}

/** Identity completa, calculada uma vez por aba. */
export function getIdentity() {
    if (!cachedIdentity) {
        cachedIdentity = `${getStableUserId()}${SEPARATOR}${randomId().slice(0, 8)}`;
    }
    return cachedIdentity;
}

/** Extrai o id estável de uma identity (própria ou de outro participante). */
export function stableIdOf(identity) {
    const text = String(identity ?? '');
    const at = text.indexOf(SEPARATOR);
    return at === -1 ? text : text.slice(0, at);
}

export function getDisplayName() {
    const name = getPref(KEYS.username, null);
    return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export function setDisplayName(name) {
    setPref(KEYS.username, String(name).trim());
}
