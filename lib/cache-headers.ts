// lib/cache-headers.ts
// Response headers for anything whose body varies per user.
//
// Tier-gated bodies must never land in a shared cache: cookies are not part of
// a CDN cache key, so a `public` response generated for one caller gets
// replayed to everyone else. That is exactly how ELITE subscribers ended up
// being served the signed-out FREE payload.
export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const
