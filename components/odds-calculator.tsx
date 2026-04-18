"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  americanToDecimal,
  impliedProbability,
  calculateEV,
  kellyFraction,
  formatOdds,
} from "@/lib/utils/odds"
import { cn } from "@/lib/utils"
import { AlertCircle, TrendingUp, BarChart3 } from "lucide-react"

interface BetScenario {
  name: string
  modelProb: number
  oddsAmerican: number
  bookmaker: string
}

const SAMPLE_SCENARIOS: BetScenario[] = [
  { name: "NYY vs BAL", modelProb: 0.68, oddsAmerican: -110, bookmaker: "DraftKings" },
  { name: "BOS vs TB", modelProb: 0.62, oddsAmerican: -105, bookmaker: "FanDuel" },
  { name: "HOU vs LAA", modelProb: 0.55, oddsAmerican: -115, bookmaker: "BetMGM" },
  { name: "ATL vs WSH", modelProb: 0.72, oddsAmerican: -125, bookmaker: "DraftKings" },
  { name: "LAD vs SD", modelProb: 0.58, oddsAmerican: -110, bookmaker: "Caesars" },
]

export function OddsCalculator() {
  const [modelProb, setModelProb] = useState<number>(0.62)
  const [oddsAmerican, setOddsAmerican] = useState<number>(-110)
  const [wagerAmount, setWagerAmount] = useState<number>(100)
  const [selectedScenario, setSelectedScenario] = useState<BetScenario | null>(null)

  const impliedProb = impliedProbability(oddsAmerican)
  const decimalOdds = americanToDecimal(oddsAmerican)
  const ev = calculateEV(modelProb, oddsAmerican)
  const edge = (modelProb - impliedProb) * 100
  const kelly = kellyFraction(modelProb, oddsAmerican, 0.25)
  const isValueBet = edge >= 3

  const kellyWager = wagerAmount * kelly
  const expectedProfit = wagerAmount * ev
  const potentialWin = kellyWager * (decimalOdds - 1)

  const handleScenarioSelect = (scenario: BetScenario) => {
    setSelectedScenario(scenario)
    setModelProb(scenario.modelProb)
    setOddsAmerican(scenario.oddsAmerican)
  }

  return (
    <Tabs defaultValue="calculator" className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="calculator">EV Calculator</TabsTrigger>
        <TabsTrigger value="samples">Sample Bets</TabsTrigger>
      </TabsList>

      <TabsContent value="calculator" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Input Card */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bet Inputs</CardTitle>
                <CardDescription>Enter your model prediction and odds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    Model NRFI Probability
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(modelProb * 100)}
                      onChange={(e) => setModelProb(Math.max(0, Math.min(100, parseInt(e.target.value))) / 100)}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold text-foreground w-8">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    American Odds (NRFI)
                  </label>
                  <Input
                    type="number"
                    value={oddsAmerican}
                    onChange={(e) => setOddsAmerican(parseInt(e.target.value) || 0)}
                    placeholder="-110"
                  />
                  <p className="text-xs text-muted-foreground mt-1">e.g., -110, -120, +150</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                    Wager Amount
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="10"
                      value={wagerAmount}
                      onChange={(e) => setWagerAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results Grid */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Implied Probability */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Implied Probability</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">{(impliedProb * 100).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">What odds imply</p>
                </CardContent>
              </Card>

              {/* Edge */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Edge</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={cn("text-3xl font-bold", isValueBet ? "text-emerald-400" : "text-muted-foreground")}>
                    {edge > 0 ? "+" : ""}{edge.toFixed(2)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isValueBet ? "✓ Value bet" : "✗ Unfavorable"}
                  </p>
                </CardContent>
              </Card>

              {/* EV per $100 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">EV (Expected Value)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={cn("text-3xl font-bold", ev > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {ev > 0 ? "+" : ""}{ev.toFixed(3)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Per dollar wagered</p>
                </CardContent>
              </Card>

              {/* Decimal Odds */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Decimal Odds</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">{decimalOdds.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">For reference</p>
                </CardContent>
              </Card>
            </div>

            {/* Kelly & Sizing */}
            <Card className={cn("border", isValueBet ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/30")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Kelly Criterion Sizing (25% Fractional)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Kelly %</p>
                    <p className="text-2xl font-bold text-foreground">{(kelly * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Suggested Wager</p>
                    <p className="text-2xl font-bold text-amber-400">${kellyWager.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Expected Profit</p>
                    <p className={cn("text-2xl font-bold", expectedProfit > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {expectedProfit > 0 ? "+" : ""}{expectedProfit.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/30 bg-card/50 p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk (if you lose):</span>
                    <span className="font-semibold text-foreground">-${kellyWager.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Win (if you hit):</span>
                    <span className="font-semibold text-emerald-400">+${potentialWin.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-border/30 my-1" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected Value:</span>
                    <span className={cn("font-semibold", expectedProfit > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {expectedProfit > 0 ? "+" : ""}{expectedProfit.toFixed(2)}
                    </span>
                  </div>
                </div>

                {isValueBet && (
                  <div className="flex gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                    <AlertCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-300">
                      This bet has positive expected value. The model suggests this is a favorable wager.
                    </p>
                  </div>
                )}

                {!isValueBet && Math.abs(edge) < 3 && (
                  <div className="flex gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                    <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      Slightly unfavorable. Consider looking for better odds or waiting.
                    </p>
                  </div>
                )}

                {edge <= -3 && (
                  <div className="flex gap-2 p-2 rounded bg-rose-500/10 border border-rose-500/30">
                    <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">
                      Unfavorable odds. Model suggests passing on this bet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Explanation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Understanding the Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-semibold text-foreground mb-1">Implied Probability</p>
                <p className="text-muted-foreground">What the odds say the probability is</p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Edge</p>
                <p className="text-muted-foreground">Your model prob minus implied prob. Positive = value.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">EV (Expected Value)</p>
                <p className="text-muted-foreground">Your expected profit per dollar wagered on average</p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Kelly Criterion</p>
                <p className="text-muted-foreground">Optimal bet size to maximize long-term growth</p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Value Bet</p>
                <p className="text-muted-foreground">Edge ≥ 3%. Flagged as positive EV opportunity</p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Fractional Kelly</p>
                <p className="text-muted-foreground">We use 25% Kelly for conservative sizing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="samples" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sample Game Scenarios</CardTitle>
            <CardDescription>Click to load values into the calculator</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {SAMPLE_SCENARIOS.map((scenario) => {
                const impliedProb = impliedProbability(scenario.oddsAmerican)
                const edge = (scenario.modelProb - impliedProb) * 100
                const isValue = edge >= 3

                return (
                  <button
                    key={scenario.name}
                    onClick={() => handleScenarioSelect(scenario)}
                    className={cn(
                      "w-full text-left rounded-lg border p-4 transition-colors hover:bg-card/70",
                      selectedScenario?.name === scenario.name
                        ? "border-sky-500/50 bg-sky-500/10"
                        : "border-border/30 bg-card/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-foreground">{scenario.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{scenario.bookmaker}</span>
                        <span className={cn("text-xs font-bold px-2 py-1 rounded", isValue ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300")}>
                          {isValue ? "✓ Value" : "Fair"}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Model</p>
                        <p className="font-semibold text-foreground">{(scenario.modelProb * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Implied</p>
                        <p className="font-semibold text-foreground">{(impliedProb * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Edge</p>
                        <p className={cn("font-semibold", edge > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                          {edge > 0 ? "+" : ""}{edge.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Odds</p>
                        <p className="font-semibold text-foreground">{scenario.oddsAmerican > 0 ? "+" : ""}{scenario.oddsAmerican}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
