/**
 * Ícones via sprite SVG. O sprite é inlinado no shell (fragments/icons.html), não
 * carregado de /icons/icons.svg como arquivo externo, e isso é decisão consciente:
 *
 *  - `<use>` apontando pra arquivo externo cria uma shadow tree que as regras CSS do
 *    documento não alcançam, então `currentColor` só funciona se cada <symbol> declarar
 *    stroke="currentColor" - frágil e fácil de quebrar sem perceber ao editar o sprite.
 *  - Safari historicamente engasgou com <use> externo.
 *
 * Inline resolve os dois de graça. O custo é ~3 KB no HTML, irrelevante ao lado do
 * bundle de 620 KB do LiveKit, e não gasta requisição nenhuma.
 */

const PREFIX = 'npt-';

/** Cria um <svg> apontando pro símbolo pedido. */
export function icon(name, { size = 20, className = '' } = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className ? `icon ${className}` : 'icon');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${PREFIX}${name}`);
    svg.appendChild(use);
    return svg;
}

/**
 * Troca qual símbolo um <svg> já existente aponta (mic <-> mic-off) sem recriar o nó.
 * Aceita tanto o <svg> quanto um container que tenha um .icon dentro - os botões do
 * shell são <button><svg class="icon"></svg></button>, então passar o botão é o caso comum.
 */
export function setIcon(node, name) {
    const svg = node.tagName === 'svg' ? node : node.querySelector('svg.icon');
    const use = svg?.querySelector('use');
    if (use) {
        use.setAttribute('href', `#${PREFIX}${name}`);
    }
}
