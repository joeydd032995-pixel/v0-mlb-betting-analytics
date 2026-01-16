"use client"

import { useState, useEffect } from "react"
import type { Bet, BankrollStats } from "../types"
import { BankrollManager } from "../bankroll-manager"

const STORAGE_KEY = "mlb-betting-bankroll"
const BETS_KEY = "mlb-betting-bets"

export function useBankroll(initialBankroll = 10000) {
  const [manager, setManager] = useState<BankrollManager | null>(null)
  const [stats, setStats] = useState<BankrollStats | null>(null)
  const [bets, setBets] = useState<Bet[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const storedBankroll = localStorage.getItem(STORAGE_KEY)
    const storedBets = localStorage.getItem(BETS_KEY)

    const bankrollManager = new BankrollManager(initialBankroll)

    if (storedBankroll && storedBets) {
      try {
        const parsedBets: Bet[] = JSON.parse(storedBets).map((b: any) => ({
          ...b,
          placedAt: new Date(b.placedAt),
          settledAt: b.settledAt ? new Date(b.settledAt) : undefined,
        }))
        bankrollManager.importBets(parsedBets, Number(storedBankroll))
      } catch (error) {
        console.error("[v0] Failed to load bankroll data:", error)
      }
    }

    setManager(bankrollManager)
    updateData(bankrollManager)
  }, [initialBankroll, mounted])

  const updateData = (bankrollManager: BankrollManager) => {
    setStats(bankrollManager.getStats())
    setBets(bankrollManager.getBets())
  }

  const saveToStorage = (bankrollManager: BankrollManager) => {
    const currentStats = bankrollManager.getStats()
    localStorage.setItem(STORAGE_KEY, currentStats.totalBankroll.toString())
    localStorage.setItem(BETS_KEY, JSON.stringify(bankrollManager.getBets()))
  }

  const placeBet = (bet: Omit<Bet, "id">) => {
    if (!manager) return

    manager.placeBet(bet)
    updateData(manager)
    saveToStorage(manager)
  }

  const settleBet = (betId: string, result: "win" | "loss" | "push", profit: number) => {
    if (!manager) return

    manager.settleBet(betId, result, profit)
    updateData(manager)
    saveToStorage(manager)
  }

  const resetBankroll = (newStartingBankroll?: number) => {
    if (!manager) return

    manager.reset(newStartingBankroll)
    updateData(manager)
    saveToStorage(manager)
  }

  return {
    stats,
    bets,
    placeBet,
    settleBet,
    resetBankroll,
    manager,
  }
}
