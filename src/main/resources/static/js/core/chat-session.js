/**
 * Transporte do chat: STOMP sobre WebSocket, independente do ciclo de vida da voz.
 *
 * Ao contrário da versão anterior (chat pelo canal de dados do LiveKit, só recebido por
 * quem estava conectado NAQUELE canal), esta sessão assina o tópico de TODAS as salas do
 * catálogo já na conexão, mais /topic/room-catalog (CRUD de salas) - é o que permite
 * badge de não-lida em salas onde a pessoa não está com a voz conectada. O painel de
 * chat visível continua 1:1 com a sala atualmente ativa; só a camada de assinatura fica
 * desacoplada da voz.
 *
 * window.StompJs vem de um <script> comum (não módulo) carregado em shell.html ANTES do
 * app.js - ver js/vendor/README.md.
 */

export class ChatSession extends EventTarget {
    #client = null;
    #subscriptions = new Map();
    #roomIds;
    #connected = false;

    constructor({ roomIds }) {
        super();
        this.#roomIds = new Set(roomIds);
    }

    connect() {
        this.#client = new window.StompJs.Client({
            brokerURL: this.#wsUrl(),
            reconnectDelay: 4000,
            onConnect: () => {
                this.#connected = true;
                this.#subscribeCatalog();
                this.#roomIds.forEach((roomId) => this.#doSubscribe(roomId));
                this.dispatchEvent(new CustomEvent('connected'));
            },
            onWebSocketClose: () => {
                this.#connected = false;
                this.#subscriptions.clear();
            },
        });
        this.#client.activate();
    }

    #wsUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws/chat`;
    }

    subscribeRoom(roomId) {
        this.#roomIds.add(roomId);
        if (this.#connected) {
            this.#doSubscribe(roomId);
        }
    }

    unsubscribeRoom(roomId) {
        this.#roomIds.delete(roomId);
        this.#subscriptions.get(roomId)?.unsubscribe();
        this.#subscriptions.delete(roomId);
    }

    #doSubscribe(roomId) {
        if (this.#subscriptions.has(roomId)) {
            return;
        }
        const subscription = this.#client.subscribe(`/topic/room/${roomId}`, (frame) => {
            const message = JSON.parse(frame.body);
            this.dispatchEvent(new CustomEvent('message', { detail: { roomId, message } }));
        });
        this.#subscriptions.set(roomId, subscription);
    }

    #subscribeCatalog() {
        this.#client.subscribe('/topic/room-catalog', (frame) => {
            const event = JSON.parse(frame.body);
            this.dispatchEvent(new CustomEvent('roomcatalog', { detail: event }));
        });
    }

    send(roomId, { text, name, stableId }) {
        if (!this.#connected) {
            throw new Error('Chat desconectado, tente novamente em instantes.');
        }
        this.#client.publish({
            destination: `/app/chat/${roomId}`,
            body: JSON.stringify({ text, name, stableId }),
        });
    }
}
