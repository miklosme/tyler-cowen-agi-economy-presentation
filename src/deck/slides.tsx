/**
 * Slide registry + world layout. Each slide lives at its own "station" in space; the camera
 * flies between stations and the swarm migrates with it.
 */
import * as THREE from 'three'
import type { SlideDef, V3 } from './types'
import { revolution, title, twoTruths } from '../slides/act1'
import { engines, projects, status } from '../slides/act2'
import { bottleneck, debt, doneBefore, number, planA, slow40, sticky } from '../slides/act3'
import { camps, close, health, losers, physical, winners, workHarder } from '../slides/act4'

export const slides: SlideDef[] = [
  title,
  twoTruths,
  revolution,
  projects,
  engines,
  status,
  number,
  bottleneck,
  sticky,
  slow40,
  doneBefore,
  debt,
  planA,
  winners,
  losers,
  health,
  physical,
  camps,
  workHarder,
  close,
]

/** Station positions weave through space so every flight has lateral parallax. */
export function stationOf(i: number): V3 {
  return [Math.sin(i * 0.8) * 26, Math.sin(i * 1.3) * 7, -i * 70]
}

export function cameraOf(i: number) {
  const s = new THREE.Vector3(...stationOf(i))
  const c = slides[i].camera ?? {}
  return {
    pos: s.clone().add(new THREE.Vector3(...(c.pos ?? [0, 0, 14.5]))),
    look: s.clone().add(new THREE.Vector3(...(c.look ?? [0, 0, 0]))),
    fov: c.fov ?? 38,
  }
}

/** Flight length between two slides: brisk inside an act, a full sweep when the act changes. */
export function flightSeconds(from: number, to: number) {
  if (from === to || !slides[from] || !slides[to]) return 2.3
  return slides[from].act === slides[to].act && Math.abs(from - to) === 1 ? 1.8 : 2.5
}
