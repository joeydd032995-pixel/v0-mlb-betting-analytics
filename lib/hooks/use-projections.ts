"use client"

import { useState, useEffect } from "react"
import type { Game, Projection } from "../types"
import { projectionsEngine } from "../projections-engine"

export function useProjections(games: Game[]) {
  const [projections, setProjections] = useState<Map<string, Projection>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const generateProjections = () => {
      const newProjections = new Map<string, Projection>()

      games.forEach((game) => {
        try {
          const projection = projectionsEngine.generateEnsembleProjection(game)
          newProjections.set(game.id, projection)
        } catch (error) {
          console.error("[v0] Error generating projection for game", game.id, error)
        }
      })

      setProjections(newProjections)
      setLoading(false)
    }

    generateProjections()
  }, [games])

  return { projections, loading }
}
