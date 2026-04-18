"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Copy, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Resource {
  title: string
  description: string
  icon: string
  link?: string
  category: string
}

interface APIEndpoint {
  method: string
  path: string
  description: string
  example: string
}

const GUIDES: Resource[] = [
  {
    title: "Getting Started",
    description: "Learn the basics of NRFI/YRFI betting and how HomeplateMetrics works",
    icon: "🚀",
    link: "/glossary",
    category: "guides",
  },
  {
    title: "Understanding the Model",
    description: "Deep dive into the Poisson model, confidence scoring, and Kelly Criterion",
    icon: "📊",
    link: "/insights",
    category: "guides",
  },
  {
    title: "EV & Value Betting",
    description: "Learn to identify value bets and calculate expected value",
    icon: "💰",
    link: "/odds",
    category: "guides",
  },
  {
    title: "Weather & Park Effects",
    description: "Understand how environmental factors influence first-inning outcomes",
    icon: "🌦️",
    link: "/weather",
    category: "guides",
  },
]

const API_ENDPOINTS: APIEndpoint[] = [
  {
    method: "GET",
    path: "/api/predictions",
    description: "Get all NRFI/YRFI predictions for today's games",
    example: "curl https://api.homeplatemetrics.com/api/predictions",
  },
  {
    method: "GET",
    path: "/api/predictions/:gameId",
    description: "Get detailed prediction for a specific game",
    example: "curl https://api.homeplatemetrics.com/api/predictions/401547123",
  },
  {
    method: "GET",
    path: "/api/accuracy",
    description: "Get your personal accuracy statistics and historical performance",
    example: "curl -H 'Authorization: Bearer YOUR_API_KEY' https://api.homeplatemetrics.com/api/accuracy",
  },
  {
    method: "POST",
    path: "/api/predictions/track",
    description: "Log a bet result to track your performance",
    example: 'curl -X POST -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" -d \'{"gameId":"401547123","prediction":"NRFI","result":"YRFI"}\' https://api.homeplatemetrics.com/api/predictions/track',
  },
  {
    method: "GET",
    path: "/api/stats/park-factors",
    description: "Get park factor data for all 30 MLB stadiums",
    example: "curl https://api.homeplatemetrics.com/api/stats/park-factors",
  },
]

const RESOURCES: Resource[] = [
  {
    title: "MLB Stats API",
    description: "Official MLB Stats API for game schedules, player stats, and historical data",
    icon: "🏟️",
    link: "https://statsapi.mlb.com",
    category: "external",
  },
  {
    title: "The Odds API",
    description: "Live sports odds from 100+ bookmakers. Perfect for identifying edges.",
    icon: "📈",
    link: "https://the-odds-api.com",
    category: "external",
  },
  {
    title: "OpenWeatherMap",
    description: "Real-time weather data for all MLB stadiums",
    icon: "🌥️",
    link: "https://openweathermap.org",
    category: "external",
  },
  {
    title: "Kelly Criterion Calculator",
    description: "Interactive tool to understand Kelly Criterion bet sizing",
    icon: "🎲",
    link: "https://www.pinnaclesports.com/en/betting-resources/betting-tools/kelly-criterion-calculator",
    category: "external",
  },
]

const FAQ = [
  {
    q: "What does NRFI mean?",
    a: "NRFI = No Run First Inning. It's a bet that neither team will score in the first inning of an MLB game.",
  },
  {
    q: "How accurate is the model?",
    a: "The model achieves ~56-58% accuracy overall, with 64%+ accuracy on high-confidence predictions. This edge compounds over many games.",
  },
  {
    q: "What's a value bet?",
    a: "A value bet is when your model probability exceeds the implied probability from bookmaker odds. We flag bets with 3%+ edge as value opportunities.",
  },
  {
    q: "How do I get an API key?",
    a: "API keys are available for premium members. Sign in to your dashboard and navigate to Account → API Settings.",
  },
  {
    q: "Can I use the API commercially?",
    a: "API access is for personal use. Commercial use requires a separate enterprise license. Contact support@homeplatemetrics.com for details.",
  },
  {
    q: "How is Kelly Criterion sizing calculated?",
    a: "Kelly = ((b × p - q) / b) × 0.25, where b = odds-1, p = probability, q = 1-p. We use 25% fractional Kelly for conservative sizing.",
  },
]

export function ResourcesGrid() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null)

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEndpoint(id)
    setTimeout(() => setCopiedEndpoint(null), 2000)
  }

  return (
    <Tabs defaultValue="guides" className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="guides">Guides</TabsTrigger>
        <TabsTrigger value="api">API Hub</TabsTrigger>
        <TabsTrigger value="resources">External Resources</TabsTrigger>
        <TabsTrigger value="faq">FAQ</TabsTrigger>
      </TabsList>

      {/* Guides */}
      <TabsContent value="guides" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GUIDES.map((guide) => (
            <a
              key={guide.title}
              href={guide.link || "#"}
              className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 hover:border-sky-500/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">{guide.icon}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground group-hover:text-sky-400 transition-colors">
                    {guide.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{guide.description}</p>
                  {guide.link && (
                    <div className="flex items-center gap-1 text-xs text-sky-400 mt-3">
                      Read more <ExternalLink className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      </TabsContent>

      {/* API Hub */}
      <TabsContent value="api" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>API Documentation</CardTitle>
            <CardDescription>Integrate HomeplateMetrics into your application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-amber-300">
                <strong>Base URL:</strong> https://api.homeplatemetrics.com/v1
              </p>
              <p className="text-sm text-amber-300 mt-1">
                Include your API key in the Authorization header: <code className="bg-black/30 px-2 py-1 rounded">Bearer YOUR_API_KEY</code>
              </p>
            </div>

            <div className="space-y-3">
              {API_ENDPOINTS.map((endpoint) => (
                <div
                  key={endpoint.path}
                  className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className={cn(
                      "flex-shrink-0",
                      endpoint.method === "GET" && "border-sky-500/50 text-sky-400",
                      endpoint.method === "POST" && "border-emerald-500/50 text-emerald-400"
                    )}>
                      {endpoint.method}
                    </Badge>
                    <div className="flex-1 font-mono text-sm text-foreground">{endpoint.path}</div>
                  </div>

                  <p className="text-sm text-muted-foreground">{endpoint.description}</p>

                  <div className="bg-black/20 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground">Example</p>
                      <button
                        onClick={() => handleCopy(endpoint.example, endpoint.path)}
                        className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {copiedEndpoint === endpoint.path ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <code className="text-xs text-muted-foreground break-all">{endpoint.example}</code>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">API Rate Limits</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Free Tier</p>
              <p className="font-semibold text-foreground">100 requests/day</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Pro Tier</p>
              <p className="font-semibold text-foreground">10,000 requests/day</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Enterprise</p>
              <p className="font-semibold text-foreground">Custom limits</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* External Resources */}
      <TabsContent value="resources" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RESOURCES.map((resource) => (
            <a
              key={resource.title}
              href={resource.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 hover:border-emerald-500/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">{resource.icon}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                    {resource.title}
                    <ExternalLink className="h-3 w-3" />
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{resource.description}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </TabsContent>

      {/* FAQ */}
      <TabsContent value="faq" className="space-y-4">
        {FAQ.map((item, idx) => (
          <Card key={idx}>
            <CardHeader>
              <CardTitle className="text-base">{item.q}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.a}</p>
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  )
}
