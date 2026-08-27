package com.nullpointertalk.room;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Serve o shell da SPA (Vue/Vite, buildado em frontend/dist e copiado pro classpath -
 * ver pom.xml). As DUAS rotas fazem forward pro mesmo index.html estatico, e e' isso que
 * faz o roteamento no cliente (vue-router, modo history) funcionar: /room/jogos aberto
 * direto (link compartilhado, F5, bookmark) precisa devolver a aplicacao inteira, nao
 * uma pagina diferente. O roomId desconhecido nao e' mais tratado aqui - o guard de rota
 * do vue-router redireciona pra "/" no cliente apos carregar o catalogo (research.md #2).
 */
@Controller
public class AppShellController {

    @GetMapping("/")
    public String index() {
        return "forward:/index.html";
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId) {
        return "forward:/index.html";
    }
}
