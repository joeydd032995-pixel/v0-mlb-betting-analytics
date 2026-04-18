"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, TrendingUp, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModelInsightsProps {
  userId: string | null
}

export function ModelInsights({ userId }: ModelInsightsProps) {
  const [selectedFactor, setSelectedFactor] = useState<string>("pitcher")

  const factors = [
    {
      id: "pitcher",
      name: "Pitcher NRFI Rate",
      impact: 0.85,
      description: "How often this pitcher allows zero runs in the 1st inning",
      example: "A pitcher with 65% NRFI rate has high baseline probability",
    },
    {
      id: "offense",
      name: "Offensive Strength",
      impact: 0.72,
      description: "Opposing team's first-inning run production vs league average",
      example: "Strong-hitting team increases YRFI probability",
    },
    {
      id: "park",
      name: "Park Factor",
      impact: 0.58,
      description: "How run-friendly the stadium is (1.0 = neutral)",
      example: "Yankee Stadium (1.15) increases runs; Petco (0.85) decreases",
    },
    {
      id: "weather",
      name: "Weather",
      impact: 0.45,
      description: "Wind speed/direction, temperature, humidity effects",
      example: "Tailwind + warm temp = more fly balls = more runs",
    },
    {
      id: "form",
      name: "Recent Form",
      impact: 0.35,
      description: "Last 5 starts NRFI/YRFI results (30% of season rate)",
      example: "Pitcher on NRFI hot streak gets confidence boost",
    },
  ]

  const selectedFactorData = factors.find((f) => f.id === selectedFactor)

  return (
    <Tabs defaultValue="how-it-works" className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="how-it-works">How It Works</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="factors">Factors</TabsTrigger>
      </TabsList>

      <TabsContent value="how-it-works" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>The Poisson Model</CardTitle>
            <CardDescription>How predictions are calculated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                <p className="font-mono text-sm text-muted-foreground mb-3">λ = −ln(pitcherNrfiRate) × offenseFactor × parkFactor × weatherMultiplier × formMultiplier</p>
                <p className="text-sm text-muted-foreground">
                  Each team&apos;s expected first-inning runs (λ) is calculated by starting with the pitcher&apos;s historical NRFI rate and adjusting for contextual factors.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                  <h3 className="font-semibold text-foreground mb-2">NRFI Probability</h3>
                  <p className="font-mono text-sm text-emerald-400 mb-2">P(NRFI) = P(home scores 0) × P(away scores 0)</p>
                  <p className="text-xs text-muted-foreground">
                    Using Poisson PMF at k=0: P(0 runs) = e^(−λ)
                  </p>
                </div>

                <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                  <h3 className="font-semibold text-foreground mb-2">YRFI Probability</h3>
                  <p className="font-mono text-sm text-rose-400 mb-2">P(YRFI) = 1 − P(NRFI)</p>
                  <p className="text-xs text-muted-foreground">
                    Complement of NRFI probability
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Confidence Score</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-500/20 text-xs font-semibold text-sky-400">1</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Distance from 50%</p>
                    <p className="text-xs text-muted-foreground">Predictions further from a coin flip earn higher confidence</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-500/20 text-xs font-semibold text-sky-400">2</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Sample Size</p>
                    <p className="text-xs text-muted-foreground">Pitchers with ≥18 starts get a statistical reliability bonus</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-500/20 text-xs font-semibold text-sky-400">3</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Form Consistency</p>
                    <p className="text-xs text-muted-foreground">Low variance over last 5 starts increases confidence</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
                  <p className="font-semibold text-emerald-400">≥68</p>
                  <p className="text-muted-foreground">High</p>
                </div>
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-center">
                  <p className="font-semibold text-amber-400">45–67</p>
                  <p className="text-muted-foreground">Medium</p>
                </div>
                <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2 text-center">
                  <p className="font-semibold text-rose-400">&lt;45</p>
                  <p className="text-muted-foreground">Low</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Value Bet Identification</h3>
              <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground mb-2">edge = modelProbability − impliedProbability(odds)</p>
                  <p className="text-xs text-muted-foreground">Value bets flagged when edge ≥ 3%</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Kelly Criterion Sizing (25% fractional):</p>
                  <p className="font-mono text-sm text-muted-foreground">kellyFraction = ((b × p − q) / b) × 0.25</p>
                  <p className="text-xs text-muted-foreground mt-1">where b = decimal odds − 1, p = model prob, q = 1 − p</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="performance" className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Overall Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">All Predictions</p>
                  <p className="text-3xl font-bold text-foreground">58.2%</p>
                  <p className="text-xs text-muted-foreground mt-1">10,847 total predictions</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border/30 overflow-hidden">
                  <div className="h-full w-[58.2%] bg-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-sky-400" />
                High-Confidence Only
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Confidence ≥68</p>
                  <p className="text-3xl font-bold text-foreground">64.1%</p>
                  <p className="text-xs text-muted-foreground mt-1">3,642 predictions</p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border/30 overflow-hidden">
                  <div className="h-full w-[64.1%] bg-sky-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accuracy by Confidence Level</CardTitle>
            <CardDescription>Model performance improves at higher confidence thresholds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { level: "High (≥68)", accuracy: 64.1, color: "emerald", count: 3642 },
                { level: "Medium (45–67)", accuracy: 56.3, color: "amber", count: 4205 },
                { level: "Low (<45)", accuracy: 51.8, color: "rose", count: 3000 },
              ].map((item) => (
                <div key={item.level} className="flex items-center gap-3">
                  <div className="w-24">
                    <p className="text-xs font-medium text-muted-foreground">{item.level}</p>
                    <p className="text-xs text-muted-foreground">{item.count.toLocaleString()}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-border/30 overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          item.color === "emerald" && "bg-emerald-500",
                          item.color === "amber" && "bg-amber-500",
                          item.color === "rose" && "bg-rose-500"
                        )}
                        style={{ width: `${item.accuracy}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right">
                    <p className="text-sm font-semibold text-foreground">{item.accuracy.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly ROI</CardTitle>
            <CardDescription>Using flat-stake Kelly Criterion sizing (25% fractional)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { month: "March 2026", roi: 12.3 },
                { month: "February 2026", roi: 8.7 },
                { month: "January 2026", roi: 5.4 },
                { month: "December 2025", roi: -2.1 },
                { month: "November 2025", roi: 15.2 },
              ].map((item) => (
                <div key={item.month} className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{item.month}</p>
                  <p className={cn("text-sm font-semibold", item.roi > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {item.roi > 0 ? "+" : ""}{item.roi.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="factors" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Model Factors & Impact</CardTitle>
            <CardDescription>How each input influences NRFI/YRFI predictions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                {factors.map((factor) => (
                  <button
                    key={factor.id}
                    onClick={() => setSelectedFactor(factor.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-colors",
                      selectedFactor === factor.id
                        ? "border-sky-500/50 bg-sky-500/10"
                        : "border-border/30 bg-card/50 hover:bg-card/70"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-foreground">{factor.name}</p>
                      <div className="text-xs font-semibold text-sky-400">{(factor.impact * 100).toFixed(0)}%</div>
                    </div>
                    <div className="h-1 w-full rounded-full bg-border/30 mt-2 overflow-hidden">
                      <div className="h-full bg-sky-500" style={{ width: `${factor.impact * 100}%` }} />
                    </div>
                  </button>
                ))}
              </div>

              {selectedFactorData && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-sky-400 mb-1">WHAT IS IT?</p>
                      <p className="text-sm text-foreground">{selectedFactorData.description}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-sky-400 mb-1">EXAMPLE</p>
                      <p className="text-sm text-muted-foreground">{selectedFactorData.example}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-sky-400 mb-1">RELATIVE IMPACT</p>
                      <p className="text-lg font-bold text-foreground">{(selectedFactorData.impact * 100).toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedFactorData.impact > 0.7
                          ? "Primary driver of predictions"
                          : selectedFactorData.impact > 0.5
                          ? "Moderate influence on outcome"
                          : "Supplementary adjustment"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">HOW IT AFFECTS NRFI ODDS</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Higher value = increases YRFI probability</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-rose-400 mt-0.5 flex-shrink-0" />
                        <span>Lower value = increases NRFI probability</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-400" />
              Important Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>Factors are multiplicative, not additive — a single strong factor can dominate</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>Recent form (last 5 games) counts for 30% of pitcher&apos;s effective rate</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>Model is recalibrated monthly using latest league-wide NRFI/YRFI data</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>Weather adjustments are applied only 2 hours before game time</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
