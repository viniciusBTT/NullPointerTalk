import { reactive } from 'vue'

export interface Toast {
  id: number
  message: string
  type: 'info' | 'error'
}

export interface Banner {
  id: number
  message: string
  dismissible: boolean
  actionLabel?: string
  onAction?: () => void
}

let nextId = 1

export const toasts = reactive<Toast[]>([])
export const banners = reactive<Banner[]>([])

export function useUiFeedback() {
  function showToast(message: string, { type = 'info' as const, durationMs = 4000 } = {}): void {
    const id = nextId++
    toasts.push({ id, message, type })
    setTimeout(() => {
      const index = toasts.findIndex((toast) => toast.id === id)
      if (index !== -1) toasts.splice(index, 1)
    }, durationMs)
  }

  /** Devolve uma funcao pra dispensar o banner programaticamente (ex: reconexao deu certo). */
  function showBanner(
    message: string,
    { dismissible = true, actionLabel, onAction }: { dismissible?: boolean; actionLabel?: string; onAction?: () => void } = {},
  ): () => void {
    const id = nextId++
    banners.push({ id, message, dismissible, actionLabel, onAction })
    return () => dismissBanner(id)
  }

  function dismissBanner(id: number): void {
    const index = banners.findIndex((banner) => banner.id === id)
    if (index !== -1) banners.splice(index, 1)
  }

  return { showToast, showBanner, dismissBanner }
}
