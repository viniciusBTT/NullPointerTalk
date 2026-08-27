/** FNV-1a hash -> hue. Saturacao/luminosidade fixas: só o hue varia, garante contraste
 * legível com texto branco em qualquer hue. */
export function colorFor(seed: string | null | undefined): string {
  const text = String(seed ?? '')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `hsl(${h % 360} 58% 42%)`
}

export function initialsFor(name: string | null | undefined): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
  }
  const first = Array.from(words[0])[0] ?? ''
  const last = Array.from(words[words.length - 1])[0] ?? ''
  return (first + last).toUpperCase()
}
