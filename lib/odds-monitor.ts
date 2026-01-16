import type { OddsData } from "./types"

export interface OddsMovement {
  gameId: string
  betType: "moneyline" | "spread" | "total"
  side: string
  oldOdds: number
  newOdds: number
  movement: number
  timestamp: Date
  significant: boolean
}

export interface Alert {
  id: string
  gameId: string
  message: string
  type: "edge" | "movement" | "threshold"
  timestamp: Date
  read: boolean
}

export class OddsMonitor {
  private previousOdds: Map<string, OddsData> = new Map()
  private movements: OddsMovement[] = []
  private alerts: Alert[] = []
  private readonly SIGNIFICANT_MOVEMENT = 10 // 10 points is significant

  // Update odds and track movements
  updateOdds(newOdds: OddsData[]): OddsMovement[] {
    const newMovements: OddsMovement[] = []

    newOdds.forEach((current) => {
      const previous = this.previousOdds.get(current.gameId)

      if (previous) {
        // Check moneyline movements
        const mlHomeMovement = this.checkMovement(
          current.gameId,
          "moneyline",
          "home",
          previous.moneylineHome,
          current.moneylineHome,
        )
        if (mlHomeMovement) newMovements.push(mlHomeMovement)

        const mlAwayMovement = this.checkMovement(
          current.gameId,
          "moneyline",
          "away",
          previous.moneylineAway,
          current.moneylineAway,
        )
        if (mlAwayMovement) newMovements.push(mlAwayMovement)

        // Check spread movements
        if (previous.spreadHome !== current.spreadHome || previous.spreadHomeOdds !== current.spreadHomeOdds) {
          const spreadMovement = this.checkMovement(
            current.gameId,
            "spread",
            `home ${current.spreadHome}`,
            previous.spreadHomeOdds,
            current.spreadHomeOdds,
          )
          if (spreadMovement) newMovements.push(spreadMovement)
        }

        // Check total movements
        if (previous.totalOver !== current.totalOver || previous.totalOverOdds !== current.totalOverOdds) {
          const totalMovement = this.checkMovement(
            current.gameId,
            "total",
            `O ${current.totalOver}`,
            previous.totalOverOdds,
            current.totalOverOdds,
          )
          if (totalMovement) newMovements.push(totalMovement)
        }
      }

      this.previousOdds.set(current.gameId, current)
    })

    this.movements.push(...newMovements)
    return newMovements
  }

  // Check if odds have moved
  private checkMovement(
    gameId: string,
    betType: "moneyline" | "spread" | "total",
    side: string,
    oldOdds: number,
    newOdds: number,
  ): OddsMovement | null {
    if (oldOdds === newOdds) return null

    const movement = newOdds - oldOdds
    const significant = Math.abs(movement) >= this.SIGNIFICANT_MOVEMENT

    return {
      gameId,
      betType,
      side,
      oldOdds,
      newOdds,
      movement,
      timestamp: new Date(),
      significant,
    }
  }

  // Add an alert
  addAlert(gameId: string, message: string, type: "edge" | "movement" | "threshold"): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId,
      message,
      type,
      timestamp: new Date(),
      read: false,
    }

    this.alerts.push(alert)
  }

  // Get all movements
  getMovements(): OddsMovement[] {
    return [...this.movements]
  }

  // Get significant movements
  getSignificantMovements(): OddsMovement[] {
    return this.movements.filter((m) => m.significant)
  }

  // Get movements for a game
  getGameMovements(gameId: string): OddsMovement[] {
    return this.movements.filter((m) => m.gameId === gameId)
  }

  // Get all alerts
  getAlerts(): Alert[] {
    return [...this.alerts]
  }

  // Get unread alerts
  getUnreadAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.read)
  }

  // Mark alert as read
  markAlertRead(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId)
    if (alert) alert.read = true
  }

  // Clear old data
  clearOldData(hours = 24): void {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    this.movements = this.movements.filter((m) => m.timestamp > cutoff)
    this.alerts = this.alerts.filter((a) => a.timestamp > cutoff)
  }

  // Simulate live odds updates (for demo purposes)
  simulateOddsUpdate(currentOdds: OddsData[]): OddsData[] {
    return currentOdds.map((odds) => {
      // Randomly adjust odds slightly
      const shouldUpdate = Math.random() < 0.3 // 30% chance of update

      if (!shouldUpdate) return odds

      const adjustOdds = (value: number) => {
        const change = Math.floor(Math.random() * 20) - 10 // -10 to +10
        return value + change
      }

      return {
        ...odds,
        moneylineHome: adjustOdds(odds.moneylineHome),
        moneylineAway: adjustOdds(odds.moneylineAway),
        spreadHomeOdds: adjustOdds(odds.spreadHomeOdds),
        spreadAwayOdds: adjustOdds(odds.spreadAwayOdds),
        totalOverOdds: adjustOdds(odds.totalOverOdds),
        totalUnderOdds: adjustOdds(odds.totalUnderOdds),
        timestamp: new Date(),
      }
    })
  }
}

// Export singleton instance
export const oddsMonitor = new OddsMonitor()
