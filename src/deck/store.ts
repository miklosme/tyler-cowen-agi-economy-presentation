/**
 * Deck navigation state. A tiny external store so both React (overlay, HUD) and the
 * render loop (camera rig, swarm) can read it without prop drilling.
 */
import { useSyncExternalStore } from 'react'

export type DeckState = {
  index: number
  prev: number
  /** clock.now() at the moment `index` became active. */
  changedAt: number
  /** True when the last change should skip the flight (deep link, capture). */
  instant: boolean
  count: number
}

/** Which timeline a scene element follows. Set pieces use 'build'; 3D labels use 'label'. */
export type AgeChannel = 'build' | 'label'

/**
 * The time source every scene reads. The slide deck runs on wall-clock time; the /watch player
 * swaps in the talk's audio time and remaps each scene's age so its beats land on the words.
 */
export const clock = {
  now: () => performance.now() / 1000,
  /** Maps raw seconds since slide `index` became active to the age its scene should show. */
  age: (_index: number, raw: number, instant: boolean, _channel: AgeChannel) => (instant ? raw + 1.4 : raw),
}

let state: DeckState = { index: 0, prev: 0, changedAt: clock.now(), instant: true, count: 1 }
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
      changedAt: clock.now(),
      instant: !!opts.instant,
    }
    if (window.location.hash !== `#/${next}`) history.replaceState(null, '', `#/${next}${window.location.search ? '' : ''}`)
    listeners.forEach((l) => l())
  },
  /** Sets the whole state at once. Used by external drivers (the /watch player), not the deck. */
  sync(next: Omit<DeckState, 'count'>) {
    state = { ...state, ...next }
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
  return clock.now() - state.changedAt
}
