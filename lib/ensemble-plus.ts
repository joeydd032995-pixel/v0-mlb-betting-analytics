/**
 * 9-model stacker (Ensemble++).
 *
 * Combines:
 *   • The legacy 7-model ensemble probability (post-spline, pre-anchor)
 *   • DeepNRFI LightGBM probability (already passed through its own internal
 *     calibrate-and-clamp inside lib/deepnrfi-model.ts)
 *   • Monte Carlo simulation P(NRFI) — calibrated by the caller before it
 *     reaches `combine9Models` so all three inputs sit on a comparable scale.
 *
 * The caller is responsible for keeping the three inputs on the same
 * calibrated scale; otherwise the static stacker weights end up mixing
 * non-comparable distributions and introduce variance the stacker can't fix.
 *
 * Default static weights: 0.75 / 0.20 / 0.05.  When DeepNRFI or Monte Carlo
 * is missing, the weights renormalise so the available models still cover 1.0.
 *
 * Future versions may swap to a logistic stacker (sub-flag STACKER_MODE).
 */

export type StackerMode = "weighted" | "logistic"

export interface CombineInputs {
  ensemble7: number
  deepNrfi: number | null
  monteCarlo: number | null
}

export interface CombineResult {
  final: number
  weights: { ensemble7: number; deepNrfi: number; monteCarlo: number }
}

// Conservative weighting: ensemble7 carries more mass because DeepNRFI only
// improves over the baseline when its artifact is well-trained on point-in-time
// data. Overweighting DeepNRFI when features are league-average placeholders
// adds variance without signal and increases Brier score.
const DEFAULT_WEIGHTS = { ensemble7: 0.75, deepNrfi: 0.20, monteCarlo: 0.05 }

/**
 * Renormalise the default weights so only the present models contribute and
 * the active weights still sum to 1.0.  When only ensemble7 is present we
 * return a no-op blend (weight 1.0 on ensemble7).
 */
export function combine9Models(input: CombineInputs): CombineResult {
  // Guard every contributor with Number.isFinite so an upstream NaN/Infinity
  // can't silently dominate the renormalised blend.
  const present = {
    ensemble7: Number.isFinite(input.ensemble7),
    deepNrfi: input.deepNrfi !== null && Number.isFinite(input.deepNrfi),
    monteCarlo: input.monteCarlo !== null && Number.isFinite(input.monteCarlo),
  }
  let total = 0
  if (present.ensemble7) total += DEFAULT_WEIGHTS.ensemble7
  if (present.deepNrfi) total += DEFAULT_WEIGHTS.deepNrfi
  if (present.monteCarlo) total += DEFAULT_WEIGHTS.monteCarlo

  const w = {
    ensemble7: present.ensemble7 ? DEFAULT_WEIGHTS.ensemble7 / total : 0,
    deepNrfi: present.deepNrfi ? DEFAULT_WEIGHTS.deepNrfi / total : 0,
    monteCarlo: present.monteCarlo ? DEFAULT_WEIGHTS.monteCarlo / total : 0,
  }
  let final = w.ensemble7 * input.ensemble7
  if (present.deepNrfi) final += w.deepNrfi * (input.deepNrfi as number)
  if (present.monteCarlo) final += w.monteCarlo * (input.monteCarlo as number)
  return { final, weights: w }
}
