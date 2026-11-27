/**
 * Small deterministic math + sampling helpers for particle formations.
 */
import * as THREE from 'three'

/** Mulberry32: fast seeded PRNG so formations are identical on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gauss(r: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = r()
  while (v === 0) v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const tmp = new THREE.Color()
/** Linear-space RGB triple for a hex string, scaled by `boost`. */
export function rgb(hex: string, boost = 1): [number, number, number] {
  tmp.set(hex)
  return [tmp.r * boost, tmp.g * boost, tmp.b * boost]
}

export function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/**
 * Rasterise a 2D drawing and return the coordinates of "ink" pixels, mapped to a
 * world-space rectangle centred on the origin. Used for text and silhouettes.
 */
export function inkPixels(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { w?: number; h?: number; worldW: number; threshold?: number; step?: number },
) {
  const w = opts.w ?? 1024
  const h = opts.h ?? 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  draw(ctx, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const scale = opts.worldW / w
  const pts: number[] = []
  const step = opts.step ?? 1
  const th = opts.threshold ?? 128
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const a = data[(y * w + x) * 4 + 3]
      if (a > th) pts.push((x - w / 2) * scale, -(y - h / 2) * scale)
    }
  }
  return { pts, scale }
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
