// components/site-footer.tsx
// Global footer rendered from app/layout.tsx.
// 4 columns: Product, Model, Legal, Contact

import Link from "next/link"

const footerLinks = {
  product: [
    { label: "Dashboard", href: "/" },
    { label: "Grid View", href: "/grid" },
    { label: "Accuracy", href: "/accuracy" },
    { label: "History", href: "/history" },
    { label: "Resources", href: "/resources" },
  ],
  model: [
    { label: "How It Works", href: "/resources#how-it-works" },
    { label: "Methodology", href: "/methodology" },
    { label: "Model Insights", href: "/insights" },
    { label: "Glossary", href: "/glossary" },
  ],
  legal: [
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Disclaimer", href: "/disclaimer" },
  ],
  contact: [
    { label: "GitHub", href: "https://github.com" },
    { label: "Twitter", href: "https://twitter.com" },
    { label: "Email", href: "mailto:contact@example.com" },
    { label: "Feedback", href: "/feedback" },
  ],
}

export function SiteFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border/50 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {/* Four-column grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Product */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Model */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Model</h3>
            <ul className="space-y-2">
              {footerLinks.model.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Contact</h3>
            <ul className="space-y-2">
              {footerLinks.contact.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-8 border-t border-border/30" />

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {currentYear} HomeplateMetrics. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Data from MLB Statcast &amp; proprietary Poisson models
          </p>
        </div>
      </div>
    </footer>
  )
}
