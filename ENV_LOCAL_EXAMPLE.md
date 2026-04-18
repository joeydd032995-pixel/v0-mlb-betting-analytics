# COPY THIS FILE: cp .env.local.template .env.local
# Then fill in the values below and restart: npm run dev

# ═══════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION — CLERK (Required)
# ═══════════════════════════════════════════════════════════════════════════════
# Get keys from: https://dashboard.clerk.com/last-active?path=api-keys

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_PASTE_YOUR_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY=sk_test_PASTE_YOUR_CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/


# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE — NEON POSTGRESQL (Required)
# ═══════════════════════════════════════════════════════════════════════════════
# Get connection string from: https://console.neon.tech
# Use the "Pooled connection" format

DATABASE_URL=postgresql://PASTE_NEON_CONNECTION_STRING_HERE


# ═══════════════════════════════════════════════════════════════════════════════
# LIVE ODDS — THE ODDS API (Required)
# ═══════════════════════════════════════════════════════════════════════════════
# Get API key from: https://the-odds-api.com
# Free tier: 500 requests/month

THE_ODDS_API_KEY=PASTE_YOUR_THE_ODDS_API_KEY_HERE
THE_ODDS_API_BOOKMAKERS=draftkings,fanduel,betmgm,caesars


# ═══════════════════════════════════════════════════════════════════════════════
# WEATHER — OPENWEATHERMAP (Required)
# ═══════════════════════════════════════════════════════════════════════════════
# Get API key from: https://openweathermap.org/api
# Free tier: 1,000 calls/day

OPENWEATHER_API_KEY=PASTE_YOUR_OPENWEATHERMAP_API_KEY_HERE
OPENWEATHER_UNITS=imperial


# ═══════════════════════════════════════════════════════════════════════════════
# APPLICATION SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MLB_SEASON=2026
NEXT_PUBLIC_MIN_KELLY_EDGE=0.03
NEXT_PUBLIC_KELLY_FRACTION=0.25

# Cache refresh times (in seconds)
DATA_REVALIDATE_SECONDS=300
ODDS_REVALIDATE_SECONDS=60


# ═══════════════════════════════════════════════════════════════════════════════
# OPTIONAL: ADVANCED ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

# SportsBlaze (optional, for advanced player/team analytics)
# SPORTSBLAZE_API_KEY=your_sportsblaze_api_key_here
# SPORTSBLAZE_BASE_URL=https://api.sportsblaze.com

# Sentry error monitoring (optional)
# SENTRY_DSN=https://your-key@o0.ingest.sentry.io/0
# SENTRY_ENVIRONMENT=production
