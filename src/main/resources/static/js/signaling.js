const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 16000;

/**
 * Wrapper fino sobre WebSocket nativo para trocar offer/answer/ICE candidates
 * com o SignalingWebSocketHandler do backend (/ws/signaling).
 *
 * Reconecta sozinho com backoff exponencial se a conexão cair sem ter sido um
 * close() intencional (ex: queda de rede, ngrok reiniciando o túnel) - o servidor
 * manda a lista de peers de novo na reconexão (afterConnectionEstablished trata
 * como uma sessão nova), então quem usa esta classe (room.js) só precisa recriar
 * o mesh local quando `onOpen` disparar de novo.
 */
export class SignalingSocket {
    constructor({ roomId, peerId, name }) {
        this.roomId = roomId;
        this.peerId = peerId;
        this.name = name;
        this.listeners = new Map();
        this.openHandlers = [];
        this.closeHandlers = [];
        this.reconnectAttemptHandlers = [];
        this.reconnectFailedHandlers = [];
        this.intentionalClose = false;
        this.reconnectAttempt = 0;
        this.reconnectTimer = null;

        this._connect();
    }

    _connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const params = new URLSearchParams({ roomId: this.roomId, peerId: this.peerId, name: this.name });
        this.socket = new WebSocket(`${protocol}://${window.location.host}/ws/signaling?${params}`);

        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const handler = this.listeners.get(message.type);
            if (handler) {
                handler(message);
            }
        });

        this.socket.addEventListener('open', () => {
            this.reconnectAttempt = 0;
            this.openHandlers.forEach((handler) => handler());
        });

        this.socket.addEventListener('close', () => {
            this.closeHandlers.forEach((handler) => handler());
            if (!this.intentionalClose) {
                this.scheduleReconnect();
            }
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            this.reconnectFailedHandlers.forEach((handler) => handler());
            return;
        }
        this.reconnectAttempt += 1;
        const delayMs = Math.min(
            BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempt - 1),
            MAX_RECONNECT_DELAY_MS,
        );
        this.reconnectAttemptHandlers.forEach((handler) => handler(this.reconnectAttempt, delayMs));
        this.reconnectTimer = setTimeout(() => this._connect(), delayMs);
    }

    on(type, handler) {
        this.listeners.set(type, handler);
    }

    onOpen(handler) {
        this.openHandlers.push(handler);
    }

    onClose(handler) {
        this.closeHandlers.push(handler);
    }

    /** handler(attempt, delayMs) - chamado antes de cada nova tentativa de reconexão. */
    onReconnectAttempt(handler) {
        this.reconnectAttemptHandlers.push(handler);
    }

    /** Chamado quando MAX_RECONNECT_ATTEMPTS se esgota sem sucesso. */
    onReconnectFailed(handler) {
        this.reconnectFailedHandlers.push(handler);
    }

    send(message) {
        this.socket.send(JSON.stringify(message));
    }

    close() {
        this.intentionalClose = true;
        clearTimeout(this.reconnectTimer);
        this.socket.close();
    }
}
