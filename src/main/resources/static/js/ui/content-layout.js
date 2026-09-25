/** Split stage/chat e recolhimento completo do chat fora do palco. */

import { setIcon } from '../lib/icons.js';
import { getPref, setPref, KEYS } from '../lib/prefs.js';

const MIN_SPLIT = 20;
const MAX_SPLIT = 80;
const DEFAULT_SPLIT = 45;

export function initContentLayout({ contentEl, chatEl, resizerEl, collapseBtn, stage, onCollapsedChange }) {
    let currentSplit = DEFAULT_SPLIT;
    let collapsed = false;

    applySplit(getPref(KEYS.contentSplit, DEFAULT_SPLIT));
    applyCollapsed(getPref(KEYS.chatCollapsed, false), { persist: false });
    collapseBtn.addEventListener('click', () => applyCollapsed(!collapsed));
    resizerEl.addEventListener('pointerdown', onResizeStart);

    function onResizeStart(event) {
        event.preventDefault();
        resizerEl.setPointerCapture(event.pointerId);
        resizerEl.addEventListener('pointermove', onResizeMove);
        resizerEl.addEventListener('pointerup', onResizeEnd, { once: true });
    }
    function onResizeMove(event) {
        const rect = contentEl.getBoundingClientRect();
        applySplit(((event.clientY - rect.top) / rect.height) * 100);
    }
    function onResizeEnd(event) {
        resizerEl.removeEventListener('pointermove', onResizeMove);
        resizerEl.releasePointerCapture(event.pointerId);
        setPref(KEYS.contentSplit, currentSplit);
    }
    function applySplit(pct) {
        currentSplit = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct));
        contentEl.style.setProperty('--content-split', `${currentSplit}%`);
    }
    function applyCollapsed(next, { persist = true } = {}) {
        collapsed = next;
        // Sem vídeo, o stage com avatares substitui o chat por completo; com mídia, o
        // palco existente simplesmente ganha a altura antes reservada ao painel.
        stage.setForceAvatars(collapsed);
        chatEl.classList.toggle('chat--hidden', collapsed);
        setIcon(collapseBtn, collapsed ? 'chevron-up' : 'chevron-down');
        collapseBtn.title = collapsed ? 'Abrir chat' : 'Ocultar chat';
        collapseBtn.setAttribute('aria-label', collapseBtn.title);
        onCollapsedChange?.(collapsed);
        if (persist) setPref(KEYS.chatCollapsed, collapsed);
    }
    function refresh() {
        if (collapsed) stage.setForceAvatars(true);
    }
    return { refresh, toggleChat: () => applyCollapsed(!collapsed), isCollapsed: () => collapsed };
}
