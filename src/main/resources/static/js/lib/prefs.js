/**
 * Acesso ao localStorage num só lugar. Antes as chaves eram literais espalhadas
 * ('npt.username' aparecia duplicada em home.js e room.js), o que é o tipo de coisa
 * que só dá problema no dia em que uma das duas cópias muda.
 *
 * Tudo é serializado como JSON, inclusive strings - assim getPref/setPref têm um
 * contrato único e não precisamos lembrar quais chaves são "cruas" e quais não.
 */

export const KEYS = {
    username: 'npt.username',
    userId: 'npt.userId',
    mic: 'npt.mic',
    deafened: 'npt.deafened',
    volumes: 'npt.volumes',
    mutedFor: 'npt.mutedFor',
    devices: 'npt.devices',
    sounds: 'npt.sounds',
};

/**
 * O localStorage pode lançar de verdade: modo privado do Safari, cota estourada,
 * ou navegador configurado pra bloquear armazenamento do site. Nenhum desses casos
 * justifica derrubar a aplicação - preferência é sempre "bom ter", nunca essencial.
 */
export function getPref(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function setPref(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // silencioso de propósito - ver comentário acima
    }
}

export function removePref(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // idem
    }
}

/** Lê uma entrada de um pref que é um objeto/mapa (volumes por participante, etc). */
export function getPrefEntry(key, entryKey, fallback = null) {
    const map = getPref(key, null);
    if (!map || typeof map !== 'object') {
        return fallback;
    }
    return Object.prototype.hasOwnProperty.call(map, entryKey) ? map[entryKey] : fallback;
}

/** Grava uma entrada num pref que é um objeto/mapa, preservando as outras. */
export function setPrefEntry(key, entryKey, value) {
    const map = getPref(key, null);
    const next = map && typeof map === 'object' ? { ...map } : {};
    if (value === null || value === undefined) {
        delete next[entryKey];
    } else {
        next[entryKey] = value;
    }
    setPref(key, next);
}
