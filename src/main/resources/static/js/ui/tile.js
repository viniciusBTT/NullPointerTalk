/** Um tile do stage: vídeo (câmera ou tela) ou círculo de avatar pra quem está só na voz. */

import { el, append, setClasses } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { avatarElement } from '../lib/avatar.js';

const QUALITY_LABELS = {
    excellent: 'boa',
    good: 'boa',
    poor: 'instável',
    lost: 'perdida',
    unknown: 'conectando',
};

const SOURCE_LABELS = {
    screen_share: 'tela',
    camera: null,
};

export function createTile(view) {
    const tile = el('div', {
        class: 'tile',
        dataset: { key: view.key, identity: view.identity, source: view.source },
    });

    if (view.kind === 'video') {
        const video = el('video', {
            autoplay: true,
            playsInline: true,
            // A própria câmera nunca reproduz som de volta. O áudio remoto não passa por
            // aqui de forma alguma - vive em <audio> dedicados no AudioSink.
            muted: true,
        });
        tile.appendChild(video);
        view.pub.attach(video);
        // Espelhar só a própria câmera. Tela compartilhada espelhada seria ilegível.
        tile.classList.toggle('tile--mirror', view.isLocal && view.source === 'camera');
    } else {
        // size: null porque o avatar do tile é dimensionado pelo CSS (clamp em stage.css) -
        // ele precisa encolher junto com o tile em tela estreita.
        tile.appendChild(el('div', { class: 'tile__avatar' }, avatarElement({
            name: view.name,
            seed: view.stableId,
            size: null,
        })));
    }

    const footer = el('div', { class: 'tile__footer' });
    footer.appendChild(el('span', { class: 'tile__name', text: labelFor(view) }));
    const badges = el('span', { class: 'tile__badges' });
    footer.appendChild(badges);
    tile.appendChild(footer);

    tile.appendChild(el('span', { class: 'tile__quality', title: '' }, icon('signal', { size: 14 })));

    updateTile(tile, view);
    return tile;
}

export function updateTile(tile, view) {
    tile.querySelector('.tile__name').textContent = labelFor(view);

    setClasses(tile, {
        'tile--speaking': view.speaking,
        'tile--video': view.kind === 'video',
        'tile--avatar': view.kind === 'avatar',
        'tile--screen': view.source === 'screen_share',
    });

    const badges = tile.querySelector('.tile__badges');
    badges.replaceChildren();
    // Badge de microfone só faz sentido no tile da pessoa, não no da tela que ela
    // compartilha - senão apareceria duplicado.
    if (view.source !== 'screen_share') {
        if (!view.micOn) {
            append(badges, badge('mic-off', 'Microfone desligado'));
        }
        if (view.listeningAlong) {
            append(badges, badge('music', 'Compartilhando áudio de uma aba'));
        }
    }

    const quality = tile.querySelector('.tile__quality');
    quality.dataset.quality = view.quality ?? 'unknown';
    quality.title = `Conexão: ${QUALITY_LABELS[view.quality] ?? view.quality ?? 'desconhecida'}`;
}

export function destroyTile(tile, view) {
    const video = tile.querySelector('video');
    if (video && view?.pub) {
        try {
            view.pub.detach(video);
        } catch {
            // a track pode já ter sido encerrada do outro lado
        }
    }
    tile.remove();
}

function labelFor(view) {
    const suffix = SOURCE_LABELS[view.source];
    const name = view.isLocal ? `${view.name} (você)` : view.name;
    return suffix ? `${name} — ${suffix}` : name;
}

function badge(iconName, title) {
    return el('span', { class: 'badge', title }, icon(iconName, { size: 14 }));
}
