import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { deck, useDeck } from './store'

/** Seconds since slide `index` became active, or -1 while it is not the active slide. */
export function ageOf(index: number) {
  const d = deck.get()
  if (d.index !== index) return -1
  const age = performance.now() / 1000 - d.changedAt
  // Deep links / capture jumps skip the flight; treat them as already arrived.
  return d.instant ? age + 1.4 : age
}

export function useIsActive(index: number) {
  return useDeck().index === index
}

/**
 * A 0..1 build-in value for a set piece that starts `delay` seconds after the slide becomes
 * active and runs for `duration`. Resets to 0 when the slide is left (after the camera has
 * flown away). Triggers React renders only while animating.
 */
export function useBuild(index: number, delay = 1.2, duration = 2) {
  const [p, setP] = useState(0)
  const last = useRef(0)
  useFrame(() => {
    const age = ageOf(index)
    let v: number
    if (age < 0) v = deck.get().prev === index ? last.current : 0
    else v = Math.min(1, Math.max(0, (age - delay) / duration))
    if (Math.abs(v - last.current) > 0.002 || (v === 1 && last.current !== 1) || (v === 0 && last.current !== 0)) {
      last.current = v
      setP(v)
    }
  })
  return p
}

/** Like useBuild but returns a ref, for driving uniforms without re-rendering. */
export function useBuildRef(index: number, delay = 1.2, duration = 2) {
  const ref = useRef(0)
  useFrame(() => {
    const age = ageOf(index)
    if (age < 0) {
      if (deck.get().prev !== index) ref.current = 0
      return
    }
    ref.current = Math.min(1, Math.max(0, (age - delay) / duration))
  })
  return ref
}
