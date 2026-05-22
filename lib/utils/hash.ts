/** Deterministic 32-bit FNV-1a hash — used to seed the Monte Carlo RNG from a game ID. */
export function hashGameId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
