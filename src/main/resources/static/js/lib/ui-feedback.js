/**
 * Feedback visual compartilhado (toasts efemeros + banner persistente).
 * Um unico container por tipo, criado sob demanda e reaproveitado.
 */

let toastContainer;
let bannerContainer;
const groupedToasts = new Map();

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

function getBannerContainer() {
    if (!bannerContainer) {
        bannerContainer = document.createElement('div');
        bannerContainer.className = 'banner-container';
        document.body.appendChild(bannerContainer);
    }
    return bannerContainer;
}

/** Mensagem que some sozinha depois de alguns segundos (ex: entrou/saiu da sala). */
export function showToast(message, { type = 'info', durationMs = 4000, groupKey } = {}) {
    const grouped = groupKey ? groupedToasts.get(groupKey) : null;
    if (grouped) {
        grouped.node.textContent = message;
        grouped.node.className = `toast toast--${type}`;
        clearTimeout(grouped.timeout);
        grouped.timeout = setTimeout(() => {
            grouped.node.remove();
            groupedToasts.delete(groupKey);
        }, durationMs);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    getToastContainer().appendChild(toast);
    const timeout = setTimeout(() => {
        toast.remove();
        if (groupKey) groupedToasts.delete(groupKey);
    }, durationMs);
    if (groupKey) groupedToasts.set(groupKey, { node: toast, timeout });
}

/**
 * Mensagem persistente com botao de acao opcional (ex: erro de midia, reconexao falhou).
 * Retorna uma funcao pra fechar o banner manualmente quando o estado se resolver sozinho.
 */
export function showBanner(message, { dismissible = true, actionLabel, onAction } = {}) {
    const banner = document.createElement('div');
    banner.className = 'banner';

    const text = document.createElement('span');
    text.textContent = message;
    banner.appendChild(text);

    if (actionLabel && onAction) {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'btn btn--primary banner__action';
        actionBtn.textContent = actionLabel;
        actionBtn.addEventListener('click', onAction);
        banner.appendChild(actionBtn);
    }

    if (dismissible) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'banner__close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => banner.remove());
        banner.appendChild(closeBtn);
    }

    getBannerContainer().appendChild(banner);
    return () => banner.remove();
}
