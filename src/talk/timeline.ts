/**
 * Broadcasts talk time to the DOM layers (text beats, captions, controls) once per frame.
 * Components subscribe through `useAt`, which only re-renders when its own answer changes.
 */
import { useSyncExternalStore } from 'react'

const subs = new Set<() => void>()
let now = 0

export const timeline = {
  get: () => now,
  emit(t: number) {
    if (t === now) return
    now = t
    subs.forEach((f) => f())
  },
  subscribe(fn: () => void) {
    subs.add(fn)
    return () => void subs.delete(fn)
  },
}

/** Re-renders only when `select(talkTime)` changes. Keep the result a primitive. */
export function useAt<T extends string | number | boolean>(select: (t: number) => T): T {
  return useSyncExternalStore(timeline.subscribe, () => select(now))
}

/** True while talk time is in [at, out). */
export function useWindow(at: number, out = Infinity) {
  return useAt((t) => t >= at && t < out)
}
