/**
 * Cinematic camera: flies between slide stations along a cubic Bézier, banks into turns,
 * breathes when idle, and adds a little pointer parallax (off in capture mode).
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { deck } from './store'
import { cameraOf, flightSeconds } from './slides'
import { fx } from '../stage/fx'

export const FLIGHT_SECONDS = 2.3

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t
  return out
    .copy(p0)
    .multiplyScalar(u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t)
}

export function CameraRig({ capture }: { capture: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const pointer = useRef(new THREE.Vector2())
  const v = useMemo(
    () => ({
      p0: new THREE.Vector3(),
      p1: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      p3: new THREE.Vector3(),
      l0: new THREE.Vector3(),
      l1: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      lookNow: new THREE.Vector3(),
      par: new THREE.Vector2(),
      fov0: 38,
      fov1: 38,
      dur: FLIGHT_SECONDS,
      bank: 0,
      start: 0,
      index: -1,
    }),
    [],
  )

  useEffect(() => {
    if (capture) return
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [capture])

  useFrame((state, dt) => {
    const d = deck.get()
    const now = performance.now() / 1000
    if (d.index !== v.index) {
      const target = cameraOf(d.index)
      if (d.instant || v.index < 0) {
        v.p0.copy(target.pos)
        v.p3.copy(target.pos)
        v.p1.copy(target.pos)
        v.p2.copy(target.pos)
        v.l0.copy(target.look)
        v.l1.copy(target.look)
        v.lookNow.copy(target.look)
        v.fov0 = v.fov1 = target.fov
        v.start = now - FLIGHT_SECONDS
      } else {
        v.p0.copy(camera.position).sub(new THREE.Vector3(v.par.x, v.par.y, 0))
        v.l0.copy(v.lookNow)
        v.p3.copy(target.pos)
        v.l1.copy(target.look)
        const dist = v.p0.distanceTo(v.p3)
        const dir0 = new THREE.Vector3().subVectors(v.l0, v.p0).normalize()
        const dir1 = new THREE.Vector3().subVectors(v.l1, v.p3).normalize()
        // Pull back and rise a little at the start, approach along the final view direction.
        v.p1.copy(v.p0).addScaledVector(dir0, -dist * 0.06).add(new THREE.Vector3(0, dist * 0.06, 0))
        v.p2.copy(v.p3).addScaledVector(dir1, -dist * 0.42)
        v.fov0 = camera.fov
        v.fov1 = target.fov
        v.bank = THREE.MathUtils.clamp((v.p3.x - v.p0.x) * 0.004, -0.18, 0.18)
        v.start = now
        v.dur = flightSeconds(v.index, d.index)
        fx.warp = 1
      }
      v.index = d.index
      fx.slide = d.index
    }

    const raw = Math.min(1, (now - v.start) / v.dur)
    const t = ease(raw)
    bezier(v.p0, v.p1, v.p2, v.p3, t, v.pos)
    v.look.lerpVectors(v.l0, v.l1, ease(Math.min(1, raw * 1.15)))
    v.lookNow.copy(v.look)

    // idle breathing + parallax
    const time = state.clock.elapsedTime
    const breathe = capture ? 0 : 1
    v.par.lerp(capture ? new THREE.Vector2() : pointer.current.clone().multiplyScalar(0.35), 1 - Math.exp(-dt * 2))
    camera.position.set(
      v.pos.x + v.par.x + Math.sin(time * 0.21) * 0.12 * breathe,
      v.pos.y + v.par.y + Math.sin(time * 0.17) * 0.08 * breathe,
      v.pos.z,
    )
    camera.lookAt(v.look)
    camera.rotateZ(Math.sin(Math.PI * raw) * v.bank)
    ;(window as unknown as { __cam: unknown }).__cam = { pos: camera.position.toArray().map((x) => +x.toFixed(2)), look: v.look.toArray().map((x) => +x.toFixed(2)), raw }
    const fov = v.fov0 + (v.fov1 - v.fov0) * t
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
