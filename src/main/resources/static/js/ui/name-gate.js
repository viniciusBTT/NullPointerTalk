/**
 * Porta de entrada: sem login, só um nome pra identificar a pessoa nos canais.
 *
 * Bloqueia a aplicação enquanto não há nome, porque o token do LiveKit é emitido com ele
 * — entrar num canal sem nome não é um estado possível.
 */

import { getDisplayName, setDisplayName } from '../core/identity.js';

export function initNameGate({ root, form, input, onSubmit }) {
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
            return;
        }
        setDisplayName(name);
        hide();
        onSubmit(name);
    });

    function show({ current = null } = {}) {
        input.value = current ?? '';
        root.classList.remove('hidden');
        input.focus();
        input.select();
    }

    function hide() {
        root.classList.add('hidden');
    }

    /** true se já havia nome guardado (a aplicação pode seguir direto). */
    function ensureName() {
        const stored = getDisplayName();
        if (stored) {
            return stored;
        }
        show();
        return null;
    }

    return { show, hide, ensureName };
}
