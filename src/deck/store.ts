/**
 * Deck navigation state. A tiny external store so both React (overlay, HUD) and the
 * render loop (camera rig, swarm) can read it without prop drilling.
 */
import { useSyncExternalStore } from 'react'

export type DeckState = {
  index: number
  prev: number
  /** performance.now() / 1000 at the moment `index` became active. */
  changedAt: number
  /** True when the last change should skip the flight (deep link, capture). */
  instant: boolean
  count: number
}

let state: DeckState = { index: 0, prev: 0, changedAt: performance.now() / 1000, instant: true, count: 1 }
const listeners = new Set<() => void>()

export const deck = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setCount(count: number) {
    state = { ...state, count }
    listeners.forEach((l) => l())
  },
  go(index: number, opts: { instant?: boolean } = {}) {
    const next = Math.max(0, Math.min(state.count - 1, index))
    if (next === state.index && !opts.instant) return
    state = {
      ...state,
      prev: state.index,
      index: next,
      changedAt: performance.now() / 1000,
      instant: !!opts.instant,
    }
    if (window.location.hash !== `#/${next}`) history.replaceState(null, '', `#/${next}${window.location.search ? '' : ''}`)
    listeners.forEach((l) => l())
  },
  next() {
    deck.go(state.index + 1)
  },
  back() {
    deck.go(state.index - 1)
  },
}

export function useDeck() {
  return useSyncExternalStore(deck.subscribe, deck.get)
}

/** Seconds since the current slide became active. Safe to call inside useFrame. */
export function slideAge() {
  return performance.now() / 1000 - state.changedAt
}
