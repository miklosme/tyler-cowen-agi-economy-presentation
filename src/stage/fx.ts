import * as THREE from 'three'

/**
 * Mutable, frame-loop-friendly signals shared between the deck and the render pipeline.
 * Written by the deck on slide changes, read every frame by post-processing and the backdrop.
 * Deliberately not React state: these change every frame and must not trigger re-renders.
 */
export const fx = {
  /** 0..1 transition energy. Spikes on slide change, decays. Drives aberration + streaks. */
  warp: 0,
  /** Backdrop tint the sky drifts toward. */
  tint: new THREE.Color('#1a1f3a'),
  /** Current sky tint (damped). */
  tintNow: new THREE.Color('#1a1f3a'),
  /** Extra bloom intensity requested by a slide (added on top of the base). */
  bloomBoost: 0,
  /** Seconds since the current slide became active (updated by the deck clock). */
  slideTime: 0,
  /** Index of the active slide. */
  slide: 0,
}
