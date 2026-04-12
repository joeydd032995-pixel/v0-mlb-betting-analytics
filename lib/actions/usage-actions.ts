"use server"
// lib/actions/usage-actions.ts
// Server Actions for free-tier daily pick quota tracking.
//
// Free users are limited to FREE_DAILY_PICK_LIMIT picks per UTC calendar day.
// Each new pick view increments the counter via incrementPickUsage().
// The SubscriptionProvider calls getPicksUsedToday() at page load to seed
// the client-side count.

import { auth } from "@clerk/nextjs/server"
import { db, dailyPickUsage } from "@/lib/db"
import { eq, and, sql } from "drizzle-orm"

/** Returns today's date as a YYYY-MM-DD string in UTC. */
function todayUtc(): string {
  return new Date().toISOString().split("T")[0]
}

// ---------------------------------------------------------------------------
// getPicksUsedToday
// ---------------------------------------------------------------------------
// Returns the number of picks the current user has already viewed today.
// Returns 0 for unauthenticated users and when the DB is not configured.
export async function getPicksUsedToday(): Promise<number> {
  const { userId } = await auth()
  if (!userId) return 0

  try {
    const rows = await db
      .select({ pickCount: dailyPickUsage.pickCount })
      .from(dailyPickUsage)
      .where(
        and(
          eq(dailyPickUsage.clerkId, userId),
          eq(dailyPickUsage.date, todayUtc())
        )
      )
      .limit(1)

    return rows[0]?.pickCount ?? 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// incrementPickUsage
// ---------------------------------------------------------------------------
// Increments (or creates) the daily pick counter for the current user.
// Uses an INSERT … ON CONFLICT DO UPDATE so a single round-trip handles both
// first-view-of-the-day and subsequent views.
// Returns the updated count (useful for client-side state updates).
export async function incrementPickUsage(): Promise<number> {
  const { userId } = await auth()
  if (!userId) return 0

  const today = todayUtc()

  try {
    await db
      .insert(dailyPickUsage)
      .values({ clerkId: userId, date: today, pickCount: 1 })
      .onConflictDoUpdate({
        target: [dailyPickUsage.clerkId, dailyPickUsage.date],
        set: {
          pickCount: sql`${dailyPickUsage.pickCount} + 1`,
        },
      })

    const rows = await db
      .select({ pickCount: dailyPickUsage.pickCount })
      .from(dailyPickUsage)
      .where(
        and(
          eq(dailyPickUsage.clerkId, userId),
          eq(dailyPickUsage.date, today)
        )
      )
      .limit(1)

    return rows[0]?.pickCount ?? 1
  } catch {
    return 0
  }
}
