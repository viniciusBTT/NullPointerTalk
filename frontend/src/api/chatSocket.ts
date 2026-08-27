import { Client, type IMessage } from '@stomp/stompjs'

type Handler = (body: string) => void

interface Subscribed {
  handlers: Set<Handler>
  active: { unsubscribe: () => void } | null
}

/**
 * Cliente STOMP compartilhado (uma unica conexao pra chat e catalogo de salas).
 * Assinaturas sao desejos duraveis: sobrevivem a reconexao (o client STOMP resubscribe
 * automaticamente a cada onConnect, inclusive apos queda de rede - reconnectDelay abaixo).
 */
class ChatSocket {
  #client: Client | null = null
  #connected = false
  #subscriptions = new Map<string, Subscribed>()

  connect(): void {
    if (this.#client) {
      return
    }
    this.#client = new Client({
      brokerURL: wsUrl(),
      reconnectDelay: 4000,
      onConnect: () => {
        this.#connected = true
        for (const [destination, entry] of this.#subscriptions) {
          entry.active = this.#doSubscribe(destination, entry)
        }
      },
      onWebSocketClose: () => {
        this.#connected = false
        for (const entry of this.#subscriptions.values()) {
          entry.active = null
        }
      },
    })
    this.#client.activate()
  }

  get isConnected(): boolean {
    return this.#connected
  }

  /** Assina um destino; devolve uma funcao pra cancelar essa assinatura especifica. */
  subscribe(destination: string, handler: Handler): () => void {
    let entry = this.#subscriptions.get(destination)
    if (!entry) {
      entry = { handlers: new Set(), active: null }
      this.#subscriptions.set(destination, entry)
    }
    entry.handlers.add(handler)
    if (this.#connected && !entry.active) {
      entry.active = this.#doSubscribe(destination, entry)
    }
    return () => {
      entry.handlers.delete(handler)
      if (entry.handlers.size === 0) {
        entry.active?.unsubscribe()
        this.#subscriptions.delete(destination)
      }
    }
  }

  publish(destination: string, body: unknown): void {
    if (!this.#client || !this.#connected) {
      throw new Error('Chat desconectado, tente novamente em instantes.')
    }
    this.#client.publish({ destination, body: JSON.stringify(body) })
  }

  #doSubscribe(destination: string, entry: Subscribed) {
    return this.#client!.subscribe(destination, (frame: IMessage) => {
      for (const handler of entry.handlers) {
        handler(frame.body)
      }
    })
  }
}

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/chat`
}

export const chatSocket = new ChatSocket()
