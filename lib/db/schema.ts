// lib/db/schema.ts
// Drizzle ORM schema for subscription tracking and free-tier daily quota.
//
// Tables:
//   users_subscriptions  — one row per Clerk user, tracks their Stripe subscription
//   daily_pick_usage     — one row per (clerkId, UTC date), counts free-tier picks viewed

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// users_subscriptions
// ---------------------------------------------------------------------------
// Upserted by the Stripe webhook on every subscription lifecycle event.
// clerkId is the PK — one subscription record per user.
//
// tier values: 'free' | 'daily' | 'weekly' | 'monthly' | 'annual'
// status mirrors Stripe's subscription.status: 'active' | 'trialing' |
//   'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired'
export const usersSubscriptions = pgTable("users_subscriptions", {
  clerkId:              text("clerk_id").primaryKey(),
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  priceId:              text("price_id"),
  tier:                 text("tier").notNull().default("free"),
  status:               text("status").notNull().default("active"),
  currentPeriodEnd:     timestamp("current_period_end"),
  cancelAtPeriodEnd:    boolean("cancel_at_period_end").default(false).notNull(),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
})

export type UserSubscription = typeof usersSubscriptions.$inferSelect
export type NewUserSubscription = typeof usersSubscriptions.$inferInsert

// ---------------------------------------------------------------------------
// daily_pick_usage
// ---------------------------------------------------------------------------
// Tracks how many NRFI picks a free-tier user has viewed on a given UTC day.
// Composite PK on (clerkId, date) → one row per user per calendar day.
// pickCount is incremented on each new pick view (capped at FREE_DAILY_LIMIT
// in application logic before the page renders).
export const dailyPickUsage = pgTable(
  "daily_pick_usage",
  {
    clerkId:   text("clerk_id").notNull(),
    date:      text("date").notNull(),        // YYYY-MM-DD UTC
    pickCount: integer("pick_count").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clerkId, t.date] }),
  })
)

export type DailyPickUsage = typeof dailyPickUsage.$inferSelect
