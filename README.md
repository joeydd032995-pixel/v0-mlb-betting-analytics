# MLB Betting Analytics Engine

A production-grade MLB betting analytics platform featuring advanced statistical models, real-time projections, edge calculations, and bankroll management.

## Features

### 📊 Advanced Statistical Models
- **Empirical Bayes Regression** for stabilized metrics across all statistics
- **Hitting Metrics**: AVG, OBP, SLG, ISO, wOBA, xwOBA, wRC+, K%, BB%, O-Swing%, Contact%, Hard-Hit%, Barrel%, BABIP
- **Pitching Metrics**: ERA, FIP, xFIP, SIERA, xERA, ERA+, FIP-, K%, BB%, K-BB%, WHIP, GB%, HR/FB, quality of contact
- **Team Performance**: Pythagorean win expectancy, run differential, strength of schedule

### 🎯 Projections Engine
- **Ensemble Modeling**: Combines multiple projection methods with weighted averaging
- **Poisson Distribution**: Models run scoring probabilities for totals
- **Weather Impact**: Adjusts projections for wind, temperature, humidity, and altitude
- **Park Factors**: Accounts for ballpark run environment
- **Rest/Travel**: Factors in team fatigue and travel schedules

### 💰 Edge Calculator
- **Kelly Criterion**: Optimal position sizing based on edge and bankroll
- **Expected Value (EV)**: Calculates profit expectation for all bet types
- **Value Detection**: Identifies +EV opportunities across moneyline, spread, and totals
- **Monte Carlo Simulation**: Risk analysis for bet sizing recommendations
- **Closing Line Value**: Tracks how your bets compare to closing odds

### 📈 Live Odds Monitor
- **Real-time Tracking**: Monitors odds movements across all games
- **Line Movement Alerts**: Notifies on significant odds shifts (>5%)
- **Multi-Sportsbook Comparison**: Tracks best available lines
- **Sharp Action Detection**: Identifies reverse line movement patterns

### 💵 Bankroll Management
- **Bet Tracking**: Complete history with profit/loss analytics
- **ROI Calculations**: Overall and per-bet-type performance metrics
- **Max Drawdown**: Risk monitoring and position limits
- **Win Rate Analysis**: Success rates by market and bet size
- **Unit Sizing**: Automated Kelly Criterion recommendations

## Installation

### Option 1: Using shadcn CLI (Recommended)
```bash
# The downloaded ZIP includes a CLI command for setup
npx shadcn@latest init
```

### Option 2: Manual Setup
```bash
# Clone the repository
git clone https://github.com/joeydd032995-pixel/MLB-.git
cd MLB-

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

### Core Modules

**`lib/types.ts`**
- TypeScript interfaces for all data structures
- Type definitions for teams, players, games, bets, and projections

**`lib/config.ts`**
- Configurable parameters for statistical models
- Regression constants and league baselines
- Model weights and thresholds

**`lib/advanced-stats.ts`**
- All hitting and pitching stat calculations
- Empirical Bayes regression implementation
- Quality of contact metrics

**`lib/statistical-models.ts`**
- Pythagorean expectation calculations
- Weather and park factor adjustments
- Poisson distribution for run scoring

**`lib/projections-engine.ts`**
- Ensemble projection modeling
- Win probability calculations
- Spread and total projections

**`lib/edge-calculator.ts`**
- Kelly Criterion implementation
- Expected value calculations
- Value bet identification

**`lib/bankroll-manager.ts`**
- Bet tracking and persistence
- Performance analytics
- Risk management

**`lib/odds-monitor.ts`**
- Real-time odds tracking
- Line movement detection
- Alert system

### Data Flow

```
Mock Data → Statistical Models → Projections Engine → Edge Calculator → UI Dashboard
                                                              ↓
                                                    Bankroll Manager
```

## Configuration

All statistical model parameters can be adjusted in `lib/config.ts`:

```typescript
export const REGRESSION_CONSTANTS = {
  batting: {
    AVG: 210,
    OBP: 460,
    SLG: 320,
    // ... more metrics
  },
  pitching: {
    ERA: 30,
    FIP: 60,
    // ... more metrics
  }
}
```

Adjust regression strength, model weights, and thresholds to tune the system.

## Usage

### Dashboard
- View today's games with projections and odds
- See top betting edges across all markets
- Monitor key statistics and alerts

### Bankroll Tab
- Track all placed bets
- View performance metrics (ROI, win rate, drawdown)
- Analyze profit/loss by bet type

### Live Monitor
- Watch real-time odds movements
- Get alerts for significant line shifts
- Identify value opportunities as they emerge

## Data Sources

Currently uses **mock data** for demonstration. To integrate live data:

1. Replace `lib/mock-data.ts` with API calls to:
   - MLB Stats API for player/team data
   - Odds API for betting lines
   - Weather API for conditions

2. Update the data fetching hooks in `lib/hooks/`

3. Add environment variables for API keys

## Technology Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Component library
- **SWR** - Data fetching and caching
- **Recharts** - Data visualization

## Mobile Optimization

- Mobile-first responsive design
- iOS Safari optimized (no input zoom)
- 44px minimum touch targets
- Progressive Web App ready

## Performance

- Client-side state management with SWR
- Optimized calculations with memoization
- Lazy loading for large datasets
- localStorage for bet persistence

## Future Enhancements

- Database integration (Supabase/Neon)
- Live API data feeds
- Historical backtesting
- Machine learning models
- Multi-sport support
- Social features (bet sharing)

## License

MIT

## Support

For issues or questions, open an issue on GitHub or contact the development team.

---

Built with ❤️ for serious sports bettors
