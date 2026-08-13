/**
 * Wrapper fino sobre WebSocket nativo para trocar offer/answer/ICE candidates
 * com o SignalingWebSocketHandler do backend (/ws/signaling).
 */
export class SignalingSocket {
    constructor({ roomId, peerId, name }) {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const params = new URLSearchParams({ roomId, peerId, name });
        this.socket = new WebSocket(`${protocol}://${window.location.host}/ws/signaling?${params}`);
        this.listeners = new Map();

        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const handler = this.listeners.get(message.type);
            if (handler) {
                handler(message);
            }
        });
    }

    on(type, handler) {
        this.listeners.set(type, handler);
    }

    onOpen(handler) {
        this.socket.addEventListener('open', handler);
    }

    onClose(handler) {
        this.socket.addEventListener('close', handler);
    }

    send(message) {
        this.socket.send(JSON.stringify(message));
    }

    close() {
        this.socket.close();
    }
}
