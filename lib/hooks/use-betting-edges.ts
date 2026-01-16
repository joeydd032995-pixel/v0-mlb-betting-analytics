"use client"

import { useState, useEffect, useMemo } from "react"
import type { Projection, OddsData, BettingEdge } from "../types"
import { edgeCalculator } from "../edge-calculator"

export function useBettingEdges(projections: Map<string, Projection>, odds: OddsData[]) {
  const [edges, setEdges] = useState<BettingEdge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const calculateEdges = () => {
      const allEdges: BettingEdge[] = []

      odds.forEach((oddsData) => {
        const projection = projections.get(oddsData.gameId)
        if (projection) {
          const gameEdges = edgeCalculator.findEdges(projection, oddsData)
          allEdges.push(...gameEdges)
        }
      })

      setEdges(allEdges)
      setLoading(false)
    }

    if (projections.size > 0) {
      calculateEdges()
    }
  }, [projections, odds])

  // Get top edges (most profitable)
  const topEdges = useMemo(() => {
    return edges.slice(0, 10)
  }, [edges])

  // Group edges by game
  const edgesByGame = useMemo(() => {
    const grouped = new Map<string, BettingEdge[]>()

    edges.forEach((edge) => {
      const gameEdges = grouped.get(edge.gameId) || []
      gameEdges.push(edge)
      grouped.set(edge.gameId, gameEdges)
    })

    return grouped
  }, [edges])

  // Filter edges by criteria
  const filterEdges = (minEdge: number, minConfidence: number) => {
    return edges.filter((edge) => edge.edgePercent >= minEdge && edge.confidence >= minConfidence)
  }

  return {
    edges,
    topEdges,
    edgesByGame,
    loading,
    filterEdges,
  }
}
