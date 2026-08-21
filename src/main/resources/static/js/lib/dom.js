/**
 * Construtores mínimos de DOM. A razão de existir: com el({ text }) sempre caindo em
 * textContent, o codebase inteiro consegue manter a invariante "zero innerHTML" - que é
 * muito mais fácil de revisar do que "innerHTML só pra string estática", porque não
 * exige julgar cada caso.
 */

/**
 * el('div', { class: 'x', text: 'oi' }, ...filhos)
 *
 * Props reconhecidas: class, text, html (proibido - lança), dataset, style, on{Event},
 * e qualquer outra vira atributo ou propriedade direta.
 */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) {
            continue;
        }
        if (key === 'html') {
            throw new Error('el(): "html" não é suportado - use text (textContent) por segurança');
        }
        if (key === 'class') {
            node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        } else if (key === 'text') {
            node.textContent = value;
        } else if (key === 'dataset') {
            Object.assign(node.dataset, value);
        } else if (key === 'style') {
            Object.assign(node.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in node && key !== 'list' && key !== 'form') {
            // propriedade direta cobre autoplay/muted/disabled/value corretamente;
            // list e form são exceções porque em DOM são read-only (só via atributo).
            node[key] = value;
        } else {
            node.setAttribute(key, value === true ? '' : value);
        }
    }

    append(node, children);
    return node;
}

/** Anexa filhos aceitando nós, strings, null (ignorado) e arrays aninhados. */
export function append(parent, ...children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) {
            continue;
        }
        parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    }
    return parent;
}

export function clear(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    return node;
}

/** Atalho pra alternar várias classes de uma vez: setClasses(el, { 'is-off': !on }) */
export function setClasses(node, map) {
    for (const [name, on] of Object.entries(map)) {
        node.classList.toggle(name, !!on);
    }
    return node;
}
