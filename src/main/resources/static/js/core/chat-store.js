/**
 * Buffer de mensagens em memória, por canal.
 *
 * O chat do LiveKit é um pacote de dados transmitido pra quem está conectado NAQUELE
 * momento - não existe histórico nem entrega posterior. Isso significa que:
 *
 *  - não há como mostrar o que foi dito antes de entrar;
 *  - não há como acumular não-lidas de um canal em que a pessoa não está, porque os
 *    pacotes simplesmente não chegam ao navegador dela.
 *
 * O que este buffer resolve é mais modesto e ainda vale: pular entre canais durante a
 * mesma sessão não apaga o que já foi visto. Nada é persistido no localStorage de
 * propósito - guardar isso seria fingir um histórico impossível de manter coerente.
 */

const MAX_PER_CHANNEL = 200;

export class ChatStore extends EventTarget {
    /** roomId -> Message[] */
    #byRoom = new Map();
    /** roomId -> número de mensagens não lidas */
    #unread = new Map();

    append(roomId, message) {
        const list = this.#byRoom.get(roomId) ?? [];
        // Deduplica por id: o eco local e um reenvio do SDK poderiam chegar duas vezes.
        if (message.id && list.some((existing) => existing.id === message.id)) {
            return;
        }
        list.push(message);
        if (list.length > MAX_PER_CHANNEL) {
            list.splice(0, list.length - MAX_PER_CHANNEL);
        }
        this.#byRoom.set(roomId, list);

        this.dispatchEvent(new CustomEvent('message', { detail: { roomId, message } }));
    }

    messages(roomId) {
        return this.#byRoom.get(roomId) ?? [];
    }

    /** Incrementa o contador de não-lidas. Quem decide se conta é a UI (painel fechado etc). */
    markUnread(roomId) {
        const next = (this.#unread.get(roomId) ?? 0) + 1;
        this.#unread.set(roomId, next);
        this.dispatchEvent(new CustomEvent('unread', { detail: { roomId, count: next } }));
    }

    markRead(roomId) {
        if (!this.#unread.get(roomId)) {
            return;
        }
        this.#unread.set(roomId, 0);
        this.dispatchEvent(new CustomEvent('unread', { detail: { roomId, count: 0 } }));
    }

    unread(roomId) {
        return this.#unread.get(roomId) ?? 0;
    }
}
