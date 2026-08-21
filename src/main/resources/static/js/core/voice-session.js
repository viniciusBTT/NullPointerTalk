/**
 * Ciclo de vida da conexão de voz. É o ÚNICO módulo que importa o SDK do LiveKit.
 *
 * Todo o resto conversa com isto por eventos (é um EventTarget) e por objetos de visão
 * simples — ParticipantView e PubView. As tracks de verdade nunca vazam: o PubView
 * carrega closures attach/detach/setVolume, então a UI consegue plugar uma track num
 * <video> sem nunca ter tocado no SDK. Isso é o que mantém a regra "só este arquivo
 * conhece o LiveKit" verificável de relance, em vez de por revisão.
 */

import {
    Room,
    RoomEvent,
    Track,
    DisconnectReason,
} from '../vendor/livekit-client.esm.min.js';
import { getScreenStream, getTabAudioStream } from '../lib/screenshare.js';
import { stopStream } from '../lib/media.js';
import { stableIdOf } from './identity.js';

const LISTEN_ALONG_TRACK_NAME = 'listen_along_audio';

/** Fontes de vídeo que ganham tile próprio. Câmera e tela são tiles independentes. */
const VIDEO_SOURCES = new Set([Track.Source.Camera, Track.Source.ScreenShare]);

export class VoiceSession extends EventTarget {
    #localMedia;
    #identity;
    #displayName;

    #room = null;
    #roomId = null;
    #state = 'idle';

    /**
     * Intenção do usuário, e não estado de uma sala: quem entra com o mic mutado
     * continua mutado depois de trocar de canal. É o que faz a troca de canal parecer
     * navegação e não uma nova sessão.
     */
    #desired = { mic: true, camera: false, screen: false, listenAlong: false };

    #screenStream = null;
    #listenAlongStream = null;

    /**
     * Contador de geração + fila. Clicar em três canais em sequência rápida tem que
     * conectar só no último, e sem deixar socket órfão: cada etapa assíncrona confere se
     * ainda é a geração corrente e desiste em silêncio se não for.
     */
    #generation = 0;
    #abort = null;
    #queue = Promise.resolve();

    #qualityByIdentity = new Map();
    #speakingIdentities = new Set();
    #snapshotQueued = false;

    constructor({ localMedia, identity, displayName }) {
        super();
        this.#localMedia = localMedia;
        this.#identity = identity;
        this.#displayName = displayName;

        // Uma track local que morre (fone USB arrancado) tem que sair do ar, senão
        // continua publicada transmitindo silêncio.
        this.#localMedia.addEventListener('ended', (event) => {
            const { kind } = event.detail;
            if (kind === 'audio') {
                this.#emit('error', { scope: 'media', message: 'O microfone foi desconectado.' });
            } else if (this.#desired.camera) {
                this.#desired.camera = false;
                this.#emitLocalState();
                this.#emit('error', { scope: 'media', message: 'A câmera foi desconectada.' });
            }
        });

        // Trocar de microfone com a publicação no ar: replaceTrack troca a track por
        // baixo sem republicar, então os outros participantes não veem nada piscar.
        this.#localMedia.addEventListener('trackchange', (event) => {
            const { kind, track } = event.detail;
            const source = kind === 'audio' ? Track.Source.Microphone : Track.Source.Camera;
            const publication = this.#room?.localParticipant.getTrackPublication(source);
            publication?.track?.replaceTrack(track).catch((error) => {
                console.error('Falha ao trocar a track publicada', error);
            });
        });
    }

    get state() {
        return this.#state;
    }

    /**
     * Trocar o nome de exibição sem reconectar. O token do LiveKit carrega o nome, mas
     * setName propaga a mudança pelos participantes já conectados, então não vale
     * derrubar a conexão só por isso — o token só importa na próxima entrada.
     */
    async setDisplayName(name) {
        this.#displayName = name;
        try {
            await this.#room?.localParticipant?.setName(name);
        } catch (error) {
            console.error('Falha ao propagar o novo nome', error);
        }
        this.#scheduleSnapshot();
    }

    get roomId() {
        return this.#roomId;
    }

    get localState() {
        return { ...this.#desired };
    }

    get canPlaybackAudio() {
        return this.#room ? this.#room.canPlaybackAudio : true;
    }

    get participants() {
        if (!this.#room || this.#state !== 'connected') {
            return [];
        }
        return this.#allParticipants().map((participant) => this.#participantView(participant));
    }

    get videoPubs() {
        return this.#publications((pub) => pub.kind === Track.Kind.Video && VIDEO_SOURCES.has(pub.source));
    }

    get audioPubs() {
        return this.#publications((pub) => pub.kind === Track.Kind.Audio);
    }

    // ---------------------------------------------------------------- entrar / sair

    /**
     * Entrar num canal e TROCAR de canal são o mesmo caminho — não existe switch()
     * separado, porque toda a diferença entre os dois é o teardown que o #doJoin já faz
     * de qualquer forma.
     *
     * O prelúdio abaixo é sincrônico de propósito: ele roda antes de qualquer await, o
     * que garante que N cliques rápidos sejam ordenados de forma determinística e que a
     * sidebar marque o canal novo imediatamente.
     */
    join(roomId) {
        if (roomId === this.#roomId && (this.#state === 'joining' || this.#state === 'connected')) {
            return this.#queue;
        }

        const generation = ++this.#generation;
        this.#abort?.abort();
        this.#abort = new AbortController();

        // disconnect(false) não para as tracks locais E aborta um connect() em voo
        // (rejeita a promise pendente com um erro de cancelamento). É o que faz um canal
        // intermediário ser descartado em milissegundos em vez de completar todo o ICE.
        this.#room?.disconnect(false).catch(() => {});

        this.#roomId = roomId;
        this.#setState('joining');

        this.#queue = this.#queue.then(() => this.#doJoin(roomId, generation));
        return this.#queue;
    }

    async leave({ releaseMedia = true } = {}) {
        const previousRoom = this.#roomId;
        this.#generation++;
        this.#abort?.abort();
        this.#abort = null;

        await this.#teardownRoom();
        this.#stopScreenStream();
        this.#stopListenAlongStream();
        if (releaseMedia) {
            // Sair da voz tem que apagar a luz da câmera e do microfone.
            this.#localMedia.release();
        }

        this.#roomId = null;
        this.#qualityByIdentity.clear();
        this.#speakingIdentities.clear();
        this.#setState('idle');
        if (previousRoom) {
            this.#emit('left', { roomId: previousRoom, reason: 'user' });
        }
    }

    async #doJoin(roomId, generation) {
        if (generation !== this.#generation) {
            return;
        }
        try {
            await this.#teardownRoom();
            if (generation !== this.#generation) {
                return;
            }

            const { micTrack } = await this.#localMedia.ensure();
            if (generation !== this.#generation) {
                return;
            }

            const credentials = await this.#fetchToken(roomId);
            if (generation !== this.#generation) {
                return;
            }

            // Room novo por join, em vez de reaproveitar um: um Room reusado carrega
            // volumeMap, listeners, estado de região e activeDeviceMap entre canais.
            // Instância nova torna "sem vazamento entre canais" estrutural.
            //
            // stopLocalTrackOnUnpublish: false é obrigatório aqui — o default true faz o
            // unpublishTrack chamar mediaStreamTrack.stop(), que mataria a câmera do
            // LocalMedia ao desligar o vídeo (ver #setCameraPublished).
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
                stopLocalTrackOnUnpublish: false,
            });
            this.#room = room;
            this.#wireRoomEvents(room, generation);

            await room.connect(credentials.url, credentials.token);
            if (generation !== this.#generation) {
                return;
            }

            if (micTrack) {
                await room.localParticipant.publishTrack(micTrack, {
                    source: Track.Source.Microphone,
                    name: 'microphone',
                });
                // Publica e só depois muta: uma publicação mutada é o que permite os
                // outros verem o badge de "microfone desligado". Se simplesmente não
                // publicássemos, a pessoa apareceria como se não tivesse microfone.
                if (!this.#desired.mic) {
                    await room.localParticipant
                        .getTrackPublication(Track.Source.Microphone)
                        ?.mute();
                }
            }
            await this.#applyDesiredPublications(generation);
            if (generation !== this.#generation) {
                return;
            }

            this.#setState('connected');
            this.#emit('joined', { roomId });
            // AudioPlaybackStatusChanged só dispara em MUDANÇA, e o acquireAudioContext do
            // connect() pode já ter resolvido a questão — então o estado inicial precisa
            // ser emitido à mão, senão a pill de desbloqueio nunca some (ou nunca aparece).
            this.#emit('audioplayback', { canPlayback: room.canPlaybackAudio });
            this.#scheduleSnapshot();
        } catch (error) {
            if (generation !== this.#generation) {
                return; // um join mais novo assumiu; este erro é irrelevante
            }
            console.error('Falha ao entrar no canal', error);
            await this.#teardownRoom();
            this.#roomId = null;
            this.#setState('idle');
            this.#emit('error', {
                scope: 'connect',
                message: error?.message ?? 'Não foi possível entrar no canal.',
                error,
            });
        }
    }

    async #fetchToken(roomId) {
        const params = new URLSearchParams({ identity: this.#identity, name: this.#displayName });
        const response = await fetch(`/room/${encodeURIComponent(roomId)}/token?${params}`, {
            signal: this.#abort?.signal,
        });
        if (!response.ok) {
            throw new Error(
                response.status === 404
                    ? 'Este canal não existe mais.'
                    : 'Falha ao obter o token de acesso do canal.',
            );
        }
        return response.json();
    }

    async #teardownRoom() {
        const room = this.#room;
        if (!room) {
            return;
        }
        this.#room = null;
        // removeAllListeners antes do disconnect: um Room já desconectado ainda dispara
        // eventos bufferizados, e sem isso eles chegariam na UI já pintada com o canal novo.
        room.removeAllListeners();
        try {
            await room.disconnect(false);
        } catch {
            // desconectar não pode falhar de forma que impeça entrar no próximo canal
        }
    }

    /**
     * Reaplica a intenção do usuário na sala nova. Tela e "ouvir junto" são carregados
     * junto de propósito: getDisplayMedia não tem relação nenhuma com a sala do LiveKit, e
     * obrigar a re-escolher a janela a cada troca de canal seria insuportável.
     */
    async #applyDesiredPublications(generation) {
        const local = this.#room?.localParticipant;
        if (!local) {
            return;
        }

        if (this.#desired.camera && this.#localMedia.cameraTrack) {
            await local.publishTrack(this.#localMedia.cameraTrack, { source: Track.Source.Camera, name: 'camera' });
        }
        if (generation !== this.#generation) {
            return;
        }

        // readyState !== 'live' quer dizer que a pessoa clicou em "Parar
        // compartilhamento" na barra nativa do navegador enquanto trocava de canal.
        const screenTrack = this.#screenStream?.getVideoTracks()[0];
        if (this.#desired.screen && screenTrack?.readyState === 'live') {
            await local.publishTrack(screenTrack, { source: Track.Source.ScreenShare, name: 'screen' });
            const screenAudio = this.#screenStream.getAudioTracks()[0];
            if (screenAudio?.readyState === 'live') {
                await local.publishTrack(screenAudio, {
                    source: Track.Source.ScreenShareAudio,
                    name: 'screen_audio',
                });
            }
        } else if (this.#desired.screen) {
            this.#desired.screen = false;
            this.#stopScreenStream();
        }
        if (generation !== this.#generation) {
            return;
        }

        const listenTrack = this.#listenAlongStream?.getAudioTracks()[0];
        if (this.#desired.listenAlong && listenTrack?.readyState === 'live') {
            await local.publishTrack(listenTrack, {
                source: Track.Source.Unknown,
                name: LISTEN_ALONG_TRACK_NAME,
            });
        } else if (this.#desired.listenAlong) {
            this.#desired.listenAlong = false;
            this.#stopListenAlongStream();
        }

        this.#emitLocalState();
    }

    // ---------------------------------------------------------------- controles

    async setMicEnabled(on) {
        this.#desired.mic = !!on;
        this.#emitLocalState();
        const publication = this.#room?.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (!publication) {
            return;
        }
        try {
            await (on ? publication.unmute() : publication.mute());
        } catch (error) {
            console.error('Falha ao alternar o microfone', error);
            this.#emit('error', { scope: 'publish', message: 'Falha ao alternar o microfone', error });
        }
    }

    async setCameraEnabled(on) {
        if (on && !this.#localMedia.hasCamera) {
            this.#emit('error', { scope: 'media', message: 'Nenhuma câmera encontrada neste dispositivo.' });
            return;
        }
        const previous = this.#desired.camera;
        this.#desired.camera = !!on;
        this.#emitLocalState();
        try {
            await this.#setCameraPublished(!!on);
        } catch (error) {
            console.error('Falha ao alternar a câmera', error);
            this.#desired.camera = previous;
            this.#emitLocalState();
            this.#emit('error', { scope: 'publish', message: 'Falha ao alternar a câmera', error });
        }
    }

    async #setCameraPublished(publish) {
        const local = this.#room?.localParticipant;
        const track = this.#localMedia.cameraTrack;
        if (!local || !track) {
            return;
        }
        if (publish) {
            await local.publishTrack(track, { source: Track.Source.Camera, name: 'camera' });
            return;
        }
        // Despublicar (e não mutar) porque queremos que o tile remoto DESAPAREÇA em vez de
        // congelar no último quadro. O `false` é o que evita o bug antigo: sem ele o
        // stopOnUnpublish cai no default do Room e chama mediaStreamTrack.stop(), matando
        // a câmera de verdade — religar republicava uma track morta.
        await local.unpublishTrack(track, false);
    }

    async setScreenShareEnabled(on) {
        if (!on) {
            await this.#unpublishScreen();
            this.#desired.screen = false;
            this.#stopScreenStream();
            this.#emitLocalState();
            return;
        }
        let stream;
        try {
            stream = await getScreenStream();
        } catch {
            return; // a pessoa cancelou o seletor nativo de tela
        }
        this.#screenStream = stream;
        this.#desired.screen = true;

        const videoTrack = stream.getVideoTracks()[0];
        // 'ended' cobre o botão "Parar compartilhamento" da barra nativa do navegador,
        // que não passa pela nossa UI. Armado uma vez por captura, não por publicação.
        videoTrack.addEventListener('ended', () => {
            this.setScreenShareEnabled(false);
        });

        try {
            const local = this.#room?.localParticipant;
            if (local) {
                await local.publishTrack(videoTrack, { source: Track.Source.ScreenShare, name: 'screen' });
                // Nem todo compartilhamento traz áudio (depende do SO e de a pessoa ter
                // marcado a opção). Vai como track separada e continua tocando junto com o
                // microfone, sem precisar mixar nada.
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    await local.publishTrack(audioTrack, {
                        source: Track.Source.ScreenShareAudio,
                        name: 'screen_audio',
                    });
                }
            }
        } catch (error) {
            console.error('Falha ao compartilhar a tela', error);
            this.#desired.screen = false;
            this.#stopScreenStream();
            this.#emit('error', { scope: 'publish', message: 'Falha ao compartilhar a tela', error });
        }
        this.#emitLocalState();
    }

    async setListenAlongEnabled(on) {
        if (!on) {
            await this.#unpublishListenAlong();
            this.#desired.listenAlong = false;
            this.#stopListenAlongStream();
            this.#emitLocalState();
            return;
        }
        let stream;
        try {
            stream = await getTabAudioStream();
        } catch (error) {
            if (error?.name === 'NoTabAudioError') {
                this.#emit('error', { scope: 'media', message: error.message });
            }
            return;
        }
        this.#listenAlongStream = stream;
        this.#desired.listenAlong = true;

        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.addEventListener('ended', () => {
            this.setListenAlongEnabled(false);
        });

        try {
            await this.#room?.localParticipant.publishTrack(audioTrack, {
                source: Track.Source.Unknown,
                name: LISTEN_ALONG_TRACK_NAME,
            });
        } catch (error) {
            console.error('Falha ao compartilhar o áudio da aba', error);
            this.#desired.listenAlong = false;
            this.#stopListenAlongStream();
            this.#emit('error', { scope: 'publish', message: 'Falha ao compartilhar o áudio da aba', error });
        }
        this.#emitLocalState();
    }

    async sendChat(text) {
        if (!this.#room || this.#state !== 'connected') {
            throw new Error('Entre num canal para conversar.');
        }
        // Não ecoa na UI aqui: sendChatMessage já dispara RoomEvent.ChatMessage pro próprio
        // remetente, então a mensagem local e a remota passam pelo mesmo caminho.
        await this.#room.localParticipant.sendChatMessage(text);
    }

    /** Desbloqueio de autoplay. É a API oficial pro que o código antigo fazia com play().catch(). */
    async unlockAudio() {
        try {
            await this.#room?.startAudio();
        } catch (error) {
            console.error('Falha ao desbloquear o áudio', error);
        }
    }

    async setAudioOutput(deviceId) {
        if (!deviceId || !this.#room) {
            return;
        }
        try {
            await this.#room.switchActiveDevice('audiooutput', deviceId);
        } catch (error) {
            console.error('Falha ao trocar a saída de áudio', error);
        }
    }

    // ---------------------------------------------------------------- eventos do SDK

    #wireRoomEvents(room, generation) {
        // Toda closure confere a geração: um Room que ainda não terminou de desconectar
        // pode disparar eventos depois que a UI já mudou de canal.
        const current = () => generation === this.#generation && this.#room === room;

        const snapshot = () => {
            if (current()) {
                this.#scheduleSnapshot();
            }
        };

        room.on(RoomEvent.TrackSubscribed, snapshot);
        room.on(RoomEvent.TrackUnsubscribed, snapshot);
        room.on(RoomEvent.LocalTrackPublished, snapshot);
        room.on(RoomEvent.LocalTrackUnpublished, snapshot);
        room.on(RoomEvent.TrackMuted, snapshot);
        room.on(RoomEvent.TrackUnmuted, snapshot);
        room.on(RoomEvent.ParticipantNameChanged, snapshot);

        room.on(RoomEvent.ParticipantConnected, (participant) => {
            if (!current()) {
                return;
            }
            this.#emit('participantjoined', {
                identity: participant.identity,
                stableId: stableIdOf(participant.identity),
                name: participant.name || 'Alguém',
            });
            this.#scheduleSnapshot();
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
            if (!current()) {
                return;
            }
            this.#qualityByIdentity.delete(participant.identity);
            this.#speakingIdentities.delete(participant.identity);
            this.#emit('participantleft', {
                identity: participant.identity,
                stableId: stableIdOf(participant.identity),
                name: participant.name || 'Alguém',
            });
            this.#scheduleSnapshot();
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (!current()) {
                return;
            }
            this.#speakingIdentities = new Set(speakers.map((participant) => participant.identity));
            // Evento próprio, de alta frequência: alternar uma classe é muito mais barato
            // que reconstruir o snapshot inteiro a cada vez que alguém começa a falar.
            this.#emit('speakers', { roomId: this.#roomId, identities: [...this.#speakingIdentities] });
        });

        room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            if (!current()) {
                return;
            }
            const identity = (participant ?? room.localParticipant).identity;
            // Guardado em mapa, e não escrito direto no DOM: antes um tile criado DEPOIS
            // do evento ficava sem indicador até a qualidade mudar de novo.
            this.#qualityByIdentity.set(identity, quality);
            this.#emit('quality', { identity, quality });
        });

        room.on(RoomEvent.ChatMessage, (message, participant) => {
            if (!current()) {
                return;
            }
            this.#emit('chat', { roomId: this.#roomId, message: this.#chatMessageView(message, participant) });
        });

        room.on(RoomEvent.AudioPlaybackStatusChanged, (canPlayback) => {
            if (current()) {
                this.#emit('audioplayback', { canPlayback });
            }
        });

        room.on(RoomEvent.Reconnecting, () => {
            if (current()) {
                this.#setState('reconnecting');
            }
        });
        room.on(RoomEvent.Reconnected, () => {
            if (current()) {
                this.#setState('connected');
                this.#scheduleSnapshot();
            }
        });

        room.on(RoomEvent.Disconnected, (reason) => {
            if (!current()) {
                return; // desconexão que nós mesmos pedimos ao trocar de canal
            }
            const roomId = this.#roomId;
            this.#room = null;
            this.#roomId = null;
            this.#setState('idle');
            this.#emit('left', { roomId, reason: 'server' });
            this.#emit('error', {
                scope: 'connect',
                message:
                    reason === DisconnectReason.DUPLICATE_IDENTITY
                        ? 'Você entrou neste canal em outra aba.'
                        : 'A conexão com o servidor de mídia caiu.',
                error: null,
                reconnectRoomId: roomId,
            });
        });
    }

    // ---------------------------------------------------------------- views e snapshots

    /**
     * Um único render por rajada de eventos. Conectar num canal com cinco pessoas dispara
     * dezenas de eventos do SDK em sequência; sem coalescer, cada um reconstruiria a
     * grade inteira.
     */
    #scheduleSnapshot() {
        if (this.#snapshotQueued) {
            return;
        }
        this.#snapshotQueued = true;
        queueMicrotask(() => {
            this.#snapshotQueued = false;
            if (!this.#room) {
                return;
            }
            this.#emit('participants', { roomId: this.#roomId, list: this.participants });
            this.#emit('tracks', { roomId: this.#roomId, video: this.videoPubs, audio: this.audioPubs });
        });
    }

    #allParticipants() {
        if (!this.#room) {
            return [];
        }
        return [this.#room.localParticipant, ...this.#room.remoteParticipants.values()];
    }

    #publications(predicate) {
        const views = [];
        for (const participant of this.#allParticipants()) {
            for (const publication of participant.trackPublications.values()) {
                if (!publication.track || publication.isMuted || !predicate(publication)) {
                    continue;
                }
                views.push(this.#pubView(publication, participant));
            }
        }
        return views;
    }

    #sourceOf(publication) {
        // "Ouvir junto" é publicado como Source.Unknown com nome próprio, porque o LiveKit
        // não tem uma fonte pra "áudio de uma aba". O nome é o que distingue.
        if (publication.trackName === LISTEN_ALONG_TRACK_NAME) {
            return 'listen_along';
        }
        return publication.source;
    }

    #pubView(publication, participant) {
        const track = publication.track;
        const source = this.#sourceOf(publication);
        return {
            key: `${participant.identity}|${source}`,
            trackSid: publication.trackSid,
            identity: participant.identity,
            stableId: stableIdOf(participant.identity),
            name: this.#displayNameFor(participant),
            isLocal: participant.isLocal,
            kind: publication.kind,
            source,
            muted: publication.isMuted,
            attach: (element) => track.attach(element),
            detach: (element) => track.detach(element),
            // setVolume no RemoteAudioTrack (e não no RemoteParticipant) de propósito: o do
            // participante é indexado por source, então não alcançaria o "ouvir junto",
            // que é publicado como Unknown.
            setVolume: (volume) => {
                if (typeof track.setVolume === 'function') {
                    track.setVolume(volume);
                }
            },
        };
    }

    #participantView(participant) {
        const micPub = participant.getTrackPublication(Track.Source.Microphone);
        const cameraPub = participant.getTrackPublication(Track.Source.Camera);
        const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
        const listenPub = participant.getTrackPublicationByName?.(LISTEN_ALONG_TRACK_NAME);
        return {
            identity: participant.identity,
            stableId: stableIdOf(participant.identity),
            name: this.#displayNameFor(participant),
            isLocal: participant.isLocal,
            micOn: !!micPub && !micPub.isMuted,
            camOn: !!cameraPub && !cameraPub.isMuted,
            screenOn: !!screenPub && !screenPub.isMuted,
            listeningAlong: !!listenPub && !listenPub.isMuted,
            // speaking e quality entram no snapshot (além de terem eventos próprios) pra
            // que um tile criado agora já nasça com o estado certo.
            speaking: this.#speakingIdentities.has(participant.identity),
            quality: this.#qualityByIdentity.get(participant.identity) ?? 'unknown',
        };
    }

    #chatMessageView(message, participant) {
        // participant pode vir undefined (pacote de um remetente que o SDK não rastreia).
        // O código antigo chamava displayNameFor(participant) direto e o handler morria.
        const identity = participant?.identity ?? 'sistema';
        return {
            id: message.id,
            text: message.message,
            timestamp: message.timestamp,
            identity,
            stableId: stableIdOf(identity),
            name: participant ? this.#displayNameFor(participant) : 'Sistema',
            isLocal: !!participant?.isLocal,
        };
    }

    #displayNameFor(participant) {
        if (participant.isLocal) {
            return this.#displayName;
        }
        return participant.name || 'Participante';
    }

    // ---------------------------------------------------------------- utilitários

    async #unpublishScreen() {
        const local = this.#room?.localParticipant;
        const videoTrack = this.#screenStream?.getVideoTracks()[0];
        const audioTrack = this.#screenStream?.getAudioTracks()[0];
        if (local && videoTrack) {
            await local.unpublishTrack(videoTrack, false).catch(() => {});
        }
        if (local && audioTrack) {
            await local.unpublishTrack(audioTrack, false).catch(() => {});
        }
    }

    async #unpublishListenAlong() {
        const local = this.#room?.localParticipant;
        const audioTrack = this.#listenAlongStream?.getAudioTracks()[0];
        if (local && audioTrack) {
            await local.unpublishTrack(audioTrack, false).catch(() => {});
        }
    }

    #stopScreenStream() {
        if (this.#screenStream) {
            stopStream(this.#screenStream);
            this.#screenStream = null;
        }
    }

    #stopListenAlongStream() {
        if (this.#listenAlongStream) {
            stopStream(this.#listenAlongStream);
            this.#listenAlongStream = null;
        }
    }

    #setState(state) {
        if (this.#state === state) {
            return;
        }
        const previous = this.#state;
        this.#state = state;
        this.#emit('statechange', { state, previous, roomId: this.#roomId });
    }

    #emitLocalState() {
        this.#emit('localstate', { ...this.#desired });
    }

    #emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
