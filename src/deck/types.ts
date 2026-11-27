import type { FC } from 'react'
import type { FormationKey } from '../three/formations'

export type V3 = [number, number, number]

export type SlideDef = {
  id: string
  /** Short label for the HUD. */
  label: string
  /** Act name shown in the HUD. */
  act: string
  formation: FormationKey
  /** Camera position / look-at relative to the slide's station, plus fov. */
  camera?: { pos?: V3; look?: V3; fov?: number }
  /** Sky tint the backdrop drifts toward on this slide. */
  tint?: string
  /** Extra bloom for this slide. */
  bloom?: number
  /** HTML overlay (typography). */
  Overlay: FC<{ index: number }>
  /** 3D set piece, rendered inside a group positioned at the station. */
  Scene?: FC<{ index: number }>
  /** Speaker notes (press N). */
  notes?: string
}
