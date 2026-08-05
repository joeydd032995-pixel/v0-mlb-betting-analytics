import { z } from "zod"
import type Anthropic from "@anthropic-ai/sdk"
import { getLiveGameSlate } from "@/lib/api/live-data"
import {
  fetchGameLinescore,
  fetchPitcherStats,
  fetchPitcherFirstInningSplits,
  fetchTeamStats,
  fetchAllActiveStarters,
} from "@/lib/api/mlb-stats"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { applyTierGating } from "@/lib/tier-gating"
import { hasAccess, type Tier } from "@/lib/tiers"
import { loadFreePickAccuracy } from "@/lib/server/free-pick-accuracy-query"
import {
  getUserBetsSummary,
  getUserBankrollSummary,
  getUserWatchlist,
} from "@/lib/server/user-chat-data"

/**
 * Who is asking. Threaded from /api/chat (Clerk session + resolved tier) down
 * through the provider chain and both tool loops to runTool.
 *
 * This exists so tools can enforce the paywall and scope user data. The model
 * never sees or supplies either field — they come from the server session, so
 * there is no argument it can craft to read another user's rows or a tier it
 * hasn't paid for.
 */
export interface ToolContext {
  userId: string
  tier: Tier
}

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

// ─── Tool definitions (Anthropic tool-use schema) ─────────────────────────────

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_todays_slate",
    description:
      "Get today's (or a given date's) MLB matchups: home/away teams, probable pitchers, venue, and NRFI/YRFI odds summary. Use for 'what games are on today', 'who's pitching tonight', etc.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ET date as YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "get_game_linescore",
    description: "Get the inning-by-inning linescore (runs/hits/errors per inning) for a specific game.",
    input_schema: {
      type: "object",
      properties: {
        gamePk: { type: "number", description: "MLB gamePk identifier (the Game.id from get_todays_slate)." },
      },
      required: ["gamePk"],
    },
  },
  {
    name: "get_pitcher_stats",
    description: "Get a pitcher's current-season pitching stats (ERA, WHIP, K/BB, innings pitched, etc.).",
    input_schema: {
      type: "object",
      properties: {
        playerId: { type: "number", description: "MLBAM player ID." },
        season: { type: "number", description: "Season year. Defaults to the current season." },
      },
      required: ["playerId"],
    },
  },
  {
    name: "get_pitcher_first_inning_splits",
    description:
      "Get a pitcher's first-inning-only stats (ERA, WHIP, runs allowed in the 1st) — directly relevant to NRFI/YRFI questions.",
    input_schema: {
      type: "object",
      properties: {
        playerId: { type: "number", description: "MLBAM player ID." },
        season: { type: "number", description: "Season year. Defaults to the current season." },
      },
      required: ["playerId"],
    },
  },
  {
    name: "get_team_stats",
    description: "Get a team's current-season hitting stats (AVG, OBP, SLG, OPS, runs).",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "number", description: "MLB numeric team ID." },
        season: { type: "number", description: "Season year. Defaults to the current season." },
      },
      required: ["teamId"],
    },
  },
  {
    name: "get_todays_starters",
    description: "Get all currently active starting pitchers league-wide, grouped by team.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_predictions",
    description:
      "Get THIS APP'S OWN NRFI/YRFI model predictions for a date: NRFI probability, confidence, recommendation, and value/edge analysis per game. Use this for 'what's your pick', 'best NRFI tonight', 'what does the model say' — prefer it over reasoning from raw stats yourself. Results are limited to what the user's subscription includes; games they can't see come back marked locked.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ET date as YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "get_game_analysis",
    description:
      "Get the model's detailed reasoning for ONE game: probabilities, key factors, and — for ELITE subscribers — the full 7-model ensemble breakdown. Use for 'why do you like that game', 'break down the model on X'.",
    input_schema: {
      type: "object",
      properties: {
        gamePk: { type: "number", description: "MLB gamePk identifier (Game.id from get_todays_slate or get_predictions)." },
        date: { type: "string", description: "ET date as YYYY-MM-DD the game is on. Defaults to today." },
      },
      required: ["gamePk"],
    },
  },
  {
    name: "get_model_accuracy",
    description:
      "Get the published track record of the model's daily free pick: total graded picks, how many were correct, hit rate, and the date range covered. Use for 'how accurate is the model', 'what's your record'.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_my_bets",
    description:
      "Get the signed-in user's own betting record: win/loss, net profit or loss, amount staked, and their most recent bets. Use for 'how am I doing', 'what are my open bets', 'am I up this month'.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "settled", "pending"],
          description: "Filter to settled or still-pending bets. Defaults to all.",
        },
      },
    },
  },
  {
    name: "get_my_bankroll",
    description:
      "Get the signed-in user's bankroll: starting balance, current balance, net change, and recent ledger entries. Use for 'what's my bankroll', 'how much have I made'.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_my_watchlist",
    description: "Get the game IDs the signed-in user has saved to their watchlist.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
]

// ─── Input validation ──────────────────────────────────────────────────────────

const schemas = {
  get_todays_slate: z.object({ date: z.string().optional() }),
  get_game_linescore: z.object({ gamePk: z.number() }),
  get_pitcher_stats: z.object({ playerId: z.number(), season: z.number().optional() }),
  get_pitcher_first_inning_splits: z.object({ playerId: z.number(), season: z.number().optional() }),
  get_team_stats: z.object({ teamId: z.number(), season: z.number().optional() }),
  get_todays_starters: z.object({}),
  get_predictions: z.object({ date: z.string().optional() }),
  get_game_analysis: z.object({ gamePk: z.number(), date: z.string().optional() }),
  get_model_accuracy: z.object({}),
  get_my_bets: z.object({ status: z.enum(["all", "settled", "pending"]).optional() }),
  get_my_bankroll: z.object({}),
  get_my_watchlist: z.object({}),
} as const

export type ChatToolName = keyof typeof schemas

// ─── Dispatcher ────────────────────────────────────────────────────────────────

async function getTodaysSlate(input: z.infer<typeof schemas.get_todays_slate>) {
  const date = input.date ?? todayET()
  const { games, pitchers, teams } = await getLiveGameSlate(date)

  return {
    date,
    games: games.map((g) => {
      const home = teams.get(g.homeTeamId)
      const away = teams.get(g.awayTeamId)
      const homePitcher = pitchers.get(g.homePitcherId)
      const awayPitcher = pitchers.get(g.awayPitcherId)
      return {
        gamePk: Number(g.id),
        time: g.time,
        venue: g.venue,
        homeTeam: home ? `${home.city} ${home.name}` : g.homeTeamId,
        awayTeam: away ? `${away.city} ${away.name}` : g.awayTeamId,
        homePitcher: homePitcher?.name ?? "TBD",
        awayPitcher: awayPitcher?.name ?? "TBD",
        odds: g.odds
          ? { nrfiOdds: g.odds.nrfiOdds, yrfiOdds: g.odds.yrfiOdds, bookmaker: g.odds.bookmaker }
          : null,
      }
    }),
  }
}

/**
 * Computes a date's predictions and returns them already tier-gated.
 *
 * ⚠️ The whole slate is gated in one call, deliberately. applyTierGating ranks
 * by confidenceScore to choose the single game a FREE user may see, so handing
 * it a one-game subset would make that game "top" unconditionally — letting a
 * FREE user walk the entire slate by asking about games one at a time. Callers
 * that want one game must filter the gated output, never gate a filtered input.
 * See the header comment on applyTierGating in lib/tier-gating.ts.
 */
async function gatedPredictionsForDate(date: string, tier: Tier) {
  const { games, pitchers, teams } = await getLiveGameSlate(date)
  if (games.length === 0) return { date, empty: true as const, gated: [], lockedCount: 0 }

  const raw = computeAllPredictions(games, pitchers, teams)
  const { gated, lockedCount } = applyTierGating(raw, tier)
  return { date, empty: false as const, gated, lockedCount }
}

function isLocked(p: unknown): boolean {
  return (p as { _tierLocked?: boolean })?._tierLocked === true
}

/**
 * Runs a tool by name. Never throws — failures come back as `{error}` so the
 * caller can surface an `is_error` tool_result.
 *
 * `ctx` carries the caller's identity and tier from the server session. Tools
 * that touch predictions or user data must use it; the model cannot influence it.
 */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in schemas)) {
    return { error: `Unknown tool: ${name}` }
  }

  try {
    switch (name as ChatToolName) {
      case "get_todays_slate": {
        const input = schemas.get_todays_slate.parse(rawInput)
        return await getTodaysSlate(input)
      }
      case "get_game_linescore": {
        const { gamePk } = schemas.get_game_linescore.parse(rawInput)
        const linescore = await fetchGameLinescore(gamePk)
        return linescore ?? { error: "No linescore available for that game yet." }
      }
      case "get_pitcher_stats": {
        const { playerId, season } = schemas.get_pitcher_stats.parse(rawInput)
        const stats = await fetchPitcherStats(playerId, season)
        return stats ?? { error: "No stats found for that pitcher this season." }
      }
      case "get_pitcher_first_inning_splits": {
        const { playerId, season } = schemas.get_pitcher_first_inning_splits.parse(rawInput)
        const splits = await fetchPitcherFirstInningSplits(playerId, season)
        return splits ?? { error: "No first-inning splits found for that pitcher this season." }
      }
      case "get_team_stats": {
        const { teamId, season } = schemas.get_team_stats.parse(rawInput)
        const stats = await fetchTeamStats(teamId, season)
        return stats ?? { error: "No stats found for that team this season." }
      }
      case "get_todays_starters": {
        const starters = await fetchAllActiveStarters()
        return { starters }
      }

      case "get_predictions": {
        const { date } = schemas.get_predictions.parse(rawInput)
        const result = await gatedPredictionsForDate(date ?? todayET(), ctx.tier)
        if (result.empty) return { date: result.date, games: [], note: "No games scheduled for that date." }

        const visible = result.gated.filter((p) => !isLocked(p))
        return {
          date: result.date,
          tier: ctx.tier,
          predictions: visible,
          lockedCount: result.lockedCount,
          // Told to the model explicitly so it explains the paywall instead of
          // inventing numbers for games it cannot see.
          note:
            result.lockedCount > 0
              ? `${result.lockedCount} other game(s) are hidden by this user's ${ctx.tier} plan. Say they can upgrade to see the rest — do not guess at those games' numbers.`
              : undefined,
        }
      }

      case "get_game_analysis": {
        const { gamePk, date } = schemas.get_game_analysis.parse(rawInput)
        const result = await gatedPredictionsForDate(date ?? todayET(), ctx.tier)
        if (result.empty) return { error: "No games scheduled for that date." }

        // Filter the GATED output — never gate a single-game slice (see
        // gatedPredictionsForDate). A locked entry is indistinguishable from a
        // game this tier simply may not see, which is the intended behaviour.
        const match = result.gated.find((p) => String(p.gameId) === String(gamePk))
        if (!match) return { error: "No prediction found for that game on that date." }
        if (isLocked(match)) {
          return {
            gameId: String(gamePk),
            locked: true,
            tier: ctx.tier,
            error: `This game's analysis isn't included in the user's ${ctx.tier} plan. Tell them which plan unlocks it rather than estimating.`,
          }
        }

        return {
          tier: ctx.tier,
          prediction: match,
          modelBreakdownIncluded: hasAccess(ctx.tier, "model_breakdown"),
          note: hasAccess(ctx.tier, "model_breakdown")
            ? undefined
            : "The per-model ensemble breakdown is ELITE-only and has been withheld.",
        }
      }

      case "get_model_accuracy": {
        return await loadFreePickAccuracy()
      }

      case "get_my_bets": {
        const { status } = schemas.get_my_bets.parse(rawInput)
        return await getUserBetsSummary(ctx.userId, status ?? "all")
      }

      case "get_my_bankroll": {
        return await getUserBankrollSummary(ctx.userId)
      }

      case "get_my_watchlist": {
        return await getUserWatchlist(ctx.userId)
      }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed." }
  }
}
