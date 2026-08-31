package com.nullpointertalk.room;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import tools.jackson.databind.ObjectMapper;

/**
 * Serve o shell da aplicacao. As DUAS rotas renderizam o mesmo template, e e' isso que
 * faz o roteamento no cliente funcionar: /room/jogos aberto direto (link compartilhado,
 * F5, bookmark) precisa devolver a aplicacao inteira com aquele canal marcado como ativo,
 * nao uma pagina diferente.
 *
 * Dois metodos em vez de um @GetMapping({"/", "/room/{roomId}"}) com PathVariable
 * opcional: a forma combinada funciona, mas esconde o ramo de "sala desconhecida" e
 * deixa implicito o caso de roomId nulo. O shell() privado garante que as duas rotas
 * produzem exatamente o mesmo modelo.
 */
@Controller
public class AppShellController {

    private final RoomCatalog roomCatalog;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AppShellController(RoomCatalog roomCatalog) {
        this.roomCatalog = roomCatalog;
    }

    @GetMapping("/")
    public String index(Model model) {
        return shell(null, model);
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId, Model model) {
        RoomInfo active = roomCatalog.find(roomId);
        if (active == null) {
            // redirect em vez de 404: um link velho ou id digitado errado deve cair dentro
            // da aplicacao, nao na pagina de erro do Spring - e o shell tem um estado
            // "nenhum canal ativo" de verdade pra receber essa pessoa.
            return "redirect:/";
        }
        return shell(active, model);
    }

    private String shell(RoomInfo active, Model model) {
        model.addAttribute("rooms", roomCatalog.all());
        model.addAttribute("activeRoom", active);
        // O catalogo vai pro JS num atributo data-, e nao por um /api/rooms: e' uma lista
        // fixa no codigo que o servidor ja tem na mao enquanto renderiza, entao um fetch
        // seria round-trip garantido e uma segunda fonte de verdade pras mesmas 4 linhas
        // que a sidebar ja renderiza aqui.
        //
        // Vai como ATRIBUTO e nao dentro de <script type="application/json"> porque o
        // conteudo de <script> e' parseado em "script data state", que nao decodifica
        // character references: o &quot; que o th:text gera chegaria literal e o
        // JSON.parse quebraria. Valor de atributo o parser decodifica normalmente.
        model.addAttribute("roomsJson", objectMapper.writeValueAsString(roomCatalog.all()));
        return "shell";
    }
}
