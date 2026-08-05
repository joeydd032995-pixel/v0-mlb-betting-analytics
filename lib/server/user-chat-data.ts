// lib/server/user-chat-data.ts
// Read-only, per-user summaries for the chat assistant's account-aware tools.
//
// These are deliberately separate from the /api/bets, /api/bankroll and
// /api/watchlist handlers: those return raw rows for the UI to render, while the
// assistant needs pre-aggregated answers ("how am I doing this month?"). The
// shared part is only a trivial `where: { userId }` — there is no business logic
// duplicated here.
//
// SECURITY: every function takes `userId` from the server-side Clerk session and
// filters on it. No tool exposes a user-id parameter to the model, so there is no
// argument it could supply to read another account's rows.
import { prisma } from "@/lib/prisma"

export interface UserBetsSummary {
  totalBets: number
  settled: number
  pending: number
  wins: number
  losses: number
  winRatePct: number | null
  netPnl: number
  totalStaked: number
  recent: {
    gameId: string
    prediction: string
    amount: number
    odds: number
    result: string | null
    pnl: number | null
    placedAt: string
  }[]
}

/** Bet record + P&L for one user. `status` narrows to settled or pending bets. */
export async function getUserBetsSummary(
  userId: string,
  status: "all" | "settled" | "pending" = "all"
): Promise<UserBetsSummary> {
  const bets = await prisma.bet.findMany({
    where: {
      userId,
      ...(status === "settled" ? { result: { not: null } } : {}),
      ...(status === "pending" ? { result: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  let wins = 0
  let losses = 0
  let netPnl = 0
  let totalStaked = 0
  let settled = 0

  for (const b of bets) {
    totalStaked += b.amount
    if (b.result === null) continue
    settled++
    if (b.pnl !== null) netPnl += b.pnl
    // A bet wins when the actual first-inning outcome matches what was predicted.
    if (b.result === b.prediction) wins++
    else losses++
  }

  return {
    totalBets: bets.length,
    settled,
    pending: bets.length - settled,
    wins,
    losses,
    winRatePct: settled > 0 ? Math.round((wins / settled) * 1000) / 10 : null,
    netPnl: Math.round(netPnl * 100) / 100,
    totalStaked: Math.round(totalStaked * 100) / 100,
    recent: bets.slice(0, 10).map((b) => ({
      gameId: b.gameId,
      prediction: b.prediction,
      amount: b.amount,
      odds: b.odds,
      result: b.result,
      pnl: b.pnl,
      placedAt: b.createdAt.toISOString(),
    })),
  }
}

export interface UserBankrollSummary {
  configured: boolean
  startingBalance: number | null
  currentBalance: number | null
  netChange: number | null
  netChangePct: number | null
  recentTransactions: { type: string; amount: number; note: string | null; at: string }[]
}

/** Current bankroll standing plus the last few ledger entries. */
export async function getUserBankrollSummary(userId: string): Promise<UserBankrollSummary> {
  const bankroll = await prisma.bankroll.findUnique({ where: { userId } })
  if (!bankroll) {
    return {
      configured: false,
      startingBalance: null,
      currentBalance: null,
      netChange: null,
      netChangePct: null,
      recentTransactions: [],
    }
  }

  const transactions = await prisma.bankrollTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const netChange = bankroll.currentBalance - bankroll.startingBalance

  return {
    configured: true,
    startingBalance: bankroll.startingBalance,
    currentBalance: bankroll.currentBalance,
    netChange: Math.round(netChange * 100) / 100,
    netChangePct:
      bankroll.startingBalance > 0
        ? Math.round((netChange / bankroll.startingBalance) * 1000) / 10
        : null,
    recentTransactions: transactions.map((t) => ({
      type: t.type,
      amount: t.amount,
      note: t.note ?? null,
      at: t.createdAt.toISOString(),
    })),
  }
}

/** Game IDs the user is watching, newest first. */
export async function getUserWatchlist(userId: string): Promise<{ gameIds: string[]; count: number }> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { gameId: true },
  })
  return { gameIds: items.map((i) => i.gameId), count: items.length }
}
