/**
 * Particle formations: the shapes the deck's single persistent swarm morphs between.
 * Every formation returns exactly SWARM_COUNT particles in station-local space, with
 * per-particle color (linear, pre-boosted for bloom), a flow vector (local looping motion),
 * and an arrival order (0..1) that art-directs how the shape assembles.
 */
import { palette } from '../theme'
import { gauss, inkPixels, mixRgb, rgb, rng, smoothstep } from '../lib/sample'
import { GLOBE, GAUGE, GDP, INVENTIONS, LATER, TIMELINE, ENGINE_X, HOURGLASS_POS, gaugeAngle, yearX } from '../slides/layout'
import { PATH_HIGH, PATH_LOW, chartX, chartY, CHART, DEBT_YEARS } from '../lib/debt'
import { Region, latLonToVec, regionAt } from '../lib/geo'

export const SWARM_COUNT = 80000

export type Formation = {
  pos: Float32Array
  col: Float32Array
  flow: Float32Array
  order: Float32Array
  /** World-space point size multiplier. */
  size: number
  /** Formations with the same family share identical positions; transitions rotate instead of morph. */
  family?: string
  yaw?: number
  tilt?: number
  /** Continuous spin around local Y, rad/s. */
  spin?: number
}

type RGB = [number, number, number]

class Builder {
  i = 0
  pos: Float32Array
  col: Float32Array
  flow: Float32Array
  order: Float32Array
  r: () => number
  constructor(public n: number, seed: number) {
    this.pos = new Float32Array(n * 3)
    this.col = new Float32Array(n * 3)
    this.flow = new Float32Array(n * 4)
    this.order = new Float32Array(n)
    this.r = rng(seed)
  }
  get full() {
    return this.i >= this.n
  }
  get left() {
    return this.n - this.i
  }
  /** flow = [dx, dy, dz, speed]; negative speed loops without the alpha fade (seamless patterns). */
  push(x: number, y: number, z: number, c: RGB, order = this.r(), flow?: [number, number, number, number]) {
    if (this.i >= this.n) return
    const i = this.i++
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.col[i * 3] = c[0]
    this.col[i * 3 + 1] = c[1]
    this.col[i * 3 + 2] = c[2]
    this.order[i] = order
    if (flow) {
      this.flow[i * 4] = flow[0]
      this.flow[i * 4 + 1] = flow[1]
      this.flow[i * 4 + 2] = flow[2]
      this.flow[i * 4 + 3] = flow[3]
    }
  }
  /** Fill the remainder with faint ambient haze around the station. */
  haze(opts: { w?: number; h?: number; z0?: number; z1?: number; color?: string; boost?: number } = {}) {
    const { w = 30, h = 18, z0 = -16, z1 = 4, color = '#8fa0ff', boost = 0.1 } = opts
    const r = this.r
    while (!this.full) {
      const c = rgb(color, boost * (0.4 + r()))
      this.push((r() - 0.5) * w, (r() - 0.5) * h, z0 + r() * (z1 - z0), c, r(), [0, 0.3, 0, 0.03 + r() * 0.05])
    }
  }
  done(size: number, extra: Partial<Formation> = {}): Formation {
    this.haze()
    return { pos: this.pos, col: this.col, flow: this.flow, order: this.order, size, ...extra }
  }
}

const N = SWARM_COUNT
const E = rgb(palette.ember)
const ED = rgb(palette.emberDeep)
const I = rgb(palette.ice)
const ID = rgb(palette.iceDeep)
const A = rgb(palette.alarm)
const V = rgb(palette.violet)
const P = rgb(palette.paper)
const WHITE: RGB = [1, 0.92, 0.8]
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]

/* ---------------------------------------------------------------- eclipse / dawn */

function corona(seed: number, dawn: boolean): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const R0 = dawn ? 4.1 : 3.7
  const corona = Math.floor(N * 0.6)
  for (let k = 0; k < corona; k++) {
    const th = r() * Math.PI * 2
    // streamers: angular clumping for structure
    const clump = 0.5 + 0.5 * Math.sin(th * 7 + Math.sin(th * 3) * 2)
    const tail = Math.pow(r(), dawn ? 2.8 : 3.6) * (dawn ? 4.2 : 3.4) * (0.4 + clump)
    const rad = R0 + Math.abs(gauss(r)) * 0.18 + tail
    const x = Math.cos(th) * rad
    const y = Math.sin(th) * rad
    const z = gauss(r) * 0.25
    const f = smoothstep(R0, R0 + 3.2, rad)
    let c = mixRgb(sc(WHITE, dawn ? 3.2 : 2.6), sc(E, dawn ? 2.2 : 1.6), smoothstep(0, 0.25, f))
    c = mixRgb(c, sc(dawn ? ED : V, dawn ? 0.9 : 0.6), smoothstep(0.25, 1, f))
    const out = 0.25 + r() * 0.9
    b.push(x, y, z, c, th / (Math.PI * 2), [Math.cos(th) * out, Math.sin(th) * out, 0, 0.04 + r() * 0.08])
  }
  // razor rim
  for (let k = 0; k < N * 0.08; k++) {
    const th = r() * Math.PI * 2
    const rad = R0 + gauss(r) * 0.025
    b.push(Math.cos(th) * rad, Math.sin(th) * rad, gauss(r) * 0.05, sc(WHITE, dawn ? 4.5 : 3.6), th / (Math.PI * 2))
  }
  // tilted accretion ring
  const tilt = 1.25
  for (let k = 0; k < N * 0.14; k++) {
    const th = r() * Math.PI * 2
    const rad = 5.6 + Math.abs(gauss(r)) * 0.9
    const x = Math.cos(th) * rad
    const zz = Math.sin(th) * rad
    const y = -Math.sin(tilt) * zz * 0.18 + gauss(r) * 0.03
    const z = Math.cos(tilt) * zz * 0.4 - 4.5
    const c = dawn ? sc(E, 1.1) : sc(E, 0.45 + r() * 0.35)
    b.push(x, y, z, c, r(), [-Math.sin(th) * 0.4, 0, Math.cos(th) * 0.4 * 0.4, 0.05])
  }
  b.haze({ boost: dawn ? 0.16 : 0.1, color: dawn ? palette.ember : '#8fa0ff' })
  return b.done(0.042)
}

/* ---------------------------------------------------------------- two truths */

function split(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const X = 4.6
  const base = -0.45
  // optimism: a sunrise fan of sparks rising from one bright source
  const src = [-X, base, 0] as const
  for (let k = 0; k < N * 0.38; k++) {
    const ang = gauss(r) * 0.42 // spread around vertical
    const rad = 0.12 + Math.pow(r(), 1.1) * 3.6
    const dx = Math.sin(ang)
    const dy = Math.cos(ang)
    const t = rad / 3.7
    const c = mixRgb(sc(WHITE, 2.4), mixRgb(sc(E, 2.2), sc(ED, 1.3), t), Math.min(1, t * 2.2))
    b.push(src[0] + dx * rad + gauss(r) * 0.04, src[1] + 0.05 + dy * rad, gauss(r) * 0.25 * (0.3 + t), c, t * 0.35, [dx * 0.7, dy * 0.7, 0, 0.1 + r() * 0.1])
  }
  // the source glow
  for (let k = 0; k < N * 0.012; k++) {
    const th = r() * Math.PI
    const rad = Math.abs(gauss(r)) * 0.3
    b.push(src[0] + Math.cos(th) * rad, src[1] + Math.sin(th) * rad * 0.7, gauss(r) * 0.08, sc(WHITE, 1.8), 0)
  }
  // horizon line under both halves
  for (let k = 0; k < N * 0.04; k++) {
    const x = -8.5 + r() * 17
    const left = x < 0
    b.push(x, base - 0.05 + gauss(r) * 0.015, 0, left ? sc(E, 1.2 * (1 - Math.abs(x + X) / 4) + 0.15) : sc(I, 0.5 * (1 - Math.abs(x - X) / 4) + 0.12), Math.abs(x) / 8.5)
  }
  // realism: a low cold cloud bank and a slow, heavy curtain settling into a heap
  for (let k = 0; k < N * 0.14; k++) {
    const x = X + gauss(r) * 1.3
    const y = base + 3.25 + gauss(r) * 0.22 - Math.pow((x - X) / 2.6, 2) * 0.35
    b.push(x, y, gauss(r) * 0.5, mixRgb(sc(ID, 0.6), sc(I, 1.0), r() * 0.5), 0.6 + r() * 0.1, [0.25, 0, 0, 0.015])
  }
  for (let k = 0; k < N * 0.2; k++) {
    const x = X + gauss(r) * 1.05
    const y = base + r() * 3.1
    b.push(x, y, gauss(r) * 0.35, mixRgb(sc(I, 1.2), sc(ID, 0.8), r()), 0.7 + (1 - (y - base) / 3.1) * 0.22, [0, -0.7, 0, 0.05 + r() * 0.03])
  }
  // (the heap itself is a separate, growing set piece on the slide)
  for (let k = 0; k < 0; k++) {
    const x = X + gauss(r) * 1.0
    const h = 0.55 * Math.exp(-Math.pow((x - X) / 1.1, 2)) * Math.pow(r(), 0.6)
    b.push(x, base + h, gauss(r) * 0.4, mixRgb(sc(ID, 0.7), sc(I, 1.3), h / 0.55), 0.92 + r() * 0.08)
  }
  // divider
  for (let k = 0; k < N * 0.01; k++) {
    const y = -1.8 + r() * 6.3
    b.push(gauss(r) * 0.008, y, 0, sc(P, 0.4), (y + 1.8) / 6.3, [0, 0.4, 0, 0.05])
  }
  return b.done(0.04)
}

/* ---------------------------------------------------------------- timeline */

function timeline(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const { x0, x1, y } = TIMELINE
  const xEra = yearX(1955)
  // ribbon
  for (let k = 0; k < N * 0.34; k++) {
    const early = r() < 0.62
    const x = early ? x0 + r() * (xEra - x0) : xEra + r() * (x1 - xEra)
    const c = early ? mixRgb(sc(E, 2.0), sc(WHITE, 2.2), r() * 0.3) : sc(I, 0.75)
    b.push(x, y + gauss(r) * 0.045, gauss(r) * 0.22, c, (x - x0) / (x1 - x0), [0.35, 0, 0, 0.06])
  }
  // decade ticks
  for (let yr = 1900; yr <= 2020; yr += 10) {
    const x = yearX(yr)
    for (let k = 0; k < 160; k++) b.push(x, y - 0.1 - r() * 0.3, 0, sc(P, 0.6), (x - x0) / (x1 - x0))
  }
  // leader lines from the invention icons down to their exact year, plus glow bursts
  for (const inv of INVENTIONS) {
    const tx = yearX(inv.year)
    // vertical leader from below the label (or the icon, for the upper row) down to the exact year
    const top = inv.labelSide === 'below' ? inv.labelY - 0.28 : inv.y - 0.85
    const lz = inv.labelSide === 'below' ? 0 : 0.25
    for (let k = 0; k < 900; k++) {
      const t = r()
      const yy = top + (y - top) * t
      b.push(tx + gauss(r) * 0.008, yy, lz, sc(E, 1.6), (tx - x0) / (x1 - x0) + 0.05 * t, [0, -0.25, 0, 0.18])
    }
    for (let k = 0; k < 2200; k++) {
      const th = r() * Math.PI * 2
      const rad = Math.abs(gauss(r)) * 0.35
      b.push(tx + Math.cos(th) * rad, y + Math.sin(th) * rad * 0.6, gauss(r) * 0.1, sc(WHITE, 3), (tx - x0) / (x1 - x0))
    }
  }
  // the "big change" era: dense upward sparks over 1903–1955
  for (let k = 0; k < N * 0.055; k++) {
    const x = yearX(1903) + r() * (xEra - yearX(1903))
    const h = Math.pow(r(), 2.5) * 2.4
    b.push(x, y + h, gauss(r) * 0.4, sc(E, 1.1 + (1 - h / 2.4)), (x - x0) / (x1 - x0), [0, 0.6, 0, 0.1 + r() * 0.1])
  }
  // what's coming: a surge rising at the right edge of the timeline
  for (let k = 0; k < N * 0.05; k++) {
    const u = Math.pow(r(), 0.5)
    const x = yearX(2008) + u * (yearX(2025) + 0.4 - yearX(2008))
    const h = Math.pow(u, 3.2) * 4.2 * Math.pow(r(), 0.7)
    b.push(x + gauss(r) * 0.03, y + h, gauss(r) * 0.15, mixRgb(sc(E, 1.2), sc(WHITE, 2.6), u * u), 0.92 + u * 0.08, [0, 0.5, 0, 0.12 + r() * 0.1])
  }
  // later inventions: short, cool bumps
  for (const l of LATER) {
    const tx = yearX(l.year)
    for (let k = 0; k < 900; k++) {
      const h = Math.pow(r(), 2) * 0.7
      b.push(tx + gauss(r) * 0.05, y + h, gauss(r) * 0.08, sc(I, 1.3), (tx - x0) / (x1 - x0))
    }
  }
  return b.done(0.034)
}

/* ---------------------------------------------------------------- projects */

function projects(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const y = -2.6
  const pitch = 0.95
  const half = 0.26
  const per = 20
  const cols = 44
  const rows = 70
  const cx = 0
  const cz = -10
  const cells: [number, number, number][] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = (i - cols / 2 + 0.5) * pitch
      const z = -3.2 - j * pitch
      const d = Math.hypot(x - cx, (z - cz) * 0.8)
      cells.push([x, z, d])
    }
  cells.sort((a, b2) => a[2] - b2[2])
  const maxD = cells[cells.length - 1][2]
  const budget = Math.floor(N * 0.8)
  for (const [x, z, d] of cells) {
    if (b.i + per > budget) break
    const outer = d / maxD
    const hot = r() < 0.08 + 0.85 * smoothstep(0.22, 0.6, outer)
    const c = hot ? sc(I, 2.4) : sc(E, 1.0 + r() * 1.5)
    const o = hot ? 0.45 + outer * 0.55 : outer * 0.5 + r() * 0.05
    for (let k = 0; k < per; k++) {
      const t = (k / per) * 4
      const side = Math.floor(t)
      const u = (t - side) * 2 - 1
      const px = side === 0 ? u * half : side === 1 ? half : side === 2 ? -u * half : -half
      const pz = side === 0 ? -half : side === 1 ? u * half : side === 2 ? half : -u * half
      b.push(x + px, y, z + pz, c, o)
    }
  }
  // launches: sparks rising from random projects
  while (b.i < N * 0.93) {
    const [x, z, d] = cells[Math.floor(Math.pow(r(), 1.6) * cells.length * 0.7)]
    const h = r() * 3.2
    b.push(x + gauss(r) * 0.05, y + h, z + gauss(r) * 0.05, sc(E, 1.6 * (1 - h / 3.2) + 0.3), d / maxD, [0, 1.2, 0, 0.15 + r() * 0.1])
  }
  return b.done(0.062)
}

/* ---------------------------------------------------------------- job engines */

function engines(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  // 1. experiments: bubbles rising from the flask
  for (let k = 0; k < N * 0.18; k++) {
    const yy = -0.2 + Math.pow(r(), 0.8) * 3.0
    const w = 0.25 + (yy + 0.2) * 0.18
    b.push(ENGINE_X[0] + gauss(r) * w, yy, -1.4 + gauss(r) * w * 0.6, mixRgb(sc(I, 1.6), sc(WHITE, 1.6), r() * 0.3), (yy + 0.2) / 4.2, [gauss(r) * 0.1, 0.9, 0, 0.12 + r() * 0.1])
  }
  // 2. data: streaks orbiting the ball in tilted rings
  for (let k = 0; k < N * 0.2; k++) {
    const ring = Math.floor(r() * 3)
    const th = r() * Math.PI * 2
    const rad = 1.55 + ring * 0.32 + gauss(r) * 0.04
    const tilt = -0.5 + ring * 0.5
    const x = Math.cos(th) * rad
    const z = Math.sin(th) * rad
    const y = 0.55 + z * Math.sin(tilt) * 0.35
    b.push(ENGINE_X[1] + x, y, -1.2 + z * Math.cos(tilt) * 0.6, mixRgb(sc(I, 1.8), sc(WHITE, 1.4), r() * 0.25), th / (Math.PI * 2), [-Math.sin(th) * 0.5, 0, Math.cos(th) * 0.5 * 0.6, 0.1 + r() * 0.05])
  }
  // 3. energy: rays radiating from the sun above the panels
  const sun = [ENGINE_X[2] + 0.05, 1.65, -1.2] as const
  for (let k = 0; k < N * 0.2; k++) {
    const ray = Math.floor(r() * 18)
    const th = (ray / 18) * Math.PI * 2 + gauss(r) * 0.03
    const rad = 0.5 + Math.pow(r(), 0.7) * 1.8
    b.push(sun[0] + Math.cos(th) * rad, sun[1] + Math.sin(th) * rad * 0.85, sun[2], mixRgb(sc(E, 1.9), sc(WHITE, 1.4), Math.max(0, 1 - rad / 1.4)), rad / 2.7, [Math.cos(th) * 0.4, Math.sin(th) * 0.34, 0, 0.12 + r() * 0.08])
  }
  return b.done(0.03)
}

/* ---------------------------------------------------------------- status ladder */

function ladder(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  for (let k = 0; k < N * 0.32; k++) {
    const t = r()
    const x = -0.8 + t * 9.0
    const y = -2.2 + t * 5.4
    const off = gauss(r) * 1.1
    const c = mixRgb(sc(E, 0.5), sc(E, 1.8), t)
    b.push(x - off * 0.45, y + off * 0.9, -3 + gauss(r) * 1.2, c, t, [0.5, 1, 0, 0.04])
  }
  for (let k = 0; k < N * 0.05; k++) {
    const t = r()
    b.push(5.5 + gauss(r) * 1.6, -2 + t * 5, -3 + gauss(r), sc(I, 1.2 + r()), t, [0, 0.6, 0, 0.1])
  }
  return b.done(0.032)
}

/* ---------------------------------------------------------------- growth gauge */

function gauge(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const { cx, cy, r: R } = GAUGE
  const arc = (pct0: number, pct1: number, count: number, width: number, col: (p: number) => RGB, z = 0) => {
    for (let k = 0; k < count; k++) {
      const p = pct0 + r() * (pct1 - pct0)
      const a = gaugeAngle(p)
      const rad = R + gauss(r) * width
      b.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z + gauss(r) * 0.05, col(p), p / GAUGE.max)
    }
  }
  arc(0, 3, N * 0.16, 0.05, () => sc(P, 0.35))
  arc(0, 2.0, N * 0.18, 0.07, (p) => mixRgb(sc(E, 0.9), sc(E, 2.2), p / 2))
  arc(2.0, 2.5, N * 0.1, 0.1, () => mixRgb(sc(E, 2.6), sc(WHITE, 2.2), 0.25))
  // ticks
  for (let t = 0; t <= 30; t++) {
    const pct = t / 10
    const major = t % 10 === 0 || t === 25 || t === 20
    const a = gaugeAngle(pct)
    const len = major ? 0.55 : 0.22
    for (let k = 0; k < (major ? 500 : 140); k++) {
      const rad = R + 0.25 + r() * len
      b.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 0, major ? sc(P, 1.3) : sc(P, 0.5), pct / GAUGE.max)
    }
  }
  // ghost dream rings: 20%, 40%, 200% — far away, huge, faint
  // "off the dial": a faint dotted continuation of the arc, where Silicon Valley's dreams live
  for (let k = 0; k < 0; k++) {
    const p = 3 + Math.pow(r(), 0.8) * 0.28
    const a = gaugeAngle(p)
    if (Math.floor(p * 40) % 2) continue
    const rad = GAUGE.r + gauss(r) * 0.03
    b.push(GAUGE.cx + Math.cos(a) * rad, GAUGE.cy + Math.sin(a) * rad, -0.1, sc(V, 0.8 * (1 - (p - 3) / 0.32)), 0.8 + r() * 0.2)
  }
  return b.done(0.04)
}

/* ---------------------------------------------------------------- bottleneck funnel */

function funnel(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const [hx, hy] = HOURGLASS_POS
  for (let k = 0; k < N * 0.6; k++) {
    const t = Math.pow(r(), 0.7)
    const rad = 0.4 + t * 11
    const th = r() * Math.PI * 2 + t * 4.5
    const x = hx + Math.cos(th) * rad * (Math.cos(th) > 0 ? 0.42 : 1)
    const y = hy + 1.6 + Math.sin(th) * rad * 0.26 + t * 0.6
    const z = -4 + Math.sin(th) * rad * 0.5
    const c = mixRgb(sc(WHITE, 2.4), sc(I, 0.7), Math.sqrt(t))
    const inward = 0.6 + r() * 0.6
    b.push(x, y, z, c, 1 - t, [-Math.cos(th) * inward, -Math.sin(th) * inward * 0.32, -Math.sin(th) * inward * 0.5, 0.1 + r() * 0.08])
  }
  return b.done(0.03)
}

/* ---------------------------------------------------------------- sticky strata */

function strata(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const layers = 4
  for (let l = 0; l < layers; l++) {
    const y0 = -3.6 + l * 0.75
    const count = N * 0.17
    for (let k = 0; k < count; k++) {
      const x = -16 + r() * 32
      const z = 2 - Math.pow(r(), 0.7) * 26
      const y = y0 + Math.sin(x * 0.35 + l) * 0.18 + gauss(r) * 0.03
      const c = mixRgb(sc(ED, 0.55), sc(E, 1.1), (l % 3) / 2)
      b.push(x, y, z, c, (x + 16) / 32, [0.6, 0, 0, 0.012 + r() * 0.01])
    }
  }
  return b.done(0.03)
}

/* ---------------------------------------------------------------- slow 40% of GDP */

function gdp(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const { x0, x1, y0, y1, z0, z1, frozen } = GDP
  const xf = x0 + (x1 - x0) * frozen
  // frozen: crystalline lattice
  const step = 0.16
  for (let x = x0; x <= xf; x += step)
    for (let y = y0; y <= y1; y += step)
      for (let z = z0; z <= z1; z += step * 2) {
        const edge = x + step > xf || y + step > y1 || x === x0 || y === y0 ? 2.0 : 1
        b.push(x, y, z, mixRgb(sc(P, 1.0), sc(ID, 0.7), 0.3).map((v) => v * (1.3 + r() * 0.4) * edge) as RGB, ((x - x0) / (x1 - x0)) * 0.5)
      }
  // live: churning gold
  const live = N * 0.5
  for (let k = 0; k < live; k++) {
    const x = xf + 0.15 + r() * (x1 - xf - 0.15)
    const y = y0 + r() * (y1 - y0)
    const z = z0 + r() * (z1 - z0)
    b.push(x, y, z, mixRgb(sc(E, 1.3), sc(WHITE, 1.7), r() * 0.3), 0.5 + r() * 0.5, [gauss(r) * 0.3, 0.5 + r() * 0.4, gauss(r) * 0.2, 0.25 + r() * 0.3])
  }
  return b.done(0.032)
}

/* ---------------------------------------------------------------- debt paths */

function debt(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const sample = (path: number[], t: number) => {
    const i = Math.min(DEBT_YEARS - 1, Math.floor(t))
    const f = t - i
    return path[i] * (1 - f) + path[i + 1] * f
  }
  const clampY = (v: number) => Math.min(v, CHART.y0 + CHART.height + 0.3)
  // the gap between the paths: the explosion
  for (let k = 0; k < N * 0.3; k++) {
    const t = r() * DEBT_YEARS
    const lo = chartY(sample(PATH_HIGH, t))
    const hi = clampY(chartY(sample(PATH_LOW, t)))
    const u = Math.pow(r(), 0.6)
    const y = lo + (hi - lo) * u
    b.push(chartX(t), y, gauss(r) * 0.25, mixRgb(sc(A, 0.5), sc(A, 1.6), u), t / DEBT_YEARS, [0, 0.25, 0, 0.1])
  }
  // under the converging path: calm gold
  for (let k = 0; k < N * 0.2; k++) {
    const t = r() * DEBT_YEARS
    const top = chartY(sample(PATH_HIGH, t))
    const u = Math.pow(r(), 0.5)
    const y = CHART.y0 + (top - CHART.y0) * u
    b.push(chartX(t), y, gauss(r) * 0.25, sc(E, 0.25 + u * 0.7), t / DEBT_YEARS)
  }
  // bright crests along both lines
  for (const [path, col] of [
    [PATH_LOW, sc(A, 3)],
    [PATH_HIGH, sc(E, 3)],
  ] as const) {
    for (let k = 0; k < N * 0.08; k++) {
      const t = r() * DEBT_YEARS
      const y = chartY(sample(path, t))
      if (y > CHART.y0 + CHART.height + 0.3) continue
      b.push(chartX(t), y + gauss(r) * 0.03, gauss(r) * 0.05, col, t / DEBT_YEARS)
    }
  }
  // baseline
  for (let k = 0; k < N * 0.03; k++) {
    const t = r()
    b.push(CHART.x0 + t * (CHART.x1 - CHART.x0), CHART.y0, 0, sc(P, 0.6), t)
  }
  return b.done(0.032)
}

/* ---------------------------------------------------------------- Plan A */

function planA(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const A1 = inkPixels(
    (ctx, w, h) => {
      ctx.font = `600 ${h * 1.05}px Fraunces`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('A', w / 2, h * 0.9)
    },
    { w: 600, h: 600, worldW: 7.4, step: 1 },
  )
  const Bx = inkPixels(
    (ctx, w, h) => {
      ctx.font = `300 ${h * 1.05}px Fraunces`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.setLineDash([10, 14])
      ctx.strokeText('B', w / 2, h * 0.9)
    },
    { w: 600, h: 600, worldW: 7.4, step: 1 },
  )
  const ax = -3.2
  const bx = 6.6
  const aCount = N * 0.68
  for (let k = 0; k < aCount; k++) {
    const j = Math.floor(r() * (A1.pts.length / 2))
    const x = A1.pts[j * 2]
    const y = A1.pts[j * 2 + 1]
    const c = mixRgb(sc(E, 2.7), sc(WHITE, 4.0), Math.pow(r(), 3))
    b.push(ax + x + gauss(r) * 0.01, y + 0.4, gauss(r) * 0.18, c, 1 - (y + 3.7) / 7.4, [0, 0, 0.2, 0.05])
  }
  for (let k = 0; k < 0; k++) {
    const j = Math.floor(r() * (Bx.pts.length / 2))
    const x = Bx.pts[j * 2]
    const y = Bx.pts[j * 2 + 1]
    b.push(bx + x * 0.8, y * 0.8 + 0.1, -5 + gauss(r) * 0.1, sc(P, 0.4), 0.8 + r() * 0.2, [0, -0.6, 0, 0.05 + r() * 0.05])
  }
  return b.done(0.036)
}

/* ---------------------------------------------------------------- 1990s grid */

function grid90s(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const y = -2.9
  const s = 1.4
  const speed = -0.12 // negative: seamless loop, no alpha fade
  for (let k = 0; k < N * 0.42; k++) {
    // lines along z (receding)
    const xi = Math.round((r() - 0.5) * 44)
    const z = 4 - r() * 70
    const fade = smoothstep(-70, -5, z) * (0.1 + 0.9 * smoothstep(-6, 1.0, xi * s))
    b.push(xi * s, y, z, mixRgb(sc(V, 0.4), sc(V, 1.3), fade), -z / 70, [0, 0, s, speed])
  }
  for (let k = 0; k < N * 0.36; k++) {
    // lines along x
    const zi = Math.round(r() * 50)
    const z = 4 - zi * s
    const x = (r() - 0.5) * 62
    const fade = smoothstep(-70, -5, z) * (0.1 + 0.9 * smoothstep(-6, 1.0, x))
    b.push(x, y, z, mixRgb(sc(ED, 0.4), sc(E, 1.2), fade), -z / 70, [0, 0, s, speed])
  }
  // horizon glow line
  for (let k = 0; k < N * 0.04; k++) {
    b.push((r() - 0.5) * 120, y + 0.05 + Math.abs(gauss(r)) * 0.12, -66, sc(E, 1.4), 0.9)
  }
  return b.done(0.045)
}

/* ---------------------------------------------------------------- globe + flat map */

type GlobeMode = 'winners' | 'losers' | 'camps'

let globeCache: { pos: Float32Array; region: Uint8Array; kind: Uint8Array; count: number } | null = null

/** Shared globe positions: land lattice, sparse ocean, atmosphere. Identical across globe slides. */
function globeBase() {
  if (globeCache) return globeCache
  const r = rng(77)
  const pos = new Float32Array(N * 3)
  const region = new Uint8Array(N)
  const kind = new Uint8Array(N) // 0 land, 1 ocean, 2 atmosphere, 3 haze
  let i = 0
  const R = GLOBE.r
  const M = 200000
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let k = 0; k < M && i < N * 0.72; k++) {
    const yv = 1 - (k / (M - 1)) * 2
    const th = golden * k
    const lat = (Math.asin(yv) * 180) / Math.PI
    const lon = ((((th * 180) / Math.PI) % 360) + 360) % 360 - 180
    const reg = regionAt(lat, lon)
    if (reg === Region.Ocean) continue
    const v = latLonToVec(lat, lon, R)
    pos[i * 3] = v[0]
    pos[i * 3 + 1] = v[1]
    pos[i * 3 + 2] = v[2]
    region[i] = reg
    kind[i] = 0
    i++
  }
  while (i < N * 0.84) {
    const lat = (Math.asin(r() * 2 - 1) * 180) / Math.PI
    const lon = r() * 360 - 180
    if (regionAt(lat, lon) !== Region.Ocean) continue
    const v = latLonToVec(lat, lon, R * 0.995)
    pos.set(v, i * 3)
    kind[i] = 1
    i++
  }
  while (i < N * 0.94) {
    const lat = (Math.asin(r() * 2 - 1) * 180) / Math.PI
    const lon = r() * 360 - 180
    const v = latLonToVec(lat, lon, R * (1.02 + Math.pow(r(), 3) * 0.12))
    pos.set(v, i * 3)
    kind[i] = 2
    i++
  }
  while (i < N) {
    const lat = (Math.asin(r() * 2 - 1) * 180) / Math.PI
    const lon = r() * 360 - 180
    const v = latLonToVec(lat, lon, R * (1.6 + r() * 3))
    pos.set(v, i * 3)
    kind[i] = 3
    i++
  }
  globeCache = { pos, region, kind, count: i }
  return globeCache
}

function globe(mode: GlobeMode): Formation {
  const g = globeBase()
  const col = new Float32Array(N * 3)
  const flow = new Float32Array(N * 4)
  const order = new Float32Array(N)
  const r = rng(mode.length * 17)
  for (let i = 0; i < N; i++) {
    const reg = g.region[i]
    const kind = g.kind[i]
    let c: RGB
    if (kind === 1) c = sc(ID, 0.35)
    else if (kind === 2) c = sc(I, 0.18)
    else if (kind === 3) c = sc(V, 0.12)
    else if (mode === 'winners') c = reg === Region.Emerging ? sc(E, 2.2 + r() * 1.4) : sc(P, 0.8)
    else if (mode === 'losers') c = reg === Region.US ? sc(P, 1.15) : mixRgb(sc(P, 0.34), sc(ID, 0.4), 0.5)
    else c = reg === Region.US ? sc(I, 2.6) : reg === Region.China ? sc(A, 2.6) : sc(P, 0.75)
    col.set(c, i * 3)
    const y = g.pos[i * 3 + 1]
    order[i] = mode === 'winners' ? (y / GLOBE.r + 1) / 2 : r()
    if (kind === 2) {
      flow[i * 4 + 1] = 0.05
      flow[i * 4 + 3] = 0.05
    }
  }
  const view: Record<GlobeMode, { yaw: number; tilt: number }> = {
    winners: { yaw: (-38 * Math.PI) / 180, tilt: 0.14 },
    losers: { yaw: (88 * Math.PI) / 180, tilt: 0.55 },
    camps: { yaw: 0, tilt: 0.2 },
  }
  return { pos: g.pos, col, flow, order, size: 0.046, family: 'globe', ...view[mode], spin: 0 }
}

function flatMap(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const W = 19
  const H = W / 2
  const step = 1.15
  for (let lat = -58; lat <= 84; lat += step) {
    for (let lon = -180; lon <= 180; lon += step) {
      const reg = regionAt(lat, lon)
      if (reg === Region.Ocean) continue
      const x = (lon / 180) * (W / 2)
      const y = (lat / 90) * (H / 2)
      const c = reg === Region.US ? sc(I, 3.8) : reg === Region.China ? sc(A, 3.8) : reg === Region.Europe ? sc(V, 2.6) : sc(P, 1.7)
      b.push(x, y, 0, c, (lon + 180) / 360)
    }
  }
  return b.done(0.085, { tilt: -0.32 })
}

/* ---------------------------------------------------------------- heartbeat */

function ecg(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const period = 5
  const wave = (x: number) => {
    const u = (((x % period) + period) % period) / period
    const g = (c: number, w: number, a: number) => a * Math.exp(-Math.pow((u - c) / w, 2))
    return g(0.18, 0.035, 0.25) - g(0.38, 0.012, 0.35) + g(0.41, 0.012, 2.1) - g(0.44, 0.014, 0.6) + g(0.66, 0.05, 0.45)
  }
  const y0 = -2.7
  for (let k = 0; k < N * 0.4; k++) {
    const x = -20 + r() * 40
    // sample along arc length so the steep spike isn't sparse
    const y = y0 + wave(x)
    const c = mixRgb(sc(A, 1.6), sc(E, 2.4), smoothstep(-6, 6, x))
    b.push(x, y + gauss(r) * 0.02, gauss(r) * 0.05, c, (x + 20) / 40, [-period, 0, 0, -0.06])
  }
  for (let k = 0; k < N * 0.12; k++) {
    const u = r()
    const x = -20 + r() * 40
    const yA = y0 + wave(x)
    const yB = y0 + wave(x + 0.02 * period)
    b.push(x, yA + (yB - yA) * u, 0, sc(E, 2.0), (x + 20) / 40, [-period, 0, 0, -0.06])
  }
  for (let k = 0; k < N * 0.12; k++) {
    b.push((r() - 0.5) * 26, -3 + r() * 8, -3 - r() * 8, sc(E, 0.4 + r() * 0.6), r(), [0, 1.2, 0, 0.03])
  }
  return b.done(0.034)
}

/* ---------------------------------------------------------------- embers */

function embers(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  const cx = 3.4
  const base = -0.8
  // warm sparks rising behind the speaker (who occludes their base), drifting right as they climb
  for (let k = 0; k < N * 0.024; k++) {
    const h = 0.6 + Math.pow(r(), 1.4) * 5.6
    const spread = 0.1 + h * 0.26
    const c = mixRgb(sc(E, 2.3), sc(ED, 1.1), smoothstep(1.2, 5.5, h))
    b.push(cx + 0.75 + h * 0.22 + gauss(r) * spread, base + h, -3.7 + gauss(r) * spread * 0.4, c, h / 6.5, [0.25 + gauss(r) * 0.2, 1.3, 0, 0.12 + r() * 0.14])
  }
  for (let k = 0; k < N * 0.05; k++) {
    const th = Math.PI + r() * Math.PI
    const rad = 1.6 + Math.pow(r(), 0.5) * 5.4
    b.push(cx + Math.cos(th) * rad, -1.2, 0.4 + Math.sin(th) * rad * 0.7, sc(E, 2.0 * (1 - rad / 7) + 0.12), rad / 7)
  }
  return b.done(0.036)
}

/* ---------------------------------------------------------------- vortex */

function vortex(seed: number): Formation {
  const b = new Builder(N, seed)
  const r = b.r
  for (let k = 0; k < N * 0.7; k++) {
    const y = -3.6 + r() * 7.4
    const t = (y + 3.6) / 7.4
    const rad = 2.5 + t * t * 2.2 + Math.abs(gauss(r)) * 0.3
    const th = r() * Math.PI * 2
    // keep the funnel thin where it passes in front of the calendar
    if (rad < 3.3 && y < 2.2 && r() < 0.5) continue
    const c = r() < 0.5 ? mixRgb(sc(I, 1.8), sc(WHITE, 2), r() * 0.3) : sc(E, 1.6)
    b.push(Math.cos(th) * rad, y, Math.sin(th) * rad, c, t, [0, 1.1, 0, 0.2 + r() * 0.15])
  }
  return b.done(0.034, { spin: 0.9 })
}

/* ---------------------------------------------------------------- registry */

/** Scale a formation's colors (brightness) without touching positions. */
function gain(f: Formation, k: number): Formation {
  if (k === 1) return f
  const col = new Float32Array(f.col.length)
  for (let i = 0; i < col.length; i++) col[i] = f.col[i] * k
  return { ...f, col }
}

export const formations = {
  eclipse: () => gain(corona(11, false), 0.45),
  dawn: () => gain(corona(12, true), 0.5),
  split: () => split(21),
  timeline: () => timeline(31),
  projects: () => gain(projects(41), 0.85),
  engines: () => gain(engines(51), 0.32),
  ladder: () => gain(ladder(61), 0.75),
  gauge: () => gain(gauge(71), 0.75),
  funnel: () => gain(funnel(81), 0.8),
  strata: () => strata(91),
  gdp: () => gain(gdp(101), 0.8),
  debt: () => gain(debt(111), 0.9),
  planA: () => gain(planA(121), 0.36),
  grid90s: () => grid90s(131),
  globeWinners: () => gain(globe('winners'), 0.8),
  globeLosers: () => gain(globe('losers'), 0.8),
  flatMap: () => gain(flatMap(141), 0.75),
  ecg: () => gain(ecg(151), 0.8),
  embers: () => gain(embers(161), 0.3),
  vortex: () => gain(vortex(171), 0.34),
} satisfies Record<string, () => Formation>

export type FormationKey = keyof typeof formations

const cache = new Map<FormationKey, Formation>()
export function getFormation(key: FormationKey): Formation {
  let f = cache.get(key)
  if (!f) {
    f = formations[key]()
    cache.set(key, f)
  }
  return f
}
