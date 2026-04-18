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

        {/* Ensemble Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Ensemble Architecture</CardTitle>
            <CardDescription>Four complementary models vote on each half-inning, then combine into one final probability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Final NRFI %</p>
              <p className="font-mono text-sm text-emerald-400">P(NRFI) = 0.60 × P_ensemble + 0.40 × P_poisson</p>
              <p className="text-xs text-muted-foreground">Blended for numerical stability. Ensemble itself = 80% (Poisson/ZIP/Markov product) + 20% MAPRE.</p>
            </div>
            <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Game</p>
              <p className="font-mono text-sm text-emerald-400">P(NRFI_game) = P(away scores 0 in top 1st) × P(home scores 0 in bot 1st)</p>
              <p className="text-xs text-muted-foreground">Each half-inning is computed independently, then multiplied. Clamped to [5%, 95%].</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                { label: "Poisson", weight: "20%", color: "sky" },
                { label: "ZIP", weight: "30%", color: "violet" },
                { label: "Markov", weight: "30%", color: "amber" },
                { label: "MAPRE", weight: "20%", color: "rose" },
              ].map((m) => (
                <div key={m.label} className={cn(
                  "rounded-lg border p-3",
                  m.color === "sky"    && "border-sky-500/30 bg-sky-500/10",
                  m.color === "violet" && "border-violet-500/30 bg-violet-500/10",
                  m.color === "amber"  && "border-amber-500/30 bg-amber-500/10",
                  m.color === "rose"   && "border-rose-500/30 bg-rose-500/10",
                )}>
                  <p className={cn("font-bold text-base",
                    m.color === "sky"    && "text-sky-400",
                    m.color === "violet" && "text-violet-400",
                    m.color === "amber"  && "text-amber-400",
                    m.color === "rose"   && "text-rose-400",
                  )}>{m.weight}</p>
                  <p className="text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pre-processing: Bayesian Shrinkage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">0</span>
              Pre-processing — Bayesian Shrinkage
            </CardTitle>
            <CardDescription>Applied to every pitcher's NRFI rate before it enters any model</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-2">
              <p className="font-mono text-sm text-muted-foreground">w = n / (n + 1.14)   where 1.14 = σ²_within / σ²_between</p>
              <p className="font-mono text-sm text-muted-foreground">θ̂ = w × NRFI_observed + (1 − w) × 0.62</p>
              <p className="text-xs text-muted-foreground mt-1">0.62 = league average NRFI rate. Clamped to [0.35, 0.92].</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              {[
                { starts: "2 starts", weight: "64%", note: "data trust" },
                { starts: "5 starts", weight: "81%", note: "data trust" },
                { starts: "18+ starts", weight: "94%", note: "data trust" },
              ].map((r) => (
                <div key={r.starts} className="rounded border border-border/30 bg-card/50 p-2">
                  <p className="font-semibold text-foreground">{r.weight}</p>
                  <p className="text-muted-foreground">{r.starts}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Prevents a 3-start 100% NRFI rate from being treated as elite. The shrunk rate feeds into all four models below.</p>
          </CardContent>
        </Card>

        {/* Model 1: Poisson */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-400">1</span>
              Poisson Model
              <span className="ml-auto text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded px-2 py-0.5">20% weight</span>
            </CardTitle>
            <CardDescription>Standard run-expectancy model. Acts as the numerical anchor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 space-y-2">
              <p className="font-mono text-sm text-sky-300">λ = −ln(θ̂) × offenseFactor × parkFactor × (1 + (temp − 72) × 0.004)</p>
              <p className="font-mono text-sm text-sky-300">P(NRFI) = e^(−λ)</p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="text-foreground font-medium">θ̂</span> — Bayesian-shrunk pitcher NRFI rate (from step 0)</p>
              <p><span className="text-foreground font-medium">offenseFactor</span> — batting team's 1st-inning production relative to league (1.0 = average)</p>
              <p><span className="text-foreground font-medium">parkFactor</span> — stadium run environment (e.g. 1.15 = hitter-friendly, 0.85 = pitcher-friendly)</p>
              <p><span className="text-foreground font-medium">temp adjustment</span> — +0.4% per °F above 72°F; heat carries balls farther</p>
            </div>
            <div className="rounded border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Example:</span> Pitcher with 68% NRFI rate (θ̂) vs average offense, neutral park, 72°F → λ = −ln(0.68) = 0.385 → P(no score) = e^(−0.385) = 68%
            </div>
          </CardContent>
        </Card>

        {/* Model 2: ZIP */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-400">2</span>
              Zero-Inflated Poisson (ZIP)
              <span className="ml-auto text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded px-2 py-0.5">30% weight</span>
            </CardTitle>
            <CardDescription>Separates "lockdown" innings from "active" innings. Standard Poisson underestimates clean 1-2-3 frames.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
              <p className="font-mono text-xs text-violet-300">logit(ω) = −1.38 + 4.0 × (kRate − 0.225) + (72 − temp) × 0.008 + umpire × 0.18</p>
              <p className="font-mono text-xs text-violet-300">log(λ) = ln(0.42) + 0.90 × ln(offenseFactor) + 0.60 × ln(parkFactor) + (temp − 72) × 0.004</p>
              <p className="font-mono text-sm text-violet-300 mt-2">P(NRFI) = ω + (1 − ω) × e^(−λ)</p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="text-foreground font-medium">ω (omega)</span> — probability of a certain-zero "lockdown" inning. Driven by pitcher K-rate, temperature, and umpire zone width. Clamped [5%, 65%].</p>
              <p><span className="text-foreground font-medium">λ (lambda)</span> — Poisson scoring rate for the "active inning" regime. Driven by offense factor and park. Calibrated so average inputs → λ ≈ 0.42.</p>
              <p><span className="text-foreground font-medium">Calibration target:</span> at league-average inputs both half-innings combine to P(NRFI_game) ≈ 0.62.</p>
            </div>
            <div className="rounded border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Example:</span> Elite strikeout pitcher (K% = 0.33) on a cold 45°F night → ω ≈ 0.38 (38% chance of a pure lockdown inning regardless of offense). Even if runs are possible (62% chance), Poisson still needs to produce 0 → combined P(NRFI) much higher than base Poisson.
            </div>
          </CardContent>
        </Card>

        {/* Model 3: Markov Chain */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400">3</span>
              Markov Chain (24-state)
              <span className="ml-auto text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">30% weight</span>
            </CardTitle>
            <CardDescription>Simulates the inning plate-by-plate across all 24 base-out states using Bill James Log-5 matchup probabilities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-400 mb-1">Step 1 — Log-5 per-PA probabilities</p>
              <p className="font-mono text-xs text-amber-300">P(event) = (batter × pitcher / league) / [(batter × pitcher / league) + ((1−batter)(1−pitcher) / (1−league))]</p>
              <p className="text-xs font-semibold text-amber-400 mt-3 mb-1">Step 2 — State propagation</p>
              <p className="font-mono text-xs text-amber-300">States: outs ∈ {"{"} 0,1,2 {"}"} × runners ∈ {"{"} 000…111 {"}"} = 24 states</p>
              <p className="font-mono text-xs text-amber-300">P(NRFI) = Σ P(reach 3 outs with 0 runs scored)</p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="text-foreground font-medium">PA outcomes computed:</span> out, walk, single, double, triple, HR — using pitcher WHIP/K%/BB%/HR rate vs top-of-order batter scaled by team offenseFactor.</p>
              <p><span className="text-foreground font-medium">Branch elimination:</span> any state path where a run scores is immediately discarded — it can never contribute to NRFI.</p>
              <p><span className="text-foreground font-medium">Termination:</span> iterates up to 30 PAs until remaining probability mass &lt; 0.000001.</p>
            </div>
            <div className="rounded border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Why this matters:</span> Unlike Poisson, Markov captures sequence effects — a leadoff walk followed by a strikeout is different from two groundouts. It's the most realistic model for first-inning dynamics.
            </div>
          </CardContent>
        </Card>

        {/* Model 4: MAPRE */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-400">4</span>
              MAPRE — Multi-Factor Adjusted Poisson Run Expectancy
              <span className="ml-auto text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-0.5">20% weight</span>
            </CardTitle>
            <CardDescription>Injects seven hidden 1st-inning factors on top of the Bayesian lambda. Applied at game level with cross-half correlation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-rose-400 mb-1">Adjusted Lambda (per half-inning)</p>
              <p className="font-mono text-xs text-rose-300">λ_adj = λ_base × M_sOPS × M_BABIP × M_HR × M_pitchMix + Δ_HFA + Δ_rest</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <p><span className="text-rose-300">M_sOPS</span> = 1 + 0.0015 × (sOPS+ − 100)</p>
                <p><span className="text-rose-300">M_BABIP</span> = 1 + 1.8 × (BABIP − 0.295)</p>
                <p><span className="text-rose-300">M_HR</span> = 1 + 9 × (HR/PA − 0.034)</p>
                <p><span className="text-rose-300">M_pitchMix</span> = 1 + 0.12 × barrelDev</p>
                <p><span className="text-rose-300">Δ_HFA</span> = −0.045 if home pitcher</p>
                <p><span className="text-rose-300">Δ_rest</span> = +0.032 if away team fatigued</p>
              </div>
              <p className="text-xs font-semibold text-rose-400 mt-3 mb-1">Game-level combination (with ρ correlation)</p>
              <p className="font-mono text-xs text-rose-300">λ_total = λ_home + λ_away × (1 + ρ)</p>
              <p className="font-mono text-xs text-rose-300">ρ = 0.022 when both λ &gt; 0.60 (high-run environment)</p>
              <p className="font-mono text-xs text-rose-300">P(NRFI) = e^(−λ_total)  or  NegBin(r=1.3) when λ_total &gt; 0.8</p>
            </div>
            <div className="rounded border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Negative Binomial:</span> When total λ exceeds 0.8, run counts have overdispersion (variance &gt; mean). NegBin with r=1.3 handles this better than Poisson, producing P(NRFI) = (r / (r + λ))^r.
            </div>
          </CardContent>
        </Card>

        {/* Recent Form Multiplier */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">5</span>
              Recent Form Multiplier
            </CardTitle>
            <CardDescription>Applied to lambda before all four models. Adjusts for hot/cold streaks vs a pitcher's season baseline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="font-mono text-sm text-emerald-300">deviation = recentNrfiRate(last5) − seasonNrfiRate</p>
              <p className="font-mono text-sm text-emerald-300">formMult = clamp(1.0 − 0.30 × avgDeviation, 0.85, 1.15)</p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Averaged across both pitchers. Requires ≥3 results; falls back to 1.0 if insufficient data.</p>
              <p><span className="text-foreground font-medium">Hot streak</span> (deviation +0.20) → formMult = 0.94 → lambda shrinks → more NRFI-friendly</p>
              <p><span className="text-foreground font-medium">Struggling</span> (deviation −0.30) → formMult = 1.09 → lambda grows → more YRFI-friendly</p>
            </div>
          </CardContent>
        </Card>

        {/* Confidence + Value Bet */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Score & Value Bets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Confidence Score (0–100)</p>
              <div className="rounded-lg border border-border/30 bg-card/50 p-4 font-mono text-xs text-muted-foreground space-y-1">
                <p>score = 50 + |P(NRFI) − 0.50| × 70       <span className="text-foreground">(max +35 for extreme predictions)</span></p>
                <p>      + sampleBonus                        <span className="text-foreground">(+12 if ≥18 starts, −14 if &lt;3)</span></p>
                <p>      − formVariance × 15                  <span className="text-foreground">(high variance in last 5 = penalty)</span></p>
                <p>      + (modelConsensus − 0.5) × 16        <span className="text-foreground">(all models agree = bonus)</span></p>
                <p>clamped to [10, 98]</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                  <p className="font-semibold text-emerald-400">≥68</p>
                  <p className="text-muted-foreground">High</p>
                </div>
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                  <p className="font-semibold text-amber-400">45–67</p>
                  <p className="text-muted-foreground">Medium</p>
                </div>
                <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2">
                  <p className="font-semibold text-rose-400">&lt;45</p>
                  <p className="text-muted-foreground">Low</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Value Bet Identification</p>
              <div className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-2 font-mono text-xs text-muted-foreground">
                <p>edge = P(model) − impliedProbability(bookOdds)   <span className="text-foreground">≥3% required</span></p>
                <p>kellyFraction = ((b × p − q) / b) × 0.25         <span className="text-foreground">25% fractional Kelly, max bet</span></p>
                <p>where  b = decimal odds,  p = model prob,  q = 1−p</p>
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
                <span>Recent form (last 5 games) counts for 30% of pitcher's effective rate</span>
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
