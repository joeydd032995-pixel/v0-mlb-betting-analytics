import { createClient } from "@supabase/supabase-js"
import { createBrowserClient } from "@supabase/ssr"

// Server-side Supabase client (admin access)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Browser-side Supabase client (respects RLS)
export function createBrowserClientSide() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Type definitions for database tables
export interface WatchlistItem {
  id: string
  user_id: string
  game_id: string
  created_at: string
}

export interface Bet {
  id: string
  user_id: string
  game_id: string
  amount: number
  odds: number
  prediction: "NRFI" | "YRFI"
  result?: "NRFI" | "YRFI" | null
  pnl?: number | null
  created_at: string
  updated_at: string
}

export interface Bankroll {
  id: string
  user_id: string
  starting_balance: number
  current_balance: number
  updated_at: string
}
