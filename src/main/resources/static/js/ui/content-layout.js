/** Layout responsivo entre palco e chat, com redimensionamento por mouse, toque e teclado. */

import { getPref, setPref, KEYS } from '../lib/prefs.js';

const MIN_SPLIT = 20;
const MAX_SPLIT = 80;
const DEFAULT_SPLIT = 50;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 520;
const DEFAULT_CHAT_WIDTH = 360;
const KEYBOARD_STEP = 20;

export function initContentLayout({ contentEl, chatEl, resizerEl, stage, onCollapsedChange }) {
    const desktopQuery = matchMedia('(min-width: 901px)');
    let currentSplit = numberPref(KEYS.contentSplit, DEFAULT_SPLIT, MIN_SPLIT, MAX_SPLIT);
    let chatWidth = numberPref(KEYS.chatWidth, DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
    let collapsed = getPref(KEYS.chatCollapsed, false) === true;

    applySplit(currentSplit);
    applyChatWidth(chatWidth);
    applyCollapsed(collapsed, { persist: false });
    syncSeparator();

    resizerEl.addEventListener('pointerdown', onResizeStart);
    resizerEl.addEventListener('keydown', onSeparatorKeydown);
    desktopQuery.addEventListener('change', syncSeparator);

    function onResizeStart(event) {
        event.preventDefault();
        resizerEl.setPointerCapture(event.pointerId);
        resizerEl.addEventListener('pointermove', onResizeMove);
        resizerEl.addEventListener('pointerup', onResizeEnd, { once: true });
        resizerEl.addEventListener('pointercancel', onResizeEnd, { once: true });
    }

    function onResizeMove(event) {
        const rect = contentEl.getBoundingClientRect();
        if (desktopQuery.matches) {
            applyChatWidth(rect.right - event.clientX);
        } else {
            applySplit(((event.clientY - rect.top) / rect.height) * 100);
        }
    }

    function onResizeEnd(event) {
        resizerEl.removeEventListener('pointermove', onResizeMove);
        resizerEl.removeEventListener('pointerup', onResizeEnd);
        resizerEl.removeEventListener('pointercancel', onResizeEnd);
        if (resizerEl.hasPointerCapture?.(event.pointerId)) resizerEl.releasePointerCapture(event.pointerId);
        setPref(desktopQuery.matches ? KEYS.chatWidth : KEYS.contentSplit,
            desktopQuery.matches ? chatWidth : currentSplit);
    }

    function onSeparatorKeydown(event) {
        let handled = true;
        if (desktopQuery.matches) {
            if (event.key === 'ArrowLeft') applyChatWidth(chatWidth + KEYBOARD_STEP);
            else if (event.key === 'ArrowRight') applyChatWidth(chatWidth - KEYBOARD_STEP);
            else handled = false;
            if (handled) setPref(KEYS.chatWidth, chatWidth);
        } else {
            if (event.key === 'ArrowUp') applySplit(currentSplit - 2);
            else if (event.key === 'ArrowDown') applySplit(currentSplit + 2);
            else handled = false;
            if (handled) setPref(KEYS.contentSplit, currentSplit);
        }
        if (handled) event.preventDefault();
    }

    function applySplit(value) {
        currentSplit = clamp(value, MIN_SPLIT, MAX_SPLIT);
        contentEl.style.setProperty('--content-split', `${currentSplit}%`);
        if (!desktopQuery.matches) resizerEl.setAttribute('aria-valuenow', String(Math.round(currentSplit)));
    }

    function applyChatWidth(value) {
        chatWidth = clamp(value, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
        contentEl.style.setProperty('--chat-width', `${chatWidth}px`);
        if (desktopQuery.matches) resizerEl.setAttribute('aria-valuenow', String(Math.round(chatWidth)));
    }

    function applyCollapsed(next, { persist = true } = {}) {
        collapsed = Boolean(next);
        stage.setForceAvatars(collapsed);
        chatEl.classList.toggle('chat--hidden', collapsed);
        contentEl.classList.toggle('content--chat-hidden', collapsed);
        onCollapsedChange?.(collapsed);
        if (persist) setPref(KEYS.chatCollapsed, collapsed);
    }

    function syncSeparator() {
        const desktop = desktopQuery.matches;
        resizerEl.setAttribute('aria-orientation', desktop ? 'vertical' : 'horizontal');
        resizerEl.setAttribute('aria-valuemin', String(desktop ? MIN_CHAT_WIDTH : MIN_SPLIT));
        resizerEl.setAttribute('aria-valuemax', String(desktop ? MAX_CHAT_WIDTH : MAX_SPLIT));
        resizerEl.setAttribute('aria-valuenow', String(Math.round(desktop ? chatWidth : currentSplit)));
    }

    function refresh() {
        if (collapsed) stage.setForceAvatars(true);
    }

    return {
        refresh,
        toggleChat: () => applyCollapsed(!collapsed),
        openChat: () => applyCollapsed(false),
        isCollapsed: () => collapsed,
    };
}

function numberPref(key, fallback, min, max) {
    const value = Number(getPref(key, fallback));
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
