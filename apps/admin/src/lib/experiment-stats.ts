/**
 * Experiment statistics — small, dependency-free implementations of
 * the three primitives the decision panel needs:
 *
 *   - **compareProportions(controlSuccess, controlTotal, variantSuccess,
 *     variantTotal)** — two-proportion z-test. Returns lift (in
 *     percentage points), p-value (two-sided), and a Boolean
 *     `significant` shortcut at α = 0.05.
 *   - **wilsonInterval(success, total, conf=0.95)** — Wilson score
 *     confidence interval for a single proportion. Behaves better
 *     than the normal approximation at small sample sizes (Wikipedia:
 *     "Binomial proportion confidence interval").
 *   - **detectSRM(observed, expected)** — Pearson chi-square goodness
 *     of fit. `expected` is the per-variant expected COUNT (computed
 *     from traffic_allocation × total exposed). `observed` is the
 *     actual per-variant count from Tinybird. Returns p-value and a
 *     `mismatch` flag at p < 0.001 (Statsig / Eppo's standard threshold
 *     — false positives here mean wasted investigation, false negatives
 *     mean wrong decisions, so the threshold is intentionally strict).
 *
 * All math uses standard textbook formulas; no bayes / sequential
 * variants in v1.5. Sources cited in the function docstrings.
 */

// ─── erfc / normalCDF — needed by every test ─────────────────────

/**
 * Complementary error function via Abramowitz & Stegun 7.1.26
 * polynomial approximation. Max abs error ~1.5e-7. Sufficient for
 * decision-panel display precision.
 */
function erfc(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return 1 - sign * y
}

/** Standard normal CDF Φ(z). */
export function normalCDF(z: number): number {
  return 1 - 0.5 * erfc(z / Math.SQRT2)
}

/** Two-sided p-value for a z-statistic. */
export function twoSidedPValue(z: number): number {
  const absZ = Math.abs(z)
  return 2 * (1 - normalCDF(absZ))
}

// ─── Wilson interval ─────────────────────────────────────────────

export interface WilsonInterval {
  /** Point estimate p̂ = success / total. NaN when total=0. */
  rate: number
  /** Lower bound. NaN when total=0. */
  lower: number
  /** Upper bound. NaN when total=0. */
  upper: number
}

/**
 * Wilson score interval for a single binomial proportion.
 * Conf = 0.95 → z* = 1.96.
 *
 * Formula (Wikipedia "Binomial proportion confidence interval"):
 *   center = (p̂ + z²/2n) / (1 + z²/n)
 *   margin = z·√[ p̂(1-p̂)/n + z²/4n² ] / (1 + z²/n)
 */
export function wilsonInterval(
  success: number,
  total: number,
  conf = 0.95,
): WilsonInterval {
  if (total <= 0) return { rate: NaN, lower: NaN, upper: NaN }
  const p = success / total
  const z = zStarForConf(conf)
  const z2 = z * z
  const denom = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denom
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom
  return {
    rate: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  }
}

/** z* for two-sided confidence. Hard-coded for the common cases. */
function zStarForConf(conf: number): number {
  // Just three values matter for our UI. Avoid an inverse-CDF dependency.
  if (Math.abs(conf - 0.99) < 1e-6) return 2.5758
  if (Math.abs(conf - 0.95) < 1e-6) return 1.96
  if (Math.abs(conf - 0.9) < 1e-6) return 1.6449
  // Fallback — only hit if caller passes an unusual value.
  return 1.96
}

// ─── Two-proportion z-test ───────────────────────────────────────

export interface ProportionComparison {
  /** Variant rate p̂_v = sV / nV. */
  variantRate: number
  /** Control rate p̂_c = sC / nC. */
  controlRate: number
  /**
   * Absolute lift in percentage points: (p̂_v - p̂_c) × 100.
   * Positive = variant beat control.
   */
  liftPp: number
  /** Two-sided p-value (null if either group is empty). */
  pValue: number | null
  /** True iff p < α. Convenience for UI color coding. */
  significant: boolean
  /** 95% Wilson CI on the variant's rate. */
  variantCi: WilsonInterval
  /** 95% Wilson CI on the control's rate. */
  controlCi: WilsonInterval
}

/**
 * Two-proportion z-test using pooled standard error (the standard
 * Bernoulli z-test). Returns enough numbers to render the decision
 * panel without further math.
 *
 * Reference: NIST Engineering Statistics Handbook 7.3.3.1
 * https://www.itl.nist.gov/div898/handbook/prc/section3/prc331.htm
 */
export function compareProportions(
  controlSuccess: number,
  controlTotal: number,
  variantSuccess: number,
  variantTotal: number,
  alpha = 0.05,
): ProportionComparison {
  if (controlTotal <= 0 || variantTotal <= 0) {
    return {
      variantRate: variantTotal > 0 ? variantSuccess / variantTotal : NaN,
      controlRate: controlTotal > 0 ? controlSuccess / controlTotal : NaN,
      liftPp: NaN,
      pValue: null,
      significant: false,
      variantCi: wilsonInterval(variantSuccess, variantTotal),
      controlCi: wilsonInterval(controlSuccess, controlTotal),
    }
  }

  const pC = controlSuccess / controlTotal
  const pV = variantSuccess / variantTotal
  const pPooled =
    (controlSuccess + variantSuccess) / (controlTotal + variantTotal)
  const se = Math.sqrt(
    pPooled * (1 - pPooled) * (1 / controlTotal + 1 / variantTotal),
  )

  // Edge case: pooled rate = 0 or 1 → SE = 0 → z is undefined. Treat
  // as "no effect detectable" (also: this only happens with truly
  // degenerate data, e.g. zero conversions in either arm).
  let pValue: number | null = null
  let significant = false
  if (se > 0) {
    const z = (pV - pC) / se
    pValue = twoSidedPValue(z)
    significant = pValue < alpha
  }

  return {
    variantRate: pV,
    controlRate: pC,
    liftPp: (pV - pC) * 100,
    pValue,
    significant,
    variantCi: wilsonInterval(variantSuccess, variantTotal),
    controlCi: wilsonInterval(controlSuccess, controlTotal),
  }
}

// ─── Chi-square SRM detection ────────────────────────────────────

export interface SrmResult {
  /** Test statistic χ². */
  chiSquare: number
  /** Two-sided p-value via chi-square CDF (k-1 df). */
  pValue: number
  /** True if p < threshold (default 0.001). */
  mismatch: boolean
}

/**
 * Pearson chi-square goodness-of-fit. `observed[k]` and `expected[k]`
 * must share keys; `expected[k]` must be > 0 (skip categories where
 * the experiment doesn't expect any traffic).
 *
 * Reference: Statsig's "Sample Ratio Mismatch" blog post + standard
 * chi-square test (e.g. Khan Academy, Wikipedia).
 */
export function detectSRM(
  observed: Record<string, number>,
  expected: Record<string, number>,
  threshold = 0.001,
): SrmResult {
  let chi = 0
  let dof = 0
  for (const key of Object.keys(expected)) {
    const e = expected[key]
    if (!e || e <= 0) continue
    const o = observed[key] ?? 0
    chi += ((o - e) ** 2) / e
    dof += 1
  }
  dof = Math.max(1, dof - 1)
  const pValue = chiSquarePValue(chi, dof)
  return { chiSquare: chi, pValue, mismatch: pValue < threshold }
}

/**
 * Right-tailed p-value for a chi-square statistic. We use the upper
 * incomplete gamma function via a series + continued-fraction
 * expansion (Numerical Recipes ch. 6.2). Sufficient precision for
 * SRM display (we only care about p ≪ 0.01 vs. p ≫ 0.01).
 */
function chiSquarePValue(x: number, k: number): number {
  if (x <= 0) return 1
  return upperIncompleteGammaP(k / 2, x / 2)
}

/** Q(a, x) — regularised upper incomplete gamma function. */
function upperIncompleteGammaP(a: number, x: number): number {
  if (x < a + 1) {
    // Series expansion is more efficient — invert: Q = 1 - P.
    return 1 - lowerSeries(a, x)
  }
  return continuedFraction(a, x)
}

function logGamma(z: number): number {
  // Lanczos approximation — accurate to ~1e-15 in the relevant range.
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function lowerSeries(a: number, x: number): number {
  let sum = 1 / a
  let term = sum
  for (let i = 1; i < 200; i++) {
    term *= x / (a + i)
    sum += term
    if (Math.abs(term) < Math.abs(sum) * 1e-12) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

function continuedFraction(a: number, x: number): number {
  // Lentz's method.
  const FPMIN = 1e-300
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return h * Math.exp(-x + a * Math.log(x) - logGamma(a))
}
