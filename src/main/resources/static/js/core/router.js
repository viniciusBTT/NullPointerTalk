/**
 * Roteamento no cliente entre /  e  /room/<id>.
 *
 * As duas rotas são servidas pelo mesmo template, então navegar entre elas é só trocar a
 * URL e avisar quem se importa - sem reload, sem perder a conexão de voz.
 */

const ROOM_PREFIX = '/room/';

/** null quando a URL é a home (nenhum canal ativo). */
export function currentChannelId(pathname = window.location.pathname) {
    if (!pathname.startsWith(ROOM_PREFIX)) {
        return null;
    }
    const rest = pathname.slice(ROOM_PREFIX.length).split('/')[0];
    return rest ? decodeURIComponent(rest) : null;
}

export function navigate(channelId, { replace = false } = {}) {
    const path = channelId ? `${ROOM_PREFIX}${encodeURIComponent(channelId)}` : '/';
    if (path === window.location.pathname) {
        return;
    }
    // replace quando o canal não mudou de verdade, pra não encher o histórico de
    // entradas idênticas que o botão "voltar" teria que atravessar uma a uma.
    if (replace) {
        window.history.replaceState({ channelId }, '', path);
    } else {
        window.history.pushState({ channelId }, '', path);
    }
}

/**
 * `handler(channelId, { initial })` é chamado no boot e a cada popstate. O botão voltar
 * indo pra "/" precisa SAIR do canal de verdade, não só repintar - por isso o handler
 * recebe null e é ele quem decide desconectar.
 */
export function start(handler) {
    window.addEventListener('popstate', () => {
        handler(currentChannelId(), { initial: false });
    });
    handler(currentChannelId(), { initial: true });
}

/**
 * Intercepta cliques em links de canal. `resolve(anchor)` devolve o id do canal, ou null
 * pra deixar o navegador cuidar.
 *
 * Só captura clique simples do botão esquerdo: Ctrl+clique, clique do meio e Shift+clique
 * continuam abrindo /room/<id> numa aba nova, que é o comportamento que a pessoa espera
 * de um link de verdade.
 */
export function bindLinks(root, resolve, onNavigate) {
    root.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = event.target.closest('a[href]');
        if (!anchor || anchor.target === '_blank') {
            return;
        }
        const channelId = resolve(anchor);
        if (!channelId) {
            return;
        }
        event.preventDefault();
        onNavigate(channelId);
    });
}
