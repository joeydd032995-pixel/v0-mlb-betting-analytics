import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MatchupAccuracyBadges } from "../components/matchup-accuracy-badges"

function render(homeRate = 0.7, parkPresent = true, homeName = "Home Starter") {
  return renderToStaticMarkup(createElement(MatchupAccuracyBadges, {
    awayPitcher: "Away Starter", homePitcher: homeName,
    awayTeam: "AWY", homeTeam: "HME", venue: "Test Park",
    accuracy: {
      byPitcher: [
        { pitcher: "Away Starter", starts: 10, correct: 8, accuracy: 0.8 },
        { pitcher: "Home Starter", starts: 10, correct: homeRate * 10, accuracy: homeRate },
      ],
      byPark: parkPresent ? [{ venue: "Test Park", total: 10, correct: 9, accuracy: 0.9 }] : [],
    },
  }))
}

describe("matchup historical accuracy badges", () => {
  it("renders three matching breakdowns and a green all-three badge", () => {
    const html = render()
    expect(html).toContain("80.0% (8/10)")
    expect(html).toContain("70.0% (7/10)")
    expect(html).toContain("90.0% (9/10)")
    expect(html).toContain("All 3 &gt;60%: Yes")
    expect(html.match(/bg-emerald-500\/15/g)).toHaveLength(4)
  })
  it("does not qualify exactly 60 percent", () => {
    const html = render(0.6)
    expect(html).toContain("All 3 &gt;60%: No")
    expect(html.match(/bg-emerald-500\/15/g)).toHaveLength(2)
  })
  it("does not infer missing park history", () => {
    const html = render(0.7, false)
    expect(html).toContain("Park: No history")
    expect(html).toContain("Incomplete history")
  })
  it("updates the match when the reported starter changes", () => {
    const html = render(0.7, true, "Replacement Starter")
    expect(html).toContain("HME SP: No history")
    expect(html).toContain("Incomplete history")
  })
})
