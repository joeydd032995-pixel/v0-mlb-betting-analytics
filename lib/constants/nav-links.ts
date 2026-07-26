// lib/constants/nav-links.ts
// Single source of truth for site navigation.
// Labels are stored in Title Case; the header row and drawer apply `uppercase`
// via CSS so the same string can be rendered either way.

export interface NavItem {
  href: string
  label: string
}

export interface NavSection {
  label: string
  items: NavItem[]
  /** Rendered only for signed-in users (and only when Clerk is configured). */
  authOnly?: boolean
}

/** Full menu, grouped — rendered by the nav drawer at every breakpoint. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { href: "/",         label: "Dashboard" },
      { href: "/grid",     label: "Grid" },
      { href: "/pitcher",  label: "Pitchers" },
      { href: "/staff",    label: "Staff" },
      { href: "/ensemble", label: "Ensemble" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/history",      label: "History" },
      { href: "/accuracy",     label: "Accuracy" },
      { href: "/insights",     label: "Insights" },
      { href: "/odds",         label: "Odds & EV" },
      { href: "/weather",      label: "Weather" },
      { href: "/weekly-recap", label: "Weekly Recap" },
    ],
  },
  {
    label: "Account",
    authOnly: true,
    items: [
      { href: "/bets",      label: "My Bets" },
      { href: "/bankroll",  label: "Bankroll" },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/account",   label: "Account" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/resources", label: "Resources" },
      { href: "/glossary",  label: "Glossary" },
      { href: "/community", label: "Community" },
      { href: "/pricing",   label: "Pricing" },
    ],
  },
]

/** Condensed inline row shown in the header on lg+ screens. */
export const HEADER_NAV_LINKS: NavItem[] = [
  { href: "/",          label: "Dashboard" },
  { href: "/grid",      label: "Grid" },
  { href: "/pitcher",   label: "Pitchers" },
  { href: "/staff",     label: "Staff" },
  { href: "/ensemble",  label: "Ensemble" },
  { href: "/history",   label: "History" },
  { href: "/accuracy",  label: "Accuracy" },
  { href: "/insights",  label: "Insights" },
  { href: "/odds",      label: "Odds" },
  { href: "/weather",   label: "Weather" },
  { href: "/resources", label: "Resources" },
  { href: "/pricing",   label: "Pricing" },
]

export function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")
}
