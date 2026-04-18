# Architecture Decision: Neon + Prisma for Phase 3.1

**Decision Date:** 2026-04-18  
**Status:** APPROVED  
**Decision Maker:** User (joeydd032995-pixel)

## Context

Phase 3 specification initially locked in Supabase for persistent data (Phase 3.1: Watchlist + Bet Tracker). During development, architectural evaluation revealed that the project would benefit from using Neon PostgreSQL + Prisma ORM instead.

## Decision

**Keep Neon + Prisma** (Option 1)

### Rationale

1. **Type Safety:** Prisma auto-generates TypeScript types directly from the schema, providing compile-time safety across all data operations
2. **Developer Experience:** Native TypeScript support eliminates the impedance mismatch of Supabase's generated client
3. **ORM Benefits:** Prisma migrations, introspection, and seed scripts provide better long-term maintainability
4. **Query Optimization:** Prisma's query engine and indexing strategies align with the application's access patterns (userId + gameId lookups)
5. **Cost:** Neon's free tier meets MVP requirements with flexible scaling for future growth

### Implementation Details

- **Database:** Neon PostgreSQL (free tier)
- **ORM:** Prisma v5 with auto-generated types
- **Schema:** 3 tables (WatchlistItem, Bet, Bankroll) with userId-based row-level security
- **Singleton Pattern:** PrismaClient singleton (lib/prisma.ts) prevents multiple instances in development
- **Server-Side Rendering:** All data fetching via server components with Promise.all for parallel queries

### Files Affected

- `prisma/schema.prisma` - table definitions
- `lib/prisma.ts` - singleton PrismaClient
- `app/dashboard/page.tsx` - server component with auth() and Prisma queries
- `app/watchlist/page.tsx` - watchlist display with userId filtering
- `app/bets/page.tsx` - bet tracking with computed stats (P/L, win rate)

### Testing Checklist

- [ ] Connect Neon database and verify /dashboard renders live data
- [ ] Verify /watchlist and /bets pages authenticate and filter by userId
- [ ] Test Prisma migrations on Neon
- [ ] Verify bankroll calculations reflect bet outcomes
- [ ] Regression test: /api/predictions, /api/results, /api/backfill still functional

## Migration Path (if reverting)

If future requirements necessitate reverting to Supabase:
1. Extract schema from Prisma → Supabase schema definitions
2. Replace Prisma queries with Supabase client calls (supabase.from().select())
3. Update row-level security rules in Supabase
4. Estimated effort: 4-6 hours

## Approved By

- User: joeydd032995-pixel ✅ (2026-04-18)
