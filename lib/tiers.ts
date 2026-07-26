// lib/tiers.ts
// Pure tier vocabulary + feature matrix. NO server-only imports (no Prisma, no
// Clerk) so this can be imported from client components as well as routes.
// lib/subscription.ts owns the *lookup* (who is on which tier); this file owns
// the *rules* (what each tier unlocks).

export type Tier = "FREE" | "PRO" | "ELITE"

// Feature access matrix — single source of truth for what each tier unlocks.
export type Feature =
  | "all_games"         // PRO+: see all games (not just the top-1 free teaser)
  | "recommendation"    // PRO+: recommendation badge (STRONG_NRFI, etc.)
  | "confidence"        // PRO+: confidence badge / score
  | "value_analysis"    // PRO+: value analysis panel (edge, Kelly, EV)
  | "factors"           // PRO+: key factors list
  | "pitcher_stats"     // PRO+: pitcher deep-dive tab
  | "model_breakdown"   // ELITE: 7-model breakdown panel
  | "deepnrfi"          // ELITE: DeepNRFI LightGBM layer
  | "montecarlo"        // ELITE: Monte Carlo simulations
  | "ensemble_weights"  // ELITE: ensemble version breakdown
  | "api_access"        // ELITE: raw API access

const TIER_RANK: Record<Tier, number> = { FREE: 0, PRO: 1, ELITE: 2 }

export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  all_games:        "PRO",
  recommendation:   "PRO",
  confidence:       "PRO",
  value_analysis:   "PRO",
  factors:          "PRO",
  pitcher_stats:    "PRO",
  model_breakdown:  "ELITE",
  deepnrfi:         "ELITE",
  montecarlo:       "ELITE",
  ensemble_weights: "ELITE",
  api_access:       "ELITE",
}

export function hasAccess(tier: Tier, feature: Feature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

// Normalises a raw tier string (e.g. from the DB, where Subscription.tier is a
// plain String column) to a known Tier. Anything unrecognised is FREE — an
// unexpected value must never reach the UI, which indexes tier-keyed config maps
// directly.
export function normaliseTier(raw: string): Tier {
  const t = raw.trim().toUpperCase()
  return t === "ELITE" || t === "PRO" ? t : "FREE"
}
