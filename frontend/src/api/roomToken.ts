export interface RoomTokenResponse {
  token: string
  url: string
}

export async function fetchRoomToken(
  roomId: string,
  identity: string,
  name: string,
  signal?: AbortSignal,
): Promise<RoomTokenResponse> {
  const query = new URLSearchParams({ identity, name })
  const res = await fetch(`/room/${encodeURIComponent(roomId)}/token?${query}`, { signal })
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Este canal não existe mais.' : 'Falha ao obter o token de acesso do canal.')
  }
  return res.json() as Promise<RoomTokenResponse>
}
