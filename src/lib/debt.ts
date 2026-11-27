/**
 * Stylized federal debt-to-GDP model used by the "half a point" slide.
 *
 * It is not a forecast. It illustrates the talk's claim that the gap between ~2% and ~2.5%
 * real growth separates an exploding debt path from one that converges.
 * Assumptions (deliberately simple, roughly CBO-shaped):
 *  - debt held by the public starts at 100% of GDP in 2026;
 *  - revenue is a constant 18% of GDP;
 *  - primary spending starts at 20.5% of GDP, rises 0.03 pt/yr with aging, and is fixed in
 *    real dollars to a 2%-growth baseline (benefits are not indexed to extra growth);
 *  - inflation 2%; the average interest rate is 4%, rising 1.5 pt per 100 pt of debt above 100%.
 */
export const DEBT_START_YEAR = 2026
export const DEBT_YEARS = 40

export function debtPath(realGrowth: number, years = DEBT_YEARS): number[] {
  const infl = 0.02
  const rev = 0.18
  const spend0 = 0.205
  const aging = 0.0003
  const r0 = 0.04
  const feedback = 0.015
  let d = 1.0
  const out: number[] = []
  for (let t = 0; t <= years; t++) {
    out.push(d)
    const gn = (1 + realGrowth) * (1 + infl) - 1
    const spend = (spend0 + aging * t) * Math.pow(1.02 / (1 + realGrowth), t)
    const r = r0 + feedback * Math.max(0, d - 1)
    d = (d * (1 + r)) / (1 + gn) + (spend - rev)
  }
  return out
}

export const PATH_LOW = debtPath(0.02)
export const PATH_HIGH = debtPath(0.025)

/** Chart frame shared by the particle formation and the 3D set piece (station-local units). */
export const CHART = {
  x0: -7.6,
  x1: 5.4,
  y0: -2.75,
  /** Debt ratio (1 = 100% of GDP) mapped to the top of the chart. */
  maxRatio: 3.3,
  height: 6.9,
}

export function chartX(t: number) {
  return CHART.x0 + (t / DEBT_YEARS) * (CHART.x1 - CHART.x0)
}
export function chartY(ratio: number) {
  return CHART.y0 + (ratio / CHART.maxRatio) * CHART.height
}
