/**
 * Modal de seleção de ícone pra sala: grade estática de emojis curados, construída sem
 * innerHTML (ver lib/dom.js). O input do formulário de sala (room-admin.js) continua sendo
 * a única fonte de verdade do ícone escolhido - esta modal só lê o valor atual (pra destacar
 * a opção correspondente) e, ao clicar numa opção, escreve o novo valor via onSelect. Fechar
 * sem escolher nada (backdrop, Esc, botão) nunca chama onSelect.
 */

import { el, append, clear } from '../lib/dom.js';

export const ROOM_ICON_CATALOG = [
    { glyph: '💬', label: 'Conversa' },
    { glyph: '🎮', label: 'Jogos' },
    { glyph: '📚', label: 'Estudos' },
    { glyph: '🎵', label: 'Música' },
    { glyph: '🎬', label: 'Filmes e séries' },
    { glyph: '🎨', label: 'Arte' },
    { glyph: '💻', label: 'Programação' },
    { glyph: '⚽', label: 'Esportes' },
    { glyph: '🍕', label: 'Comida' },
    { glyph: '☕', label: 'Café' },
    { glyph: '🌙', label: 'Vida noturna' },
    { glyph: '🔥', label: 'Em alta' },
    { glyph: '🚀', label: 'Projetos' },
    { glyph: '🧠', label: 'Ideias' },
    { glyph: '🎲', label: 'Jogos de mesa' },
    { glyph: '📷', label: 'Fotografia' },
];

export function initIconPicker({ root, gridEl, closeButtons, onSelect }) {
    function render(currentGlyph) {
        clear(gridEl);
        append(gridEl, ROOM_ICON_CATALOG.map(({ glyph, label }) => el('button', {
            type: 'button',
            class: ['icon-picker__option', glyph === currentGlyph && 'is-selected'],
            text: glyph,
            title: label,
            onClick: () => {
                close();
                onSelect(glyph);
            },
        })));
    }

    function open(currentGlyph) {
        render(currentGlyph);
        root.classList.remove('hidden');
    }

    function close() {
        root.classList.add('hidden');
    }

    closeButtons.forEach((button) => button.addEventListener('click', () => close()));
    root.addEventListener('click', (event) => {
        if (event.target === root) {
            close(); // clique no backdrop
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !root.classList.contains('hidden')) {
            close();
        }
    });

    return { open, close };
}
