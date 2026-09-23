/**
 * Divisão entre o stage e o chat dentro de .content: o divisor arrastável ajusta
 * --content-split (a altura do stage, em %), e o botão de minimizar colapsa o chat.
 *
 * Minimizar tem dois resultados possíveis, escolhidos a cada toggle a partir do estado
 * ATUAL do stage (stage.hasVideo()):
 *  - com vídeo real ativo: o chat vira uma faixa fina (só o cabeçalho) e o stage cresce
 *    pra ocupar o resto - ver ".chat--strip" em shell.css;
 *  - sem vídeo: --content-split vai pra 50% e stage.setForceAvatars(true) força o stage
 *    a aparecer mostrando um card por participante conectado (o mesmo tile de avatar que
 *    já existe pra quem está sem câmera numa chamada mista - ver stage.js).
 *
 * refresh() existe pra reavaliar essa escolha quando o vídeo muda de estado (alguém liga
 * ou desliga a câmera/tela) enquanto o chat já está minimizado - sem isso o chat ficaria
 * preso no modo errado até a pessoa reabrir e minimizar de novo.
 */

import { setIcon } from '../lib/icons.js';
import { getPref, setPref, KEYS } from '../lib/prefs.js';

const MIN_SPLIT = 20;
const MAX_SPLIT = 80;
const HALF_SPLIT = 50;
const DEFAULT_SPLIT = 45;

export function initContentLayout({ contentEl, chatEl, resizerEl, collapseBtn, stage }) {
    let currentSplit = DEFAULT_SPLIT;
    let collapsed = false;
    /** Split de antes de entrar no modo "metade" (sem vídeo) - restaurado ao expandir,
     * senão o chat voltaria sempre travado nos 50% do modo minimizado. */
    let preHalfSplit = null;

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
        stage.setForceAvatars(collapsed);
        // "Minimizar" tem dois resultados, escolhidos pelo estado ATUAL do vídeo: com
        // vídeo real ativo vira uma faixa fina (chat--strip: só o cabeçalho, ver
        // chat.css/shell.css); sem vídeo vira um split 50/50 onde o chat continua
        // funcional (mensagens + composer visíveis), só menor - por isso NENHUMA classe
        // é aplicada nesse segundo caso além do split em si.
        const strip = collapsed && stage.hasVideo();
        chatEl.classList.toggle('chat--strip', strip);
        if (collapsed && !strip) {
            preHalfSplit ??= currentSplit;
            applySplit(HALF_SPLIT);
        } else if (!collapsed && preHalfSplit !== null) {
            applySplit(preHalfSplit);
            preHalfSplit = null;
        }

        setIcon(collapseBtn, collapsed ? 'chevron-up' : 'chevron-down');
        collapseBtn.title = collapsed ? 'Expandir chat' : 'Minimizar chat';
        if (persist) {
            setPref(KEYS.chatCollapsed, collapsed);
        }
    }

    function refresh() {
        if (collapsed) {
            applyCollapsed(true, { persist: false });
        }
    }

    return { refresh };
}
