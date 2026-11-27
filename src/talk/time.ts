/** Talk time helpers. All times are seconds into the talk's audio track. */

/** Length of the audio track (the talk ends at 18:51; applause runs to the end). */
export const TALK_DURATION = 1143.0

/** "8:04.9" → 484.9. Numbers pass through. */
export function ts(t: string | number): number {
  if (typeof t === 'number') return t
  return t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}

/** 484.9 → "8:04". */
export function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Evaluates a piecewise-linear time warp. `points` are [talk time, scene age] pairs, implicitly
 * preceded by [start, 0] unless the first point sits at the cue start. After the last point the
 * scene runs on at natural speed, or holds when that point's time is Infinity.
 */
export function warp(points: [number, number][] | undefined, start: number, raw: number): number {
  if (!points || !points.length) return raw
  const t = start + raw
  let prevT = start
  let prevA = 0
  if (points[0][0] <= start) {
    prevT = start
    prevA = points[0][1]
  }
  for (const [pt, pa] of points) {
    if (pt <= start) {
      prevA = pa
      continue
    }
    if (t <= pt) {
      if (!Number.isFinite(pt)) return prevA
      const k = (t - prevT) / (pt - prevT)
      return prevA + (pa - prevA) * k
    }
    prevT = pt
    prevA = pa
  }
  return prevA + (t - prevT)
}
