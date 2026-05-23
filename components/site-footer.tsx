"use client"

import Link from "next/link"

const FOOTER_LINKS = {
  PRODUCT: [
    { label: "Dashboard",  href: "/" },
    { label: "Grid View",  href: "/grid" },
    { label: "Accuracy",   href: "/accuracy" },
    { label: "History",    href: "/history" },
    { label: "Resources",  href: "/resources" },
  ],
  MODEL: [
    { label: "How It Works",   href: "/resources#how-it-works" },
    { label: "Methodology",    href: "/resources" },
    { label: "Model Insights", href: "/insights" },
    { label: "Glossary",       href: "/glossary" },
  ],
  LEGAL: [
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy",   href: "/privacy" },
    { label: "Disclaimer",       href: "/disclaimer" },
  ],
  CONTACT: [
    { label: "GitHub",    href: "https://github.com" },
    { label: "Twitter",   href: "https://twitter.com" },
    { label: "Email",     href: "mailto:contact@homeplatemetrics.com" },
    { label: "Feedback",  href: "/feedback" },
  ],
}

const STATS_CHIPS = [
  { label: "MODEL VERSION", value: "v3.2.1" },
  { label: "ENSEMBLE",      value: "7 MODELS" },
  { label: "SEASON",        value: "2026 MLB" },
  { label: "DATA",          value: "STATCAST" },
]

const MINI_DIAMOND = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon
      points="7,1 13,7 7,13 1,7"
      stroke="rgba(0,229,255,0.4)"
      strokeWidth="1"
      fill="none"
    />
  </svg>
)

export function SiteFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className="relative mt-8"
      style={{
        background: "var(--hm-void)",
        borderTop: "1px solid var(--hm-fence)",
      }}
    >
      {/* Top accent line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.5) 30%, rgba(0,230,118,0.3) 60%, transparent)",
        }}
      />

      <div className="mx-auto max-w-[1480px] px-3 sm:px-5 lg:px-7">

        {/* Stats chip row */}
        <div
          className="flex items-center gap-3 py-4"
          style={{ overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" as unknown as "touch" }}
        >
          <div className="flex items-center gap-3 min-w-max sm:min-w-0">
            {STATS_CHIPS.map((chip) => (
              <div
                key={chip.label}
                className="flex items-center gap-2 rounded-[3px] px-[10px] py-[4px]"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--hm-fence)",
                }}
              >
                <span
                  className="font-mono uppercase tracking-[0.18em]"
                  style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
                >
                  {chip.label}
                </span>
                <span
                  className="font-mono tracking-[0.08em]"
                  style={{ fontSize: "9px", color: "var(--hm-diamond)" }}
                >
                  {chip.value}
                </span>
              </div>
            ))}
            <span className="hm-live-dot ml-1" />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "var(--hm-fence)" }} />

        {/* Links grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 py-8">
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <div
                className="font-mono uppercase tracking-[0.32em] mb-4"
                style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
              >
                {section}
              </div>
              <ul className="space-y-[10px]">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="transition-colors"
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: "12px",
                        color: "var(--hm-smoke)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--hm-chalk)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--hm-smoke)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "var(--hm-fence)" }} />

        {/* Responsible gambling notice */}
        <div
          className="flex items-center justify-center gap-2 py-3 text-center"
          style={{ borderBottom: "1px solid var(--hm-fence)" }}
        >
          <span
            className="font-mono tracking-[0.06em]"
            style={{ fontSize: "10px", color: "var(--hm-smoke)" }}
          >
            Homeplate Metrics is an analytics tool only — not a betting service. Gambling involves financial risk and can be addictive. 18+ only.
          </span>
          <Link
            href="/disclaimer"
            className="transition-colors"
            style={{ fontSize: "10px", color: "var(--hm-diamond)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7" }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
          >
            Responsible Gambling ↗
          </Link>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-5 hm-safe-bottom">
          <div className="flex items-center gap-2">
            {MINI_DIAMOND}
            <span
              className="font-mono tracking-[0.08em]"
              style={{ fontSize: "10px", color: "var(--hm-smoke)" }}
            >
              © {currentYear} HomeplateMetrics. All rights reserved.
            </span>
          </div>
          <div
            className="font-mono tracking-[0.08em]"
            style={{ fontSize: "10px", color: "var(--hm-smoke)" }}
          >
            Next.js · Prisma · Neon · Tailwind CSS
          </div>
        </div>
      </div>
    </footer>
  )
}
