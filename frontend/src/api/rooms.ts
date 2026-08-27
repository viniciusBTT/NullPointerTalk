import { del, get, post, put } from './http'

export interface RoomInfo {
  id: string
  name: string
  icon: string
}

export interface RoomCreateRequest {
  id: string
  name: string
  icon: string
}

export interface RoomUpdateRequest {
  name: string
  icon: string
}

export function listRooms(): Promise<RoomInfo[]> {
  return get<RoomInfo[]>('/api/rooms', 'Falha ao carregar a lista de salas.')
}

export function createRoom(body: RoomCreateRequest): Promise<RoomInfo> {
  return post<RoomInfo>('/api/rooms', body, 'Não foi possível salvar a sala.')
}

export function updateRoom(roomId: string, body: RoomUpdateRequest): Promise<RoomInfo> {
  return put<RoomInfo>(`/api/rooms/${encodeURIComponent(roomId)}`, body, 'Não foi possível salvar a sala.')
}

export function deleteRoom(roomId: string): Promise<void> {
  return del<void>(`/api/rooms/${encodeURIComponent(roomId)}`, 'Falha ao apagar a sala.')
}
