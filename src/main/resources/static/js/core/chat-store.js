/**
 * Cache de mensagens em memória, por canal, agora alimentado a partir do backend.
 *
 * O historico ja e' persistido (STOMP + MongoDB, ultimas 250 por sala - ver
 * ChatHistoryController/ChatController no backend). Este cache deixou de ser a UNICA
 * fonte de verdade: ensureHistory() busca o que ja foi dito antes de entrar, e as
 * mensagens que chegam ao vivo via ChatSession sao acrescentadas por append() - a mesma
 * dedup por id de sempre cobre a sobreposicao entre as duas (uma mensagem podia chegar
 * ao vivo enquanto o fetch do historico ainda estava em voo).
 *
 * O contador de nao-lidas ainda vive so em memoria aqui, mas o que decide "desde quando"
 * contar passou a ser um timestamp persistido em localStorage (lib/prefs.js,
 * KEYS.chatLastRead) - e' isso que faz o badge sobreviver a um reload.
 */

import { getPrefEntry, setPrefEntry, KEYS } from '../lib/prefs.js';
import { getStableUserId } from './identity.js';

const MAX_PER_CHANNEL = 250;

export class ChatStore extends EventTarget {
    /** roomId -> Message[] */
    #byRoom = new Map();
    /** roomId -> número de mensagens não lidas */
    #unread = new Map();
    /** roomId -> Promise, pra nao buscar o historico duas vezes na mesma sessao. */
    #historyLoads = new Map();

    /**
     * Devolve a mensagem guardada (com isLocal calculado), ou undefined se era uma
     * duplicata já conhecida - quem chama usa o valor de retorno pra saber se há algo
     * NOVO pra renderizar/contar (ex: não re-desenhar uma mensagem que já estava na tela).
     */
    append(roomId, message) {
        const list = this.#byRoom.get(roomId) ?? [];
        // Deduplica por id: a mesma mensagem pode chegar tanto pelo fetch de historico
        // quanto ao vivo via STOMP, se as duas correrem em paralelo.
        if (message.id && list.some((existing) => existing.id === message.id)) {
            return undefined;
        }
        const stored = { ...message, isLocal: message.stableId === getStableUserId() };
        list.push(stored);
        list.sort((a, b) => a.timestamp - b.timestamp);
        if (list.length > MAX_PER_CHANNEL) {
            list.splice(0, list.length - MAX_PER_CHANNEL);
        }
        this.#byRoom.set(roomId, list);

        this.dispatchEvent(new CustomEvent('message', { detail: { roomId, message: stored } }));
        return stored;
    }

    messages(roomId) {
        return this.#byRoom.get(roomId) ?? [];
    }

    /** Timestamp (ms) da mensagem mais recente conhecida da sala, ou 0 se nao ha nenhuma. */
    lastTimestamp(roomId) {
        const list = this.#byRoom.get(roomId);
        return list && list.length ? list[list.length - 1].timestamp : 0;
    }

    /** Busca o historico do backend uma vez por sessao; no-op em chamadas seguintes. */
    async ensureHistory(roomId) {
        if (!this.#historyLoads.has(roomId)) {
            this.#historyLoads.set(roomId, this.#loadHistory(roomId));
        }
        return this.#historyLoads.get(roomId);
    }

    async #loadHistory(roomId) {
        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`);
            if (!response.ok) {
                return;
            }
            const history = await response.json();
            history.forEach((message) => this.append(roomId, message));
        } catch (error) {
            console.error('Falha ao carregar historico do chat', error);
        }
    }

    /** Incrementa o contador de não-lidas. Quem decide se conta é a UI (painel fechado etc). */
    markUnread(roomId) {
        const next = (this.#unread.get(roomId) ?? 0) + 1;
        this.#unread.set(roomId, next);
        this.dispatchEvent(new CustomEvent('unread', { detail: { roomId, count: next } }));
    }

    /** Usado so na carga inicial (boot), pra semear o contador sem passar por markUnread um a um. */
    seedUnread(roomId, count) {
        if (!count) {
            return;
        }
        this.#unread.set(roomId, count);
        this.dispatchEvent(new CustomEvent('unread', { detail: { roomId, count } }));
    }

    /**
     * Marca como lido e persiste ATE ONDE - o timestamp da mensagem mais recente
     * conhecida, e nao Date.now(): o numero vem do proprio relogio do servidor (gravado em
     * ChatService.save), entao comparar contra timestamps futuros tambem do servidor fica
     * imune a desincronia entre o relogio do navegador e o do backend.
     */
    markRead(roomId, lastMessageTimestampMs = this.lastTimestamp(roomId)) {
        setPrefEntry(KEYS.chatLastRead, roomId, lastMessageTimestampMs);
        if (!this.#unread.get(roomId)) {
            return;
        }
        this.#unread.set(roomId, 0);
        this.dispatchEvent(new CustomEvent('unread', { detail: { roomId, count: 0 } }));
    }

    lastRead(roomId) {
        return getPrefEntry(KEYS.chatLastRead, roomId, 0);
    }

    unread(roomId) {
        return this.#unread.get(roomId) ?? 0;
    }
}
