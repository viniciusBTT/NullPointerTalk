export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * O backend sempre devolve erro como JSON (ResponseStatusException), nunca a pagina de
 * erro HTML padrao do Spring - por isso tentamos res.json() sem checar Content-Type antes
 * (contracts/backend-api.md -> Erros).
 */
async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return typeof body?.message === 'string' ? body.message : fallback
  } catch {
    return fallback
  }
}

async function request<T>(path: string, init?: RequestInit, fallbackErrorMessage?: string): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    throw new ApiError(
      await parseErrorMessage(res, fallbackErrorMessage ?? `Falha na requisicao (${res.status}).`),
      res.status,
    )
  }
  if (res.status === 204) {
    return undefined as T
  }
  return res.json() as Promise<T>
}

export function get<T>(path: string, fallbackErrorMessage?: string): Promise<T> {
  return request<T>(path, undefined, fallbackErrorMessage)
}

export function post<T>(path: string, body: unknown, fallbackErrorMessage?: string): Promise<T> {
  return request<T>(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    fallbackErrorMessage,
  )
}

export function put<T>(path: string, body: unknown, fallbackErrorMessage?: string): Promise<T> {
  return request<T>(
    path,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    fallbackErrorMessage,
  )
}

export function del<T>(path: string, fallbackErrorMessage?: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, fallbackErrorMessage)
}
