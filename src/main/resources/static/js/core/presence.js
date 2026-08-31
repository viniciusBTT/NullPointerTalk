/**
 * Quem está em cada canal, pra sidebar.
 *
 * Divisão de responsabilidade que importa: o canal em que a pessoa ESTÁ é renderizado a
 * partir dos eventos do LiveKit no próprio navegador (instantâneos, de graça), via
 * setLive(). O polling serve só pros OUTROS canais. Isso tira o poll do caminho crítico
 * de latência - um intervalo de 5s nunca é percebido como lentidão, porque o canal que a
 * pessoa está olhando de perto nunca depende dele.
 */

const DEFAULT_INTERVAL_MS = 5000;
const BACKOFF_MS = [5000, 10_000, 20_000, 30_000];
const FAILURES_BEFORE_WARNING = 3;

export class Presence extends EventTarget {
    #endpoint;
    #intervalMs;
    #timer = null;
    #abort = null;
    #running = false;
    #failures = 0;

    /** roomId -> [{identity, name}] vindo do servidor */
    #polled = new Map();
    /** o canal conectado, que vem do LiveKit e ganha do polling */
    #liveRoomId = null;
    #liveParticipants = [];

    constructor({ endpoint = '/api/presence', intervalMs = DEFAULT_INTERVAL_MS } = {}) {
        super();
        this.#endpoint = endpoint;
        this.#intervalMs = intervalMs;
    }

    start() {
        if (this.#running) {
            return;
        }
        this.#running = true;
        // Aba em segundo plano não precisa saber quem entrou no canal de música. Volta a
        // pollar - com refresh imediato - quando a aba reaparece.
        document.addEventListener('visibilitychange', this.#onVisibilityChange);
        this.#tick();
    }

    stop() {
        this.#running = false;
        document.removeEventListener('visibilitychange', this.#onVisibilityChange);
        this.#cancelTimer();
        this.#abort?.abort();
        this.#abort = null;
    }

    /** Força uma leitura agora (usado logo depois de entrar/sair de um canal). */
    refresh() {
        if (!this.#running || document.hidden) {
            return;
        }
        this.#cancelTimer();
        this.#tick();
    }

    /** Verdade do LiveKit pro canal conectado. Sobrepõe o que o poll disser sobre ele. */
    setLive(roomId, participants) {
        this.#liveRoomId = roomId;
        this.#liveParticipants = participants ?? [];
        this.#publish();
    }

    get byRoom() {
        const merged = {};
        for (const [roomId, list] of this.#polled) {
            merged[roomId] = list;
        }
        if (this.#liveRoomId) {
            merged[this.#liveRoomId] = this.#liveParticipants.map((participant) => ({
                identity: participant.identity,
                stableId: participant.stableId,
                name: participant.name,
                speaking: participant.speaking,
                micOn: participant.micOn,
                isLocal: participant.isLocal,
                live: true,
            }));
        }
        return merged;
    }

    #onVisibilityChange = () => {
        if (document.hidden) {
            this.#cancelTimer();
            this.#abort?.abort();
        } else {
            this.refresh();
        }
    };

    async #tick() {
        if (!this.#running || document.hidden) {
            return;
        }
        // AbortController com prazo próprio: o servidor sempre responde 200, mas a rede
        // do cliente pode simplesmente pendurar.
        this.#abort?.abort();
        this.#abort = new AbortController();
        const deadline = setTimeout(() => this.#abort?.abort(), this.#intervalMs + 3000);

        try {
            const response = await fetch(this.#endpoint, {
                signal: this.#abort.signal,
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                throw new Error(`presença respondeu ${response.status}`);
            }
            const data = await response.json();
            this.#polled = new Map(Object.entries(data));
            // O servidor devolve 200 mesmo degradado; o header é quem conta a verdade.
            const stale = response.headers.get('X-Presence-Stale') === 'true';
            this.#failures = stale ? this.#failures + 1 : 0;
            this.#publish();
        } catch (error) {
            if (error?.name !== 'AbortError') {
                this.#failures++;
                // NUNCA esvazia as listas: mostrar "todo mundo saiu" é mentira ativa,
                // enquanto um dado de alguns segundos atrás é quase sempre verdade.
                this.#publish();
            }
        } finally {
            clearTimeout(deadline);
        }

        this.#scheduleNext();
    }

    #scheduleNext() {
        if (!this.#running || document.hidden) {
            return;
        }
        // setTimeout em cadeia, e não setInterval: com setInterval uma resposta lenta
        // empilharia requisições sobrepostas.
        const delay = this.#failures === 0
            ? this.#intervalMs
            : BACKOFF_MS[Math.min(this.#failures - 1, BACKOFF_MS.length - 1)];
        this.#timer = setTimeout(() => this.#tick(), delay);
    }

    #cancelTimer() {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
    }

    #publish() {
        this.dispatchEvent(new CustomEvent('presence', {
            detail: {
                byRoom: this.byRoom,
                degraded: this.#failures >= FAILURES_BEFORE_WARNING,
            },
        }));
    }
}
