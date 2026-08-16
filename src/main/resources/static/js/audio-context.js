/**
 * AudioContext unico compartilhado entre o indicador de "falando agora" (audio-level.js)
 * e a mixagem de audio do compartilhamento de tela (audio-mixer.js) - navegadores
 * desencorajam abrir varios contexts simultaneos na mesma pagina.
 */

let sharedContext;

export function getAudioContext() {
    if (!sharedContext) {
        sharedContext = new AudioContext();
    }
    // Contexts sao criados suspensos ate um gesto do usuario em alguns navegadores;
    // como a pagina ja exige interacao (nome, botoes) antes de chegar aqui, resume()
    // sem esperar resolver e seguro.
    if (sharedContext.state === 'suspended') {
        sharedContext.resume().catch(() => {});
    }
    return sharedContext;
}
