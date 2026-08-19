const ICE_RESTART_COOLDOWN_MS = 5000;

/**
 * Gerencia o mesh P2P: uma RTCPeerConnection por peer da sala.
 * O peer que acabou de entrar sempre inicia a oferta pros que já estavam lá
 * (evita oferta dupla/glare quando há mais de 2 participantes).
 */
export class PeerMesh {
    constructor({
        signaling,
        iceServers,
        localStream,
        onRemoteStream,
        onRemoteStreamRemoved,
        onPeerJoined,
        onPeerLeft,
        onPeerStateChange,
        onRemoteMediaState,
        getLocalMediaState,
    }) {
        this.signaling = signaling;
        this.iceServers = iceServers;
        this.localStream = localStream;
        this.onRemoteStream = onRemoteStream;
        this.onRemoteStreamRemoved = onRemoteStreamRemoved;
        this.onPeerJoined = onPeerJoined;
        this.onPeerLeft = onPeerLeft;
        this.onPeerStateChange = onPeerStateChange;
        this.onRemoteMediaState = onRemoteMediaState;
        this.getLocalMediaState = getLocalMediaState;
        this.connections = new Map();
        this.names = new Map();
        this.pendingCandidates = new Map();
        this.lastIceRestartAt = new Map();
        // Track "atual" de saída, separada de localStream: quando alguém já está
        // compartilhando tela (ou com áudio mixado) e um novo peer entra no meio, a nova
        // RTCPeerConnection precisa começar já com a track ativa, não com a câmera/mic original.
        this.currentAudioTrack = localStream.getAudioTracks()[0] ?? null;
        this.currentVideoTrack = localStream.getVideoTracks()[0] ?? null;

        signaling.on('peers', (message) => this.handlePeers(message));
        signaling.on('offer', (message) => this.handleOffer(message));
        signaling.on('answer', (message) => this.handleAnswer(message));
        signaling.on('ice-candidate', (message) => this.handleIceCandidate(message));
        signaling.on('peer-joined', (message) => this.handlePeerJoined(message));
        signaling.on('peer-left', (message) => this.handlePeerLeft(message));
        signaling.on('media-state', (message) => this.handleMediaState(message));
    }

    async handlePeers(message) {
        for (const peer of message.peers) {
            const pc = this.createConnection(peer.peerId, peer.name);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signaling.send({ type: 'offer', to: peer.peerId, sdp: offer });
            this.sendMediaStateTo(peer.peerId);
        }
    }

    async handleOffer(message) {
        const pc = this.createConnection(message.from, message.name);
        await pc.setRemoteDescription(message.sdp);
        await this.flushPendingCandidates(message.from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.send({ type: 'answer', to: message.from, sdp: answer });
        this.sendMediaStateTo(message.from);
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

    handlePeerJoined(message) {
        this.onPeerJoined?.(message.peerId, message.name);
    }

    handlePeerLeft(message) {
        const pc = this.connections.get(message.peerId);
        if (pc) {
            pc.close();
            this.connections.delete(message.peerId);
        }
        this.names.delete(message.peerId);
        this.pendingCandidates.delete(message.peerId);
        this.lastIceRestartAt.delete(message.peerId);
        this.onRemoteStreamRemoved(message.peerId);
        this.onPeerLeft?.(message.peerId, message.name);
    }

    handleMediaState(message) {
        this.onRemoteMediaState?.(message.from, message.audioEnabled, message.videoEnabled);
    }

    /** Manda meu estado atual de mic/câmera pra um peer específico (usado ao (re)conectar com ele). */
    sendMediaStateTo(peerId) {
        if (!this.getLocalMediaState) {
            return;
        }
        this.signaling.send({ type: 'media-state', to: peerId, ...this.getLocalMediaState() });
    }

    /** Avisa todo mundo já conectado que meu mic/câmera mudou (track.enabled é só local, não chega no remoto sozinho). */
    broadcastMediaState(state) {
        this.connections.forEach((_pc, peerId) => {
            this.signaling.send({ type: 'media-state', to: peerId, ...state });
        });
    }

    createConnection(peerId, name) {
        if (this.connections.has(peerId)) {
            return this.connections.get(peerId);
        }
        this.names.set(peerId, name);

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        // Usa a track atual (this.currentVideoTrack/currentAudioTrack), não localStream.getTracks()
        // direto - senão um peer que entra no meio de um compartilhamento de tela receberia a
        // câmera antiga em vez do que todo mundo já está vendo.
        if (this.currentAudioTrack) {
            pc.addTrack(this.currentAudioTrack, this.localStream);
        }
        if (this.currentVideoTrack) {
            pc.addTrack(this.currentVideoTrack, this.localStream);
        }

        pc.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.signaling.send({ type: 'ice-candidate', to: peerId, candidate: event.candidate });
            }
        });

        pc.addEventListener('track', (event) => {
            this.onRemoteStream(peerId, event.streams[0], this.names.get(peerId));
        });

        pc.addEventListener('iceconnectionstatechange', () => {
            this.onPeerStateChange?.(peerId, pc.iceConnectionState);
            // 'disconnected' costuma se autorrecuperar sozinho (soluço breve de rede);
            // só reinicia ICE em 'failed', pra não fazer renegociação à toa.
            if (pc.iceConnectionState === 'failed') {
                this.attemptIceRestart(peerId);
            }
        });
        pc.addEventListener('connectionstatechange', () => {
            this.onPeerStateChange?.(peerId, pc.connectionState);
        });

        this.connections.set(peerId, pc);
        return pc;
    }

    /** Reinicia a negociação ICE com um peer cuja conexão falhou (ex: troca de rede no meio da chamada). */
    async attemptIceRestart(peerId) {
        const lastAttempt = this.lastIceRestartAt.get(peerId) ?? 0;
        if (performance.now() - lastAttempt < ICE_RESTART_COOLDOWN_MS) {
            return; // evita restart em loop se o estado oscilar entre failed/disconnected
        }
        this.lastIceRestartAt.set(peerId, performance.now());

        const pc = this.connections.get(peerId);
        if (!pc) {
            return;
        }
        pc.restartIce();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.signaling.send({ type: 'offer', to: peerId, sdp: offer });
    }

    /** Troca a track de vídeo em todas as conexões (usado pelo compartilhamento de tela e troca de câmera). */
    replaceVideoTrack(newTrack) {
        this.currentVideoTrack = newTrack;
        this.connections.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
    }

    /** Troca a track de áudio em todas as conexões (usado ao trocar de microfone e ao mixar áudio da tela). */
    replaceAudioTrack(newTrack) {
        this.currentAudioTrack = newTrack;
        this.connections.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
    }

    /** Fecha todas as conexões atuais sem mexer nos listeners de sinalização - usado ao reconectar o WebSocket. */
    resetForReconnect() {
        this.closeAll();
    }

    closeAll() {
        this.connections.forEach((pc) => pc.close());
        this.connections.clear();
        this.names.clear();
        this.pendingCandidates.clear();
        this.lastIceRestartAt.clear();
    }
}
