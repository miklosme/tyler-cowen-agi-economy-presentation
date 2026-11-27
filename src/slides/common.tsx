/** Small 3D helpers shared by several slides. */
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { glow, palette } from '../theme'
import { ageOf } from '../deck/hooks'

/**
 * Fixed DOM layer that hosts every 3D-anchored HTML label. Passing it as drei <Html portal>
 * keeps the label's target stable, which avoids drei recreating its React root (and the
 * React 19 "removeChild" race that follows) when R3F connects its event source.
 */
export const labelLayer: { current: HTMLDivElement } = { current: null as unknown as HTMLDivElement }

export function SceneHtml(props: React.ComponentProps<typeof Html>) {
  return <Html portal={labelLayer} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }} {...props} />
}

/**
 * A pure-black disc that occludes stars behind the eclipse, with a razor rim of light.
 * Fades out as soon as its slide is left, so it doesn't blot out half the flight.
 */
export function EclipseDisc({ index, radius = 3.7, rim = palette.ember, boost = 5 }: { index: number; radius?: number; rim?: string; boost?: number }) {
  const disc = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const o = useRef(1)
  useFrame((_, dt) => {
    const target = ageOf(index) >= 0 ? 1 : 0
    o.current += (target - o.current) * (1 - Math.exp(-dt * (target ? 3 : 7)))
    // The disc stays opaque (it must occlude the swarm behind it) and collapses instead of fading.
    if (disc.current) {
      disc.current.scale.setScalar(Math.max(1e-3, o.current))
      disc.current.visible = o.current > 0.01
    }
    if (ring.current) ring.current.opacity = 0.9 * o.current
  })
  return (
    <group>
      <mesh ref={disc} position={[0, 0, -0.05]} renderOrder={1}>
        <circleGeometry args={[radius - 0.02, 128]} />
        <meshBasicMaterial color="#000" toneMapped={false} />
      </mesh>
      <mesh renderOrder={3}>
        <ringGeometry args={[radius - 0.012, radius + 0.012, 256]} />
        <meshBasicMaterial ref={ring} color={glow(rim, boost)} toneMapped={false} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/**
 * Screen-facing HTML label anchored in 3D. Visible when slide `index` is active and
 * at least `delay` seconds old.
 */
export function Label({
  index,
  delay = 1.4,
  position,
  children,
  className = '',
  center = true,
  style,
}: {
  index: number
  delay?: number
  position: [number, number, number] | THREE.Vector3
  children: ReactNode
  className?: string
  center?: boolean
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFrame(() => {
    const el = ref.current
    if (!el) return
    const on = ageOf(index) >= delay
    if (on === el.classList.contains('off')) el.classList.toggle('off', !on)
  })
  return (
    <Html portal={labelLayer} position={position} center={center} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className={`tag3d off ${className}`}>
        <div style={style}>{children}</div>
      </div>
    </Html>
  )
}

/** Glowing tube along points, with an animated draw-on (0..1) driven by a ref. */
export function GlowLine({
  points,
  color,
  boost = 4,
  radius = 0.03,
  draw,
  segments = 200,
  straight = false,
}: {
  points: THREE.Vector3[]
  color: string
  boost?: number
  radius?: number
  draw: { current: number }
  segments?: number
  /** Join the points with straight segments instead of a smooth spline. */
  straight?: boolean
}) {
  const geom = useMemo(() => {
    let curve: THREE.Curve<THREE.Vector3>
    if (straight) {
      const path = new THREE.CurvePath<THREE.Vector3>()
      for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]))
      curve = path
    } else curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    return new THREE.TubeGeometry(curve, segments, radius, 8, false)
  }, [points, radius, segments, straight])
  const mesh = useRef<THREE.Mesh>(null)
  const total = geom.index ? geom.index.count : 0
  useFrame(() => {
    if (!mesh.current) return
    const n = Math.floor(total * Math.min(1, Math.max(0, draw.current)) / 6) * 6
    geom.setDrawRange(0, n)
    mesh.current.visible = n > 0
  })
  return (
    <mesh ref={mesh} geometry={geom}>
      <meshBasicMaterial color={glow(color, boost)} toneMapped={false} />
    </mesh>
  )
}
