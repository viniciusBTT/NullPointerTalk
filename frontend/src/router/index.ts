import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { h } from 'vue'
import { usePresenceStore } from '@/stores/presence'

// Sem <router-view>: o shell (App.vue) e' persistente atraves de navegacao entre salas
// (a sessao de voz/chat nao pode ser desmontada a cada troca de canal) - o router serve
// so pra sincronizar a URL e o roomId ativo, nunca pra trocar componentes de tela. Por
// isso as rotas abaixo tem um componente vazio: nada e' de fato renderizado por ele.
const empty = { render: () => h('div') }

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: empty },
  { path: '/room/:roomId', name: 'room', component: empty, props: true },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

/**
 * Equivalente ao "redirect:/" que hoje vive em AppShellController.room(): como o shell
 * deixou de ser renderizado no servidor, quem decide se um roomId existe e' o cliente,
 * depois de carregar o catalogo (research.md #2).
 */
router.beforeEach(async (to) => {
  if (to.name !== 'room') {
    return true
  }
  const presence = usePresenceStore()
  await presence.ensureCatalogLoaded()
  const roomId = to.params.roomId as string
  if (!presence.hasRoom(roomId)) {
    return { name: 'home' }
  }
  return true
})

export function activeRoomId(): string | null {
  const current = router.currentRoute.value
  return current.name === 'room' ? (current.params.roomId as string) : null
}
