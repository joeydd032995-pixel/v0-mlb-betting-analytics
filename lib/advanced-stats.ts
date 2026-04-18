import { CONFIG } from "./config"

// ==================== HITTING STATS ====================

export interface HittingStats {
  // Raw stats
  PA: number
  AB: number
  H: number
  singles: number
  doubles: number
  triples: number
  HR: number
  BB: number
  HBP: number
  K: number
  SF: number
  SH: number

  // Batted ball data
  battedBalls: number
  groundBalls: number
  flyBalls: number
  lineDrives: number
  popUps: number
  exitVelocity: number[] // Array of exit velocities
  launchAngles: number[] // Array of launch angles

  // Plate discipline
  pitchesOutsideZone: number
  swingsOutsideZone: number
  totalSwings: number
  whiffs: number

  // Context
  season: number
  playerId: string
}

export interface CalculatedHittingStats {
  // Basic stats
  AVG: number
  OBP: number
  SLG: number
  ISO: number
  OPS: number

  // Advanced stats
  wOBA: number
  xwOBA: number
  wRC: number
  wRCPlus: number

  // Rates
  K_pct: number
  BB_pct: number
  OSwing_pct: number
  Contact_pct: number

  // Quality of contact
  hardHit_pct: number
  barrel_pct: number
  BABIP: number

  // Regressed versions
  wOBA_regressed: number
  xwOBA_regressed: number
  ISO_regressed: number
  K_pct_regressed: number
  BB_pct_regressed: number
  barrel_pct_regressed: number
}

export class HittingStatsCalculator {
  // AVG = H / AB
  static calculateAVG(stats: HittingStats): number {
    return stats.AB > 0 ? stats.H / stats.AB : 0
  }

  // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
  static calculateOBP(stats: HittingStats): number {
    const numerator = stats.H + stats.BB + stats.HBP
    const denominator = stats.AB + stats.BB + stats.HBP + stats.SF
    return denominator > 0 ? numerator / denominator : 0
  }

  // SLG = (1B + 2*2B + 3*3B + 4*HR) / AB
  static calculateSLG(stats: HittingStats): number {
    if (stats.AB === 0) return 0
    const totalBases = stats.singles + 2 * stats.doubles + 3 * stats.triples + 4 * stats.HR
    return totalBases / stats.AB
  }

  // ISO = SLG - AVG
  static calculateISO(stats: HittingStats): number {
    return this.calculateSLG(stats) - this.calculateAVG(stats)
  }

  // wOBA with configurable weights
  static calculateWOBA(stats: HittingStats): number {
    const w = CONFIG.wOBA_weights
    const numerator =
      w.uBB * stats.BB +
      w.HBP * stats.HBP +
      w.single * stats.singles +
      w.double * stats.doubles +
      w.triple * stats.triples +
      w.HR * stats.HR
    return stats.PA > 0 ? numerator / stats.PA : 0
  }

  // xwOBA from Statcast data (EV and LA)
  static calculateXwOBA(stats: HittingStats): number {
    if (stats.battedBalls === 0) return this.calculateWOBA(stats)

    let expectedRunValue = 0

    // Calculate expected run value for each batted ball
    for (let i = 0; i < stats.exitVelocity.length; i++) {
      const ev = stats.exitVelocity[i]
      const la = stats.launchAngles[i]
      expectedRunValue += expectedRunValueFromEVLA(ev, la)
    }

    // Add fixed values for BB, HBP, K
    const w = CONFIG.wOBA_weights
    expectedRunValue += w.uBB * stats.BB + w.HBP * stats.HBP

    return stats.PA > 0 ? expectedRunValue / stats.PA : 0
  }

  // wRC+ (Weighted Runs Created Plus)
  static calculateWRCPlus(stats: HittingStats, parkFactor = 1.0): number {
    const wOBA = this.calculateWOBA(stats)
    const lgWOBA = CONFIG.league.wOBA
    const wOBAScale = CONFIG.wOBA_weights.wOBAScale
    const lgRperPA = CONFIG.league.runsPerGame / 9 / 3.9 // Rough PA per game

    // wRAA = ((wOBA - lgwOBA) / wOBAScale) * PA
    const wRAA = ((wOBA - lgWOBA) / wOBAScale) * stats.PA

    // wRC = wRAA + (lgR/PA * PA)
    const wRC = wRAA + lgRperPA * stats.PA

    // wRC+ = 100 * (wRC / PA) / (lgR/PA), adjusted for park
    const wRCPlus = stats.PA > 0 ? (100 * (wRC / stats.PA / lgRperPA)) / parkFactor : 100

    return wRCPlus
  }

  // K% = (K / PA) * 100
  static calculateKPct(stats: HittingStats): number {
    return stats.PA > 0 ? (stats.K / stats.PA) * 100 : 0
  }

  // BB% = (BB / PA) * 100
  static calculateBBPct(stats: HittingStats): number {
    return stats.PA > 0 ? (stats.BB / stats.PA) * 100 : 0
  }

  // O-Swing% = (Swings outside zone / Pitches outside zone) * 100
  static calculateOSwingPct(stats: HittingStats): number {
    return stats.pitchesOutsideZone > 0 ? (stats.swingsOutsideZone / stats.pitchesOutsideZone) * 100 : 0
  }

  // Contact% = ((Swings - Whiffs) / Swings) * 100
  static calculateContactPct(stats: HittingStats): number {
    return stats.totalSwings > 0 ? ((stats.totalSwings - stats.whiffs) / stats.totalSwings) * 100 : 0
  }

  // Hard-Hit% = (EV >= 95 mph / Batted balls) * 100
  static calculateHardHitPct(stats: HittingStats): number {
    if (stats.battedBalls === 0) return 0
    const hardHits = stats.exitVelocity.filter((ev) => ev >= 95).length
    return (hardHits / stats.battedBalls) * 100
  }

  // Barrel% = (Barrels / Batted balls) * 100
  static calculateBarrelPct(stats: HittingStats): number {
    if (stats.battedBalls === 0) return 0
    let barrels = 0
    for (let i = 0; i < stats.exitVelocity.length; i++) {
      if (this.isBarrel(stats.exitVelocity[i], stats.launchAngles[i])) {
        barrels++
      }
    }
    return (barrels / stats.battedBalls) * 100
  }

  // Barrel definition (simplified)
  private static isBarrel(ev: number, la: number): boolean {
    return ev >= 98 && la >= 26 && la <= 30
  }

  // BABIP = (H - HR) / (AB - K - HR + SF)
  static calculateBABIP(stats: HittingStats): number {
    const denominator = stats.AB - stats.K - stats.HR + stats.SF
    return denominator > 0 ? (stats.H - stats.HR) / denominator : 0
  }

  // Empirical Bayes regression
  static regressStat(observed: number, sampleSize: number, regressionN: number, leaguePrior: number): number {
    return (
      (sampleSize / (sampleSize + regressionN)) * observed + (regressionN / (sampleSize + regressionN)) * leaguePrior
    )
  }

  // Calculate all hitting stats
  static calculateAll(stats: HittingStats, parkFactor = 1.0): CalculatedHittingStats {
    const wOBA = this.calculateWOBA(stats)
    const xwOBA = this.calculateXwOBA(stats)
    const ISO = this.calculateISO(stats)
    const K_pct = this.calculateKPct(stats)
    const BB_pct = this.calculateBBPct(stats)
    const barrel_pct = this.calculateBarrelPct(stats)

    return {
      AVG: this.calculateAVG(stats),
      OBP: this.calculateOBP(stats),
      SLG: this.calculateSLG(stats),
      ISO,
      OPS: this.calculateOBP(stats) + this.calculateSLG(stats),
      wOBA,
      xwOBA,
      wRC: 0, // Calculated in wRC+
      wRCPlus: this.calculateWRCPlus(stats, parkFactor),
      K_pct,
      BB_pct,
      OSwing_pct: this.calculateOSwingPct(stats),
      Contact_pct: this.calculateContactPct(stats),
      hardHit_pct: this.calculateHardHitPct(stats),
      barrel_pct,
      BABIP: this.calculateBABIP(stats),

      // Regressed versions
      wOBA_regressed: this.regressStat(wOBA, stats.PA, CONFIG.regression.wOBA_PA, CONFIG.league.wOBA),
      xwOBA_regressed: this.regressStat(xwOBA, stats.PA, CONFIG.regression.xwOBA_PA, CONFIG.league.wOBA),
      ISO_regressed: this.regressStat(ISO, stats.PA, CONFIG.regression.ISO_PA, 0.145), // League avg ISO
      K_pct_regressed: this.regressStat(K_pct, stats.PA, CONFIG.regression.K_BB_BF, CONFIG.league.K_pct),
      BB_pct_regressed: this.regressStat(BB_pct, stats.PA, CONFIG.regression.K_BB_BF, CONFIG.league.BB_pct),
      barrel_pct_regressed: this.regressStat(barrel_pct, stats.battedBalls, CONFIG.regression.barrel_hardHit_BIP, 8.5),
    }
  }
}

// ==================== Shared helpers ====================

// Expected run value from Statcast exit velocity and launch angle.
// Shared by HittingStatsCalculator.calculateXwOBA and
// PitchingStatsCalculator.calculateXwOBAAllowed.
function expectedRunValueFromEVLA(ev: number, la: number): number {
  if (ev < 70) return 0.1
  if (ev >= 95 && la >= 25 && la <= 35) return 2.0
  if (ev >= 90) return 0.9
  if (la < 10) return 0.3
  if (la > 50) return 0.2
  return 0.6
}

// ==================== PITCHING STATS ====================

export interface PitchingStats {
  // Raw stats
  IP: number
  BF: number // Batters faced
  H: number
  ER: number
  HR: number
  BB: number
  HBP: number
  K: number

  // Batted ball data
  groundBalls: number
  flyBalls: number
  lineDrives: number
  popUps: number
  exitVelocityAllowed: number[]
  launchAnglesAllowed: number[]

  // Context
  season: number
  playerId: string
  teamId: string
}

export interface CalculatedPitchingStats {
  // Basic stats
  ERA: number
  WHIP: number

  // Advanced stats
  FIP: number
  xFIP: number
  SIERA: number
  xERA: number
  ERAPlus: number
  FIPMinus: number

  // Rates
  K_pct: number
  BB_pct: number
  K_BB_pct: number
  GB_pct: number
  HR_FB: number

  // Quality of contact
  hardHit_pct_allowed: number
  barrel_pct_allowed: number
  xwOBA_allowed: number

  // Regressed versions
  FIP_regressed: number
  K_pct_regressed: number
  BB_pct_regressed: number
  xwOBA_allowed_regressed: number
}

export class PitchingStatsCalculator {
  // ERA = (9 * ER) / IP
  static calculateERA(stats: PitchingStats): number {
    return stats.IP > 0 ? (9 * stats.ER) / stats.IP : 0
  }

  // FIP = ((13 * HR) + (3 * (BB + HBP)) - (2 * K)) / IP + FIP_constant
  static calculateFIP(stats: PitchingStats): number {
    if (stats.IP === 0) return 0
    const fip = (13 * stats.HR + 3 * (stats.BB + stats.HBP) - 2 * stats.K) / stats.IP + CONFIG.FIP_constant
    return fip
  }

  // xFIP = ((13 * (FB * lgHR/FB)) + (3 * (BB + HBP)) - (2 * K)) / IP + FIP_constant
  static calculateXFIP(stats: PitchingStats): number {
    if (stats.IP === 0) return 0
    const fb = stats.flyBalls
    const expectedHR = fb * (CONFIG.league.HR_FB / 100)
    const xfip = (13 * expectedHR + 3 * (stats.BB + stats.HBP) - 2 * stats.K) / stats.IP + CONFIG.FIP_constant
    return xfip
  }

  // SIERA (Skill-Interactive ERA) - simplified formula
  static calculateSIERA(stats: PitchingStats): number {
    const K_pct = this.calculateKPct(stats)
    const BB_pct = this.calculateBBPct(stats)
    const GB_pct = this.calculateGBPct(stats)
    const HR_FB = this.calculateHRFB(stats)

    // Simplified SIERA formula
    const siera =
      6.25 * (BB_pct / 100) +
      6.3 * (K_pct / 100) -
      14.1 * Math.pow(GB_pct / 100, 2) * (K_pct / (K_pct + BB_pct)) -
      1.4 * (GB_pct / 100) -
      0.18 * (GB_pct / 100) * (K_pct / 100) -
      0.7 * (HR_FB / 100) +
      4.17

    return siera
  }

  // xERA from xwOBA allowed
  static calculateXERA(stats: PitchingStats): number {
    const xwOBA = this.calculateXwOBAAllowed(stats)
    // Linear regression: xERA ≈ a + b * xwOBA_allowed
    // Fitted values: xERA ≈ -8.5 + 41 * xwOBA
    return -8.5 + 41 * xwOBA
  }

  // ERA+ = (League ERA * Park factor / Pitcher ERA) * 100
  static calculateERAPlus(stats: PitchingStats, parkFactor = 1.0): number {
    const era = this.calculateERA(stats)
    return era > 0 ? ((CONFIG.league.ERA * parkFactor) / era) * 100 : 100
  }

  // FIP- = (Pitcher FIP / League FIP_adj) * 100
  static calculateFIPMinus(stats: PitchingStats, parkFactor = 1.0): number {
    const fip = this.calculateFIP(stats)
    const leagueFIPAdj = CONFIG.league.FIP * parkFactor
    return (fip / leagueFIPAdj) * 100
  }

  // K% = (K / BF) * 100
  static calculateKPct(stats: PitchingStats): number {
    return stats.BF > 0 ? (stats.K / stats.BF) * 100 : 0
  }

  // BB% = (BB / BF) * 100
  static calculateBBPct(stats: PitchingStats): number {
    return stats.BF > 0 ? (stats.BB / stats.BF) * 100 : 0
  }

  // WHIP = (BB + H) / IP
  static calculateWHIP(stats: PitchingStats): number {
    return stats.IP > 0 ? (stats.BB + stats.H) / stats.IP : 0
  }

  // GB% = GB / (GB + FB + LD + PU) * 100
  static calculateGBPct(stats: PitchingStats): number {
    const total = stats.groundBalls + stats.flyBalls + stats.lineDrives + stats.popUps
    return total > 0 ? (stats.groundBalls / total) * 100 : 0
  }

  // HR/FB = HR / FB * 100
  static calculateHRFB(stats: PitchingStats): number {
    return stats.flyBalls > 0 ? (stats.HR / stats.flyBalls) * 100 : 0
  }

  // Hard-hit% allowed
  static calculateHardHitPctAllowed(stats: PitchingStats): number {
    const battedBalls = stats.exitVelocityAllowed.length
    if (battedBalls === 0) return 0
    const hardHits = stats.exitVelocityAllowed.filter((ev) => ev >= 95).length
    return (hardHits / battedBalls) * 100
  }

  // Barrel% allowed
  static calculateBarrelPctAllowed(stats: PitchingStats): number {
    const battedBalls = stats.exitVelocityAllowed.length
    if (battedBalls === 0) return 0
    let barrels = 0
    for (let i = 0; i < stats.exitVelocityAllowed.length; i++) {
      const ev = stats.exitVelocityAllowed[i]
      const la = stats.launchAnglesAllowed[i]
      if (ev >= 98 && la >= 26 && la <= 30) barrels++
    }
    return (barrels / battedBalls) * 100
  }

  // xwOBA allowed (similar to hitter xwOBA but for opponent contact)
  static calculateXwOBAAllowed(stats: PitchingStats): number {
    const battedBalls = stats.exitVelocityAllowed.length
    if (battedBalls === 0) return CONFIG.league.wOBA

    let expectedRunValue = 0
    for (let i = 0; i < stats.exitVelocityAllowed.length; i++) {
      const ev = stats.exitVelocityAllowed[i]
      const la = stats.launchAnglesAllowed[i]
      expectedRunValue += expectedRunValueFromEVLA(ev, la)
    }

    const w = CONFIG.wOBA_weights
    expectedRunValue += w.uBB * stats.BB + w.HBP * stats.HBP

    return stats.BF > 0 ? expectedRunValue / stats.BF : CONFIG.league.wOBA
  }

  // Calculate all pitching stats
  static calculateAll(stats: PitchingStats, parkFactor = 1.0): CalculatedPitchingStats {
    const FIP = this.calculateFIP(stats)
    const K_pct = this.calculateKPct(stats)
    const BB_pct = this.calculateBBPct(stats)
    const xwOBA_allowed = this.calculateXwOBAAllowed(stats)

    return {
      ERA: this.calculateERA(stats),
      WHIP: this.calculateWHIP(stats),
      FIP,
      xFIP: this.calculateXFIP(stats),
      SIERA: this.calculateSIERA(stats),
      xERA: this.calculateXERA(stats),
      ERAPlus: this.calculateERAPlus(stats, parkFactor),
      FIPMinus: this.calculateFIPMinus(stats, parkFactor),
      K_pct,
      BB_pct,
      K_BB_pct: K_pct - BB_pct,
      GB_pct: this.calculateGBPct(stats),
      HR_FB: this.calculateHRFB(stats),
      hardHit_pct_allowed: this.calculateHardHitPctAllowed(stats),
      barrel_pct_allowed: this.calculateBarrelPctAllowed(stats),
      xwOBA_allowed,

      // Regressed versions
      FIP_regressed: HittingStatsCalculator.regressStat(FIP, stats.IP, CONFIG.regression.FIP_IP, CONFIG.league.FIP),
      K_pct_regressed: HittingStatsCalculator.regressStat(
        K_pct,
        stats.BF,
        CONFIG.regression.K_BB_BF,
        CONFIG.league.K_pct,
      ),
      BB_pct_regressed: HittingStatsCalculator.regressStat(
        BB_pct,
        stats.BF,
        CONFIG.regression.K_BB_BF,
        CONFIG.league.BB_pct,
      ),
      xwOBA_allowed_regressed: HittingStatsCalculator.regressStat(
        xwOBA_allowed,
        stats.BF,
        CONFIG.regression.xwOBA_PA,
        CONFIG.league.wOBA,
      ),
    }
  }
}
