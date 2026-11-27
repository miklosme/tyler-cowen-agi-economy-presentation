/**
 * Talk versions of three set pieces whose labels need a different order than the slides give
 * them (or less text). They reuse the deck's parts and time everything in talk time.
 */
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { deck } from '../deck/store'
import { useBuildRef } from '../deck/hooks'
import { glow, palette } from '../theme'
import { GlowLine, Label, labelLayer } from '../slides/common'
import { GDP } from '../slides/layout'
import { Arc, Beacon, HUB_CN, HUB_US, SWING, WINNER_CITIES, globeMatrix, mapXY, onGlobe } from '../slides/act4'
import { media } from './media'
import { ts } from './time'

type SceneProps = { index: number; start: number }

/** A 3D-anchored label shown between two talk times while its scene is on screen. */
function TimedLabel({
  index,
  at,
  until = Infinity,
  position,
  children,
  className = '',
  center = true,
  style,
}: {
  index: number
  at: number
  until?: number
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
    const on = deck.get().index === index && media.t >= at && media.t < until
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

/** A pulsing map pin that fades in and out with talk time. */
function Pin({ position, at, until = Infinity, color, index }: { position: THREE.Vector3; at: number; until?: number; color: string; index: number }) {
  const ring = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const o = useRef(0)
  useFrame(({ clock }, dt) => {
    const target = deck.get().index === index && media.t >= at && media.t < until ? 1 : 0
    o.current += (target - o.current) * (1 - Math.exp(-dt * 5))
    const t = (clock.elapsedTime * 0.7) % 1
    if (ring.current) {
      ring.current.scale.setScalar((0.25 + t * 1.8) * o.current)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * o.current
    }
    if (core.current) core.current.scale.setScalar(Math.max(1e-3, o.current))
  })
  return (
    <group position={position}>
      <mesh ref={ring}>
        <ringGeometry args={[0.16, 0.2, 48]} />
        <meshBasicMaterial color={glow(color, 5)} toneMapped={false} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={core}>
        <circleGeometry args={[0.075, 24]} />
        <meshBasicMaterial color={glow(color, 8)} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ the slow 40% */

/**
 * The GDP block: the slow sectors get named as he lists them ("government, higher education,
 * parts of health care, nonprofits"), then the 40% bracket closes on "at least 40% of GDP".
 */
export function SlowSectorsScene({ index, start }: SceneProps) {
  const d = (t: string) => ts(t) - start
  const draw = useBuildRef(index, d('15:56.6'), 1.4)
  const xf = GDP.x0 + (GDP.x1 - GDP.x0) * GDP.frozen
  const bracket = useMemo(
    () => [
      new THREE.Vector3(GDP.x0, GDP.y1 + 0.1, 0.3),
      new THREE.Vector3(GDP.x0, GDP.y1 + 0.28, 0.3),
      new THREE.Vector3(xf, GDP.y1 + 0.28, 0.3),
      new THREE.Vector3(xf, GDP.y1 + 0.1, 0.3),
    ],
    [xf],
  )
  const sectors: [string, string][] = [
    ['Government', '15:46.0'],
    ['Higher education', '15:47.6'],
    ['Parts of healthcare', '15:49.7'],
    ['Nonprofits', '15:51.4'],
  ]
  return (
    <group>
      <GlowLine points={bracket} color={palette.paper} boost={2.5} radius={0.015} draw={draw} segments={90} straight />
      <Label index={index} delay={d('15:57.4')} position={[(GDP.x0 + xf) / 2, GDP.y1 - 0.95, 0.8]}>
        <span className="stat" style={{ fontSize: 'calc(var(--u) * 5)', color: 'var(--paper)', letterSpacing: '-0.03em', textTransform: 'none' }}>
          40%<span style={{ color: 'var(--paper-dim)' }}>+</span>
        </span>
      </Label>
      <Label index={index} delay={d('15:58.2')} position={[(GDP.x0 + xf) / 2, GDP.y1 + 0.75, 0.3]}>
        <span style={{ color: 'var(--paper)' }}>Slow to adjust</span>
      </Label>
      {sectors.map(([s, t], i) => (
        <Label key={s} index={index} delay={d(t)} center={false} position={[GDP.x0 + 0.35, 0.75 - i * 0.75, 0.6]} style={{ background: 'rgba(4,5,10,0.94)', transform: 'translateY(-50%)' }}>
          <span style={{ color: 'var(--paper)' }}>{s}</span>
        </Label>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ who wins */

/** The globe of gainers: poorer countries light up on "especially in poorer countries". */
export function WinnersTalkScene({ index, start }: SceneProps) {
  const m = useMemo(() => globeMatrix(-38, 0.14), [])
  const d = (t: string) => ts(t) - start
  const ghana = useMemo(() => onGlobe(5.6, -0.2, m, 1.02), [m])
  const joburg = useMemo(() => onGlobe(-26.2, 28.0, m, 1.02), [m])
  return (
    <group>
      {WINNER_CITIES.map(([name, lat, lon], i) => {
        const p = onGlobe(lat, lon, m, 1.01)
        return <Beacon key={name} position={p} normal={p} delay={d('13:06.0') + i * 0.22} index={index} />
      })}
      <Label index={index} delay={d('13:19.6')} position={ghana.clone().add(new THREE.Vector3(-0.3, 0.05, 0))} center={false} style={{ transform: 'translate(-100%, -50%)' }}>
        Ghana
      </Label>
      <Label index={index} delay={d('13:20.6')} position={joburg.clone().add(new THREE.Vector3(-0.3, 0, 0))} center={false} style={{ transform: 'translate(-100%, -50%)' }}>
        South Africa
      </Label>
    </group>
  )
}

/* ------------------------------------------------------------------ two camps */

/** Europe's pin, pulsing between US ice and China red: it has to choose. */
function ChoosingPin({ position, at, index }: { position: THREE.Vector3; at: number; index: number }) {
  const core = useRef<THREE.MeshBasicMaterial>(null)
  const coreMesh = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const a = useMemo(() => glow(palette.ice, 6), [])
  const b = useMemo(() => glow(palette.alarm, 6), [])
  useFrame(({ clock }) => {
    const on = deck.get().index === index && media.t >= at ? 1 : 0
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.6)
    if (core.current) core.current.color.copy(a).lerp(b, k)
    if (coreMesh.current) coreMesh.current.scale.setScalar(Math.max(1e-3, 0.09 * on))
    if (ring.current) {
      const t = (clock.elapsedTime * 0.8) % 1
      ring.current.scale.setScalar(Math.max(1e-3, (0.3 + t * 1.6) * on))
      ;(ring.current.material as THREE.MeshBasicMaterial).color.copy(a).lerp(b, k)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - t
    }
  })
  return (
    <group position={position}>
      <mesh ref={coreMesh}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial ref={core} toneMapped={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.16, 0.2, 48]} />
        <meshBasicMaterial toneMapped={false} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * The flat map. It opens on Stockholm ("it shows Sweden … go to Stockholm"), then Europe, the
 * US and China light up as he names them, and the dependency arcs appear on "two camps".
 */
export function CampsTalkScene({ index, start }: SceneProps) {
  const d = (t: string) => ts(t) - start
  const us = mapXY(...HUB_US)
  const cn = mapXY(...HUB_CN)
  const sthlm = useMemo(() => mapXY(59.3, 18.1).clone().setZ(0.03), [])
  const europe = useMemo(() => mapXY(50.8, 4.4).clone().setZ(0.02), [])
  return (
    <group rotation-x={-0.32}>
      <Pin position={sthlm} at={ts('17:35.4')} until={ts('17:52.0')} color={palette.ice} index={index} />
      <TimedLabel index={index} at={ts('17:35.8')} until={ts('17:52.0')} position={sthlm.clone().add(new THREE.Vector3(0.3, 0, 0.1))} center={false} style={{ transform: 'translateY(-50%)' }}>
        Stockholm
      </TimedLabel>
      {SWING.map(([lat, lon], i) => {
        const p = mapXY(lat, lon)
        return (
          <group key={i}>
            <Arc from={p} to={us} color={palette.ice} phase={i * 0.137} index={index} delay={d('18:10.4') + i * 0.12} />
            <Arc from={p} to={cn} color={palette.alarm} phase={i * 0.137 + 0.5} index={index} delay={d('18:10.4') + i * 0.12} />
          </group>
        )
      })}
      <ChoosingPin position={europe} at={ts('18:01.0')} index={index} />
      <Label index={index} delay={d('18:01.4')} position={europe.clone().add(new THREE.Vector3(0, 0.55, 0.3))}>
        Europe
      </Label>
      <Beacon position={us.clone().setZ(0.02)} normal={new THREE.Vector3(0, 0, 1)} delay={d('18:04.6')} index={index} color={palette.ice} />
      <Beacon position={cn.clone().setZ(0.02)} normal={new THREE.Vector3(0, 0, 1)} delay={d('18:05.3')} index={index} color={palette.alarm} />
      <Label index={index} delay={d('18:04.8')} position={us.clone().add(new THREE.Vector3(-1.1, 0.55, 0.2))}>
        <span style={{ color: 'var(--paper)', textShadow: '0 0 12px var(--ice), 0 0 4px #000' }}>United States</span>
      </Label>
      <Label index={index} delay={d('18:05.5')} position={cn.clone().add(new THREE.Vector3(0.6, 0.7, 0.2))}>
        <span style={{ color: 'var(--paper)', textShadow: '0 0 12px var(--alarm), 0 0 4px #000' }}>China</span>
      </Label>
    </group>
  )
}
