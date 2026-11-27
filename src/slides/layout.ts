/** Layout constants shared between particle formations and 3D set pieces (station-local units). */

export const TIMELINE = { x0: -9.7, x1: 10.2, y: -2.35, year0: 1900, year1: 2025 }
export function yearX(year: number) {
  return TIMELINE.x0 + ((year - TIMELINE.year0) / (TIMELINE.year1 - TIMELINE.year0)) * (TIMELINE.x1 - TIMELINE.x0)
}
/**
 * Each icon sits exactly above its year. 1903 and 1908 are too close for one row, so flight
 * rides a second row above. `labelY` is where the year label sits; leaders run from there down.
 */
export const INVENTIONS = [
  { year: 1903, label: 'Flight', model: 'Biplane', x: yearX(1903), y: 1.15, labelY: 1.15, labelSide: 'right' },
  { year: 1908, label: 'Automobile', model: 'VintageCar', x: yearX(1908), y: -0.3, labelY: -1.82, labelSide: 'below' },
  { year: 1920, label: 'Radio', model: 'TubeRadio', x: yearX(1920), y: -0.3, labelY: -1.82, labelSide: 'below' },
  { year: 1950, label: 'Television', model: 'CrtTelevision', x: yearX(1950), y: -0.3, labelY: -1.82, labelSide: 'below' },
] as const
export const INVENTION_SCALE = 0.8
export const LATER = [
  { year: 1981, label: 'PC' },
  { year: 1995, label: 'Web' },
  { year: 2007, label: 'Phone' },
] as const

export const ENGINE_X = [-5.6, 0, 5.6] as const

export const GAUGE = { cx: 0, cy: -0.1, r: 3.3, a0: (215 * Math.PI) / 180, a1: (-35 * Math.PI) / 180, max: 3 }
export function gaugeAngle(pct: number) {
  return GAUGE.a0 + (GAUGE.a1 - GAUGE.a0) * (pct / GAUGE.max)
}

export const HOURGLASS_POS = [-4.4, -0.2, 0] as const

export const GDP = { x0: -7.7, x1: 0.5, y0: -2.2, y1: 2.8, z0: -2.0, z1: 0.2, frozen: 0.4 }

export const GLOBE = { r: 4.0 }

/** Far-off "Silicon Valley dream" rings on the growth slide: label, radius, depth, label angle. */
export const DREAMS = [
  { t: '20%?', pct: 3.35 },
  { t: '40%?', pct: 3.85 },
  { t: '200%?', pct: 4.35 },
] as const
