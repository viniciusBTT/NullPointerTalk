/** Avatares gerados: iniciais sobre uma cor derivada de um hash. Sem upload, sem arquivo. */

import { el } from './dom.js';

/**
 * FNV-1a. Escolhido por ser 5 linhas e ter distribuição boa o suficiente pra escolher
 * matiz - não é hash criptográfico e não precisa ser. O `>>> 0` mantém tudo em uint32,
 * senão o `* 16777619` estoura pra double e a distribuição degrada.
 */
function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/**
 * Cor estável pra uma semente. Saturação e luminosidade fixas garantem contraste
 * legível com texto branco em qualquer matiz - variar as três daria combinações ilegíveis.
 */
export function colorFor(seed) {
    return `hsl(${hash(String(seed ?? '')) % 360} 58% 42%)`;
}

/**
 * "Vinicius Fagundes" -> "VF", "vini" -> "VI".
 * Usa Array.from pra não cortar emoji/acentos no meio de um par surrogate.
 */
export function initialsFor(name) {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return '?';
    }
    if (words.length === 1) {
        return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
    }
    return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

/**
 * O `seed` é separado do `name` de propósito: passando o id estável do participante,
 * a cor de alguém continua a mesma quando essa pessoa troca de nome de exibição -
 * que é o que faz o avatar servir pra reconhecer alguém de relance.
 */
export function avatarElement({ name, seed = null, size = 32, className = '' } = {}) {
    // size: null deixa o dimensionamento pro CSS. Necessário nos tiles do stage, onde o
    // avatar tem que encolher junto com o tile - um tamanho fixo em px vindo daqui venceria
    // qualquer regra de CSS (estilo inline) e estouraria o tile em tela estreita.
    const style = { background: colorFor(seed ?? name) };
    if (size !== null) {
        style.width = `${size}px`;
        style.height = `${size}px`;
        style.fontSize = `${Math.round(size * 0.4)}px`;
    }
    return el('div', {
        class: className ? `avatar ${className}` : 'avatar',
        text: initialsFor(name),
        style,
    });
}
