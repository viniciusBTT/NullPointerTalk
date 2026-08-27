import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/node_modules/**'],
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      // Nomes de um so termo (Icon, Avatar, Sidebar, Stage) sao claros nesta base e nao
      // colidem com nenhum elemento HTML nativo - a regra existe pra evitar exatamente
      // essa colisao, que nao se aplica aqui.
      'vue/multi-word-component-names': 'off',
    },
  },
)
