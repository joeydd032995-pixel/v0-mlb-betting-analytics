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
]

// ─── Input validation ──────────────────────────────────────────────────────────

const schemas = {
  get_todays_slate: z.object({ date: z.string().optional() }),
  get_game_linescore: z.object({ gamePk: z.number() }),
  get_pitcher_stats: z.object({ playerId: z.number(), season: z.number().optional() }),
  get_pitcher_first_inning_splits: z.object({ playerId: z.number(), season: z.number().optional() }),
  get_team_stats: z.object({ teamId: z.number(), season: z.number().optional() }),
  get_todays_starters: z.object({}),
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

/** Runs a tool by name. Never throws — failures come back as `{error}` so the caller can surface an `is_error` tool_result. */
export async function runTool(name: string, rawInput: unknown): Promise<unknown> {
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
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed." }
  }
}
