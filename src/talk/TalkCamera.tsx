/**
 * The talk's camera: a pure function of talk time. Each cue opens with a flight from where the
 * previous cue's camera was, then holds its framing with a slow push (and sometimes an orbit),
 * cutting between shots on the beats in the program. Because it never integrates state, pausing
 * freezes it and seeking lands on exactly the frame a straight playthrough would show.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { deck } from '../deck/store'
import { flightSeconds, stationOf } from '../deck/slides'
import { cues, type Framing } from './program'
import { media } from './media'

type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function makePose(): Pose {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 38 }
}

const tmpAxis = new THREE.Vector3(0, 1, 0)

/** A framing, `elapsed` seconds into its slow drift, in world space. */
function framingPose(i: number, f: Framing, elapsed: number, out: Pose) {
  const s = stationOf(i)
  out.look.set(s[0] + f.look[0], s[1] + f.look[1], s[2] + f.look[2])
  out.pos.set(s[0] + f.pos[0], s[1] + f.pos[1], s[2] + f.pos[2])
  out.fov = f.fov ?? 38
  const e = Math.max(0, elapsed)
  if (f.orbit) {
    out.pos.sub(out.look).applyAxisAngle(tmpAxis, f.orbit * e).add(out.look)
  }
  if (f.push) out.pos.lerp(out.look, Math.min(0.3, f.push * e))
  return out
}

const scratch = { b: makePose() }

/** Cue i's camera at talk time t, ignoring the flight into it. */
function settledPose(i: number, t: number, out: Pose) {
  const c = cues[i]
  let k = -1
  for (let j = 0; j < c.shots.length; j++) if (c.shots[j].at <= t) k = j
  if (k < 0) return framingPose(i, c.base, t - c.start, out)
  const shot = c.shots[k]
  framingPose(i, shot, t - shot.at, out)
  const u = (t - shot.at) / shot.move
  if (u >= 1) return out
  // Move from wherever the previous framing had drifted to when this shot began.
  const prev = k === 0 ? c.base : c.shots[k - 1]
  const from = framingPose(i, prev, shot.at - (k === 0 ? c.start : c.shots[k - 1].at), scratch.b)
  const e = ease(Math.max(0, u))
  out.pos.lerpVectors(from.pos, out.pos, e)
  out.look.lerpVectors(from.look, out.look, e)
  out.fov = from.fov + (out.fov - from.fov) * e
  return out
}

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t
  return out
    .copy(p0)
    .multiplyScalar(u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t)
}

export function TalkCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const v = useMemo(
    () => ({ from: makePose(), to: makePose(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), pos: new THREE.Vector3(), look: new THREE.Vector3(), dir: new THREE.Vector3() }),
    [],
  )
  useFrame(() => {
    const d = deck.get()
    const i = d.index
    const t = media.t
    const c = cues[i]
    const to = settledPose(i, t, v.to)
    let fov = to.fov
    let bank = 0
    v.pos.copy(to.pos)
    v.look.copy(to.look)
    const dur = i > 0 ? flightSeconds(i - 1, i) : 0
    const raw = dur > 0 ? (t - c.start) / dur : 1
    if (!d.instant && i > 0 && raw < 1) {
      // Fly in from where the previous cue's camera was when this cue began (as CameraRig does).
      const r = Math.max(0, raw)
      const from = settledPose(i - 1, c.start, v.from)
      const dist = from.pos.distanceTo(to.pos)
      v.dir.subVectors(from.look, from.pos).normalize()
      v.p1.copy(from.pos).addScaledVector(v.dir, -dist * 0.06)
      v.p1.y += dist * 0.06
      v.dir.subVectors(to.look, to.pos).normalize()
      v.p2.copy(to.pos).addScaledVector(v.dir, -dist * 0.42)
      bezier(from.pos, v.p1, v.p2, to.pos, ease(r), v.pos)
      v.look.lerpVectors(from.look, to.look, ease(Math.min(1, r * 1.15)))
      fov = from.fov + (to.fov - from.fov) * ease(r)
      bank = THREE.MathUtils.clamp((to.pos.x - from.pos.x) * 0.004, -0.18, 0.18) * Math.sin(Math.PI * r)
    }
    // A hand-held breath, also a function of talk time so a paused frame stays put.
    camera.position.set(v.pos.x + Math.sin(t * 0.21) * 0.12, v.pos.y + Math.sin(t * 0.17) * 0.08, v.pos.z)
    camera.lookAt(v.look)
    if (bank) camera.rotateZ(bank)
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
