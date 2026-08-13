/**
 * Gerencia o mesh P2P: uma RTCPeerConnection por peer da sala.
 * O peer que acabou de entrar sempre inicia a oferta pros que já estavam lá
 * (evita oferta dupla/glare quando há mais de 2 participantes).
 */
export class PeerMesh {
    constructor({ signaling, iceServerUrl, localStream, onRemoteStream, onRemoteStreamRemoved }) {
        this.signaling = signaling;
        this.iceServers = [{ urls: iceServerUrl }];
        this.localStream = localStream;
        this.onRemoteStream = onRemoteStream;
        this.onRemoteStreamRemoved = onRemoteStreamRemoved;
        this.connections = new Map();
        this.names = new Map();
        this.pendingCandidates = new Map();

        signaling.on('peers', (message) => this.handlePeers(message));
        signaling.on('offer', (message) => this.handleOffer(message));
        signaling.on('answer', (message) => this.handleAnswer(message));
        signaling.on('ice-candidate', (message) => this.handleIceCandidate(message));
        signaling.on('peer-left', (message) => this.handlePeerLeft(message));
    }

    async handlePeers(message) {
        for (const peer of message.peers) {
            const pc = this.createConnection(peer.peerId, peer.name);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signaling.send({ type: 'offer', to: peer.peerId, sdp: offer });
        }
    }

    async handleOffer(message) {
        const pc = this.createConnection(message.from, message.name);
        await pc.setRemoteDescription(message.sdp);
        await this.flushPendingCandidates(message.from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.send({ type: 'answer', to: message.from, sdp: answer });
    }

    async handleAnswer(message) {
        const pc = this.connections.get(message.from);
        if (!pc) {
            return;
        }
        await pc.setRemoteDescription(message.sdp);
        await this.flushPendingCandidates(message.from);
    }

    async handleIceCandidate(message) {
        const pc = this.connections.get(message.from);
        if (!pc || !message.candidate) {
            return;
        }
        if (pc.remoteDescription) {
            await pc.addIceCandidate(message.candidate);
        } else {
            const queue = this.pendingCandidates.get(message.from) ?? [];
            queue.push(message.candidate);
            this.pendingCandidates.set(message.from, queue);
        }
    }

    async flushPendingCandidates(peerId) {
        const queue = this.pendingCandidates.get(peerId);
        if (!queue) {
            return;
        }
        const pc = this.connections.get(peerId);
        for (const candidate of queue) {
            await pc.addIceCandidate(candidate);
        }
        this.pendingCandidates.delete(peerId);
    }

    handlePeerLeft(message) {
        const pc = this.connections.get(message.peerId);
        if (pc) {
            pc.close();
            this.connections.delete(message.peerId);
        }
        this.names.delete(message.peerId);
        this.pendingCandidates.delete(message.peerId);
        this.onRemoteStreamRemoved(message.peerId);
    }

    createConnection(peerId, name) {
        if (this.connections.has(peerId)) {
            return this.connections.get(peerId);
        }
        this.names.set(peerId, name);

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));

        pc.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.signaling.send({ type: 'ice-candidate', to: peerId, candidate: event.candidate });
            }
        });

        pc.addEventListener('track', (event) => {
            this.onRemoteStream(peerId, event.streams[0], this.names.get(peerId));
        });

        this.connections.set(peerId, pc);
        return pc;
    }

    /** Troca a track de vídeo em todas as conexões (usado pelo compartilhamento de tela). */
    replaceVideoTrack(newTrack) {
        this.connections.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
    }

    /** Troca a track de áudio em todas as conexões (usado ao trocar de microfone). */
    replaceAudioTrack(newTrack) {
        this.connections.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
    }

    closeAll() {
        this.connections.forEach((pc) => pc.close());
        this.connections.clear();
        this.names.clear();
        this.pendingCandidates.clear();
    }
}
