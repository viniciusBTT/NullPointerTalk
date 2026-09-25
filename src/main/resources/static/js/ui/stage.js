/** Palco de apresentação: grade equilibrada ou fonte principal com miniaturas. */

import { createTile, updateTile, destroyTile } from './tile.js';
import { el } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

export function initStage({ root, onParticipantClick, callControls, onFeedback }) {
    const tiles = new Map();
    let pinnedKey = null;
    let focusedKey = null;
    const screenOrder = new Map();
    let nextScreenOrder = 0;
    let lastArgs = { participants: [], videoPubs: [] };
    let forceAvatars = false;
    let noticeTimer = null;
    let pendingScreenKey = null;
    let controlsHome = null;

    const context = el('span', { class: 'stage__context' });
    const contextLabel = el('span', { class: 'stage__context-label' });
    const presenterBadge = el('span', { class: 'stage__presenter hidden', text: 'Você apresenta' });
    context.append(contextLabel, presenterBadge);
    const pinButton = el('button', {
        class: 'stage__action', type: 'button', title: 'Fixar no palco', ariaLabel: 'Fixar no palco',
    }, icon('pin', { size: 16 }));
    const fullscreenButton = el('button', {
        class: 'stage__action', type: 'button', title: 'Tela cheia', ariaLabel: 'Tela cheia',
    }, icon('fullscreen', { size: 16 }));
    const actions = el('div', { class: 'stage__actions' }, pinButton, fullscreenButton);
    const header = el('div', { class: 'stage__header' }, context, actions);
    const main = el('div', { class: 'stage__main' });
    const strip = el('div', { class: 'stage__strip', ariaLabel: 'Participantes e fontes disponíveis' });
    const noticeText = el('span');
    const noticeAction = el('button', { class: 'stage__notice-action', type: 'button', text: 'Ir para tela' });
    const notice = el('div', { class: 'stage__notice hidden' }, noticeText, noticeAction);
    const live = el('span', { class: 'sr-only', ariaLive: 'polite', ariaAtomic: 'true' });
    root.replaceChildren(header, main, strip, notice, live);

    root.addEventListener('click', (event) => {
        const tile = event.target.closest('.tile');
        if (!tile) return;
        const { key, identity } = tile.dataset;
        if (tile.classList.contains('tile--avatar')) onParticipantClick?.(identity, tile);
        else if (event.target.closest('[data-pin]')) setPinned(pinnedKey === key ? null : key);
    });
    pinButton.addEventListener('click', () => setPinned(pinnedKey === focusedKey ? null : focusedKey));
    fullscreenButton.addEventListener('click', toggleFullscreen);
    noticeAction.addEventListener('click', () => {
        if (pendingScreenKey && tiles.has(pendingScreenKey)) setPinned(pendingScreenKey);
        hideNotice();
    });
    document.addEventListener('fullscreenchange', () => {
        const active = document.fullscreenElement === root;
        root.classList.toggle('stage--fullscreen', active);
        fullscreenButton.title = active ? 'Sair da tela cheia' : 'Tela cheia';
        fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
        if (!active) restoreControls();
    });

    function setPinned(key) {
        pinnedKey = key;
        hideNotice();
        layout();
    }

    function autoFocusKey() {
        return [...tiles.values()]
            .filter((entry) => entry.view.source === 'screen_share')
            .sort((a, b) => (screenOrder.get(b.view.key) ?? 0) - (screenOrder.get(a.view.key) ?? 0))[0]
            ?.view.key ?? null;
    }

    function layout() {
        focusedKey = pinnedKey && tiles.has(pinnedKey) ? pinnedKey : autoFocusKey();
        const presentation = focusedKey !== null;
        root.classList.toggle('stage--presentation', presentation);
        const focused = focusedKey ? tiles.get(focusedKey)?.view : null;
        contextLabel.textContent = focused
            ? (pinnedKey === focusedKey ? `Fixado por você: ${labelFor(focused)}` : `Apresentando: ${labelFor(focused)}`)
            : '';
        presenterBadge.classList.toggle('hidden', !focused?.isLocal || focused.source !== 'screen_share');
        pinButton.classList.toggle('hidden', !focused);
        if (focused) {
            const fixed = pinnedKey === focusedKey;
            pinButton.title = fixed ? 'Desafixar do palco' : 'Fixar no palco';
            pinButton.setAttribute('aria-label', pinButton.title);
            pinButton.setAttribute('aria-pressed', String(fixed));
            live.textContent = contextLabel.textContent;
        }
        let stripCount = 0;
        for (const [key, entry] of tiles) {
            const primary = key === focusedKey;
            updateTile(entry.element, { ...entry.view, pinned: key === pinnedKey, primary, presentation });
            entry.element.classList.toggle('tile--primary', primary);
            entry.element.classList.toggle('tile--thumbnail', presentation && !primary);
            entry.element.classList.toggle('tile--grid', !presentation);
            (primary ? main : presentation ? strip : root).appendChild(entry.element);
            if (presentation && !primary) stripCount += 1;
        }
        root.classList.toggle('stage--has-strip', stripCount > 0);
    }

    function buildViews({ participants, videoPubs }) {
        const views = new Map();
        const byIdentity = new Map(participants.map((p) => [p.identity, p]));
        for (const pub of videoPubs) {
            const participant = byIdentity.get(pub.identity);
            views.set(pub.key, {
                key: pub.key, kind: 'video', pub, identity: pub.identity, stableId: pub.stableId,
                name: pub.name, isLocal: pub.isLocal, source: pub.source,
                speaking: participant?.speaking ?? false, quality: participant?.quality ?? 'unknown',
                micOn: participant?.micOn ?? false, listeningAlong: participant?.listeningAlong ?? false,
            });
        }
        if (views.size > 0 || forceAvatars) {
            const withVideo = new Set(videoPubs.map((pub) => pub.identity));
            for (const participant of participants) {
                if (!withVideo.has(participant.identity)) {
                    const key = `${participant.identity}|avatar`;
                    views.set(key, { ...participant, key, kind: 'avatar', source: 'avatar' });
                }
            }
        }
        return views;
    }

    function showNewScreen(view) {
        if (!pinnedKey || pinnedKey === view.key) return;
        pendingScreenKey = view.key;
        noticeText.textContent = `${labelFor(view)} começou a compartilhar`;
        notice.classList.remove('hidden');
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(hideNotice, 8000);
    }

    function hideNotice() {
        pendingScreenKey = null;
        notice.classList.add('hidden');
        clearTimeout(noticeTimer);
        noticeTimer = null;
    }

    function render({ participants, videoPubs }) {
        lastArgs = { participants, videoPubs };
        const views = buildViews({ participants, videoPubs });
        const newScreens = [];
        for (const view of views.values()) {
            if (view.source === 'screen_share' && !screenOrder.has(view.key)) {
                screenOrder.set(view.key, ++nextScreenOrder);
                newScreens.push(view);
            }
        }
        for (const [key, entry] of [...tiles]) {
            if (!views.has(key)) {
                destroyTile(entry.element, entry.view);
                tiles.delete(key);
                screenOrder.delete(key);
            }
        }
        for (const [key, view] of views) {
            const existing = tiles.get(key);
            if (existing) {
                existing.view = view;
                updateTile(existing.element, view);
            } else {
                tiles.set(key, { element: createTile(view), view });
            }
        }
        if (pinnedKey && !views.has(pinnedKey)) pinnedKey = null;
        newScreens.forEach(showNewScreen);
        layout();
        const hasVideo = videoPubs.length > 0;
        root.classList.toggle('hidden', !hasVideo && !(forceAvatars && participants.length > 0));
        return hasVideo;
    }

    async function toggleFullscreen() {
        if (document.fullscreenElement === root) {
            await document.exitFullscreen();
            return;
        }
        if (!root.requestFullscreen) {
            onFeedback?.('Tela cheia não é suportada neste navegador.', { type: 'error' });
            return;
        }
        controlsHome = { parent: callControls.parentElement, next: callControls.nextSibling };
        root.appendChild(callControls);
        try {
            await root.requestFullscreen();
        } catch {
            restoreControls();
            onFeedback?.('Não foi possível abrir a tela cheia.', { type: 'error' });
        }
    }

    function restoreControls() {
        if (!controlsHome) return;
        controlsHome.parent.insertBefore(callControls, controlsHome.next);
        controlsHome = null;
    }

    function setForceAvatars(flag) {
        if (forceAvatars !== flag) {
            forceAvatars = flag;
            render(lastArgs);
        }
    }
    function hasVideo() { return lastArgs.videoPubs.length > 0; }
    function setSpeaking(identities) {
        const speaking = new Set(identities);
        for (const entry of tiles.values()) {
            entry.view.speaking = speaking.has(entry.view.identity);
            updateTile(entry.element, {
                ...entry.view,
                pinned: entry.view.key === pinnedKey,
                primary: entry.view.key === focusedKey,
                presentation: focusedKey !== null,
            });
        }
    }
    function clear() {
        for (const entry of tiles.values()) destroyTile(entry.element, entry.view);
        tiles.clear(); screenOrder.clear(); pinnedKey = null; focusedKey = null; nextScreenOrder = 0;
        hideNotice(); restoreControls(); main.replaceChildren(); strip.replaceChildren(); root.classList.add('hidden');
    }
    return { render, setSpeaking, clear, setForceAvatars, hasVideo };
}

function labelFor(view) {
    return view.isLocal ? `${view.name} (você)` : view.name;
}
