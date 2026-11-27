/**
 * Design tokens shared by the deck, the 3D set pieces and the model harness.
 *
 * Visual language: "luminous instrument". Near-black ink space, warm ember gold as the hero
 * (growth, people, optimism), cold ice cyan for machine intelligence, alarm vermilion for debt
 * and loss. Glowing elements use colors pushed above 1.0 with toneMapped={false} so bloom
 * picks them up; everything else stays dark and quiet.
 */
import * as THREE from 'three'

export const palette = {
  ink: '#04050a',
  ink2: '#0a0c16',
  ink3: '#121626',
  paper: '#f3eee4',
  mute: '#8d8a9b',
  ember: '#ffb547',
  emberDeep: '#ff7a1a',
  ice: '#7fdcff',
  iceDeep: '#3a7bff',
  alarm: '#ff4f3a',
  violet: '#9b7dff',
  jade: '#58f0b0',
} as const

export type PaletteKey = keyof typeof palette

/** A THREE.Color pushed past 1.0 so it blooms. `boost` 1 = plain, 3-6 = strong glow. */
export function glow(hex: string, boost = 3): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(boost)
}

export const fonts = {
  display: new URL('../node_modules/@fontsource/fraunces/files/fraunces-latin-300-normal.woff', import.meta.url).href,
  displayItalic: new URL('../node_modules/@fontsource/fraunces/files/fraunces-latin-300-italic.woff', import.meta.url).href,
  displayBold: new URL('../node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff', import.meta.url).href,
  sans: new URL('../node_modules/@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff', import.meta.url).href,
  sansMedium: new URL('../node_modules/@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff', import.meta.url).href,
  mono: new URL('../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff', import.meta.url).href,
  monoMedium: new URL('../node_modules/@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff', import.meta.url).href,
}
