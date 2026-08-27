import { get } from './http'

export interface ChatMessageView {
  id: string
  roomId: string
  stableId: string
  name: string
  text: string
  timestamp: number
}

export function fetchMessages(roomId: string, after?: number): Promise<ChatMessageView[]> {
  const query = after !== undefined ? `?after=${after}` : ''
  return get<ChatMessageView[]>(
    `/api/rooms/${encodeURIComponent(roomId)}/messages${query}`,
    'Falha ao carregar histórico do chat.',
  )
}
