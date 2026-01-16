"use client"

import { useState, useEffect } from "react"
import type { OddsData, BettingEdge } from "../types"
import { oddsMonitor, type OddsMovement, type Alert } from "../odds-monitor"

export function useOddsMonitor(initialOdds: OddsData[], edges: BettingEdge[], enableSimulation = true) {
  const [odds, setOdds] = useState<OddsData[]>(initialOdds)
  const [movements, setMovements] = useState<OddsMovement[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Simulate live odds updates
  useEffect(() => {
    if (!enableSimulation || !mounted) return

    const interval = setInterval(() => {
      const updatedOdds = oddsMonitor.simulateOddsUpdate(odds)
      const newMovements = oddsMonitor.updateOdds(updatedOdds)

      // Generate alerts for significant movements
      newMovements.forEach((movement) => {
        if (movement.significant) {
          oddsMonitor.addAlert(
            movement.gameId,
            `Significant ${movement.betType} movement: ${movement.side} moved ${movement.movement > 0 ? "+" : ""}${movement.movement}`,
            "movement",
          )
        }
      })

      // Generate alerts for high-value edges
      edges.forEach((edge) => {
        if (edge.edgePercent > 5 && Math.random() < 0.1) {
          // 10% chance to alert on high edges
          oddsMonitor.addAlert(
            edge.gameId,
            `High edge detected: ${edge.side} at ${edge.edgePercent.toFixed(1)}% edge`,
            "edge",
          )
        }
      })

      setOdds(updatedOdds)
      setMovements(oddsMonitor.getMovements())
      setAlerts(oddsMonitor.getAlerts())
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [odds, edges, enableSimulation, mounted])

  // Initial odds update
  useEffect(() => {
    oddsMonitor.updateOdds(initialOdds)
    setMovements(oddsMonitor.getMovements())
    setAlerts(oddsMonitor.getAlerts())
  }, [initialOdds])

  const markAlertRead = (alertId: string) => {
    oddsMonitor.markAlertRead(alertId)
    setAlerts(oddsMonitor.getAlerts())
  }

  const clearOldData = () => {
    oddsMonitor.clearOldData()
    setMovements(oddsMonitor.getMovements())
    setAlerts(oddsMonitor.getAlerts())
  }

  return {
    odds,
    movements,
    significantMovements: movements.filter((m) => m.significant),
    alerts,
    unreadAlerts: alerts.filter((a) => !a.read),
    markAlertRead,
    clearOldData,
  }
}
