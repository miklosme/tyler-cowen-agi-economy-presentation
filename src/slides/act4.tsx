import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Eyebrow, R, SlidePhase, Words } from '../deck/Text'
import { ageOf, useBuild, useBuildRef } from '../deck/hooks'
import { deck } from '../deck/store'
import { ModelSlot } from '../deck/ModelSlot'
import type { SlideDef } from '../deck/types'
import { glow, palette } from '../theme'
import { EclipseDisc, GlowLine, Label } from './common'
import { GLOBE } from './layout'
import { latLonToVec } from '../lib/geo'

/* ------------------------------------------------------------------ globe helpers */

function globeMatrix(yawDeg: number, tilt: number) {
  const m = new THREE.Matrix4().makeRotationX(tilt)
  m.multiply(new THREE.Matrix4().makeRotationY((yawDeg * Math.PI) / 180))
  return m
}

function onGlobe(lat: number, lon: number, m: THREE.Matrix4, lift = 1.0) {
  return new THREE.Vector3(...latLonToVec(lat, lon, GLOBE.r * lift)).applyMatrix4(m)
}

function Beacon({ position, normal, delay, index, color = palette.ember }: { position: THREE.Vector3; normal: THREE.Vector3; delay: number; index: number; color?: string }) {
  const ring = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()), [normal])
  useFrame(({ clock }) => {
    const age = ageOf(index)
    const on = age > delay ? Math.min(1, (age - delay) / 0.6) : 0
    const t = (clock.elapsedTime * 0.7 + delay) % 1
    if (ring.current) {
      ring.current.scale.setScalar(0.2 + t * 1.6)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * on
    }
    if (core.current) core.current.scale.setScalar(on)
  })
  return (
    <group position={position} quaternion={q}>
      <mesh ref={ring}>
        <ringGeometry args={[0.16, 0.2, 48]} />
        <meshBasicMaterial color={glow(color, 5)} toneMapped={false} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={core}>
        <circleGeometry args={[0.06, 24]} />
        <meshBasicMaterial color={glow(color, 8)} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ 13 winners */

const WINNER_CITIES: [string, number, number][] = [
  ['Accra', 5.6, -0.2],
  ['Kinshasa', -4.3, 15.3],
  ['Nairobi', -1.3, 36.8],
  ['Addis Ababa', 9.0, 38.7],
  ['Johannesburg', -26.2, 28.0],
  ['Karachi', 24.9, 67.0],
  ['Mumbai', 19.1, 72.9],
  ['Dhaka', 23.8, 90.4],
]

function GhanaLeader({ m, index }: { m: THREE.Matrix4; index: number }) {
  const pts = useMemo(() => {
    const a = onGlobe(5.6, -0.2, m, 1.015)
    return [a, a.clone().add(new THREE.Vector3(-2.02, -2.08, 0.1))]
  }, [m])
  const draw = useBuildRef(index, 3.1, 0.5)
  return <GlowLine points={pts} color={palette.ember} boost={3} radius={0.008} draw={draw} segments={8} straight />
}

function WinnersScene({ index }: { index: number }) {
  const m = useMemo(() => globeMatrix(-38, 0.14), [])
  return (
    <group>
      {WINNER_CITIES.map(([name, lat, lon], i) => {
        const p = onGlobe(lat, lon, m, 1.01)
        return <Beacon key={name} position={p} normal={p} delay={1.8 + i * 0.18} index={index} />
      })}
      <GhanaLeader m={m} index={index} />
      <Label index={index} delay={3.4} position={onGlobe(5.6, -0.2, m, 1.02).add(new THREE.Vector3(-0.2, 0.1, 0))} center={false} className="bare" style={{ transform: 'translate(-170%, 168%)' }}>
        <span className="card" style={{ display: 'block', textTransform: 'none', letterSpacing: '0.02em', fontFamily: 'var(--sans)', fontSize: 'calc(var(--u) * 0.95)', padding: 'calc(var(--u) * 0.8) calc(var(--u) * 1)' }}>
          <span className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.18em', display: 'block', marginBottom: '0.5em' }}>
            Rural Ghana, 2026
          </span>
          “Do you have ChatGPT?”
          <br />
          <span className="em">“What’s ChatGPT?”</span>
          <br />
          <span style={{ color: 'var(--paper-dim)', fontSize: '0.9em' }}>Then someone showed them.</span>
        </span>
      </Label>
    </group>
  )
}

export const winners: SlideDef = {
  id: 'winners',
  label: 'Who wins',
  act: 'IV · Winners & losers',
  formation: 'globeWinners',
  camera: { pos: [-3.7, 0.3, 15.8], look: [-3.7, 0, 0] },
  tint: '#2a2312',
  Scene: WinnersScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 36)' }}>
      <Eyebrow n="13">Who wins</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="The biggest winners *aren’t in this room.*" d={0.15} step={0.06} />
      </h1>
      <div style={{ marginTop: 'calc(var(--u) * 2.4)', display: 'grid', gap: 'calc(var(--u) * 1.4)' }}>
        <R d={2.0} className="h3 em" style={{ order: 9, marginTop: 'calc(var(--u) * 0.6)' }}>
          What they share: initiative. The gains go to whoever moves first.
        </R>
        {[
          ['The global poor', 'Access to scarce expertise: free diagnostic, legal, business and consulting advice. Available now; the gains come as it spreads.'],
          ['Immigrants & outsiders', 'No elite schooling needed: just creative ideas for using AI.'],
        ].map(([t, b], i) => (
          <R key={t} d={1.2 + i * 0.35} style={{ display: 'grid', gridTemplateColumns: 'calc(var(--u) * 2.2) 1fr', alignItems: 'baseline' }}>
            <span className="mono em" style={{ fontSize: 'calc(var(--u) * 0.8)' }}>
              0{i + 1}
            </span>
            <span>
              <span className="h3">{t}</span>
              <span className="body" style={{ display: 'block', marginTop: 'calc(var(--u) * 0.3)', fontSize: 'calc(var(--u) * 1.0)' }}>
                {b}
              </span>
            </span>
          </R>
        ))}
      </div>
    </div>
  ),
  notes:
    'The biggest gainers: people who are quite poor, especially in poorer countries. They already have access to free diagnostic, legal, business and consulting advice; it has not spread yet. Rural Ghana: "What is ChatGPT?" Immigrants and initiative-takers too.',
}

/* ------------------------------------------------------------------ 14 losers */

function LosersScene({ index }: { index: number }) {
  const m = useMemo(() => globeMatrix(88, 0.55), [])
  const nyc = useMemo(() => onGlobe(40.7, -74.0, m, 1.01), [m])
  const hou = useMemo(() => onGlobe(29.8, -95.4, m, 1.01), [m])
  const arc = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const lat = 40.7 + (29.8 - 40.7) * t
      const lon = -74.0 + (-95.4 + 74.0) * t
      pts.push(onGlobe(lat, lon, m, 1.01 + Math.sin(Math.PI * t) * 0.26))
    }
    return pts
  }, [m])
  const draw = useBuildRef(index, 2.0, 1.8)
  const spark = useRef<THREE.Mesh>(null)
  const curve = useMemo(() => new THREE.CatmullRomCurve3(arc), [arc])
  useFrame(({ clock }) => {
    if (!spark.current) return
    const t = (clock.elapsedTime * 0.45) % 1
    spark.current.position.copy(curve.getPointAt(t))
    spark.current.visible = draw.current >= 1
    spark.current.scale.setScalar(0.4 + 0.35 * Math.sin(Math.PI * t))
  })
  return (
    <group>
      <GlowLine points={arc} color={palette.alarm} boost={5.5} radius={0.045} draw={draw} segments={120} />
      <mesh ref={spark}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color={glow('#ffd0c0', 7)} toneMapped={false} />
      </mesh>
      <Beacon position={nyc} normal={nyc} delay={1.5} index={index} color={palette.paper} />
      <Beacon position={hou} normal={hou} delay={3.6} index={index} color={palette.alarm} />
      <Label index={index} delay={1.7} position={nyc.clone().add(new THREE.Vector3(0, 0.35, 0.2))} center={false} style={{ transform: 'translate(-50%, -100%)', textAlign: 'center' }}>
        <b style={{ color: 'var(--paper)' }}>Manhattan</b>
      </Label>
      <Label index={index} delay={3.8} position={hou.clone().add(new THREE.Vector3(-0.25, -0.1, 0))} center={false} style={{ transform: 'translateX(-100%)', textAlign: 'right' }}>
        <b>Houston</b>
      </Label>
    </group>
  )
}

export const losers: SlideDef = {
  id: 'losers',
  label: 'Who loses',
  act: 'IV · Winners & losers',
  formation: 'globeLosers',
  camera: { pos: [-3.3, 0.6, 15.4], look: [-3.3, 0.55, 0] },
  tint: '#1d2233',
  Scene: LosersScene,
  Overlay: () => (
    <>
      <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 34)' }}>
        <Eyebrow n="14">Who loses</Eyebrow>
        <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
          <Words text="The Masters of the *Universe.*" d={0.15} step={0.07} />
        </h1>
        <R d={0.9} className="lede" style={{ marginTop: 'calc(var(--u) * 1.4)' }}>
          They played the game by the rules. Now they get sent to Houston.
        </R>
      </div>
      <R d={1.6} className="card" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'calc(var(--u) * 22.5)', width: 'calc(var(--u) * 30)' }}>
        <div className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}>An illustrative fall</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 'calc(var(--u) * 0.4)', marginTop: 'calc(var(--u) * 0.9)', alignItems: 'baseline' }}>
          <span className="body" style={{ color: 'var(--paper)' }}>Partner · Manhattan</span>
          <span className="mono" style={{ fontSize: 'calc(var(--u) * 1.5)' }}>$2,000,000</span>
          <span className="body" style={{ color: 'var(--paper)' }}>Energy executive · Houston</span>
          <span className="mono alarm" style={{ fontSize: 'calc(var(--u) * 1.5)', textAlign: 'right' }}>
            <span style={{ fontSize: '0.62em', marginRight: '0.8em', opacity: 0.9 }}>−83%</span>$350,000
          </span>
        </div>
      </R>
      <div style={{ position: 'absolute', left: 'var(--pad-x)', top: 'calc(var(--u) * 35.5)', width: 'calc(var(--u) * 30)' }}>
        <R d={4.0} className="body" style={{ color: 'var(--paper)' }}>
          Not a humanitarian tragedy. <span style={{ color: 'var(--paper)' }}>Houston has better taquerias.</span>
        </R>
        <R d={5.0} className="h3" style={{ marginTop: 'calc(var(--u) * 0.8)', color: 'var(--alarm)' }}>
          Lost status can turn into political resistance.        </R>
      </div>
    </>
  ),
  notes:
    'The biggest losers are the Masters of the Universe who become partners, live in Manhattan, earn $2M a year and played by the rules. They will be sent to Houston as a $350k energy executive. Not a humanitarian tragedy, but I worry about the politics.',
}

/* ------------------------------------------------------------------ 15 live long enough */

function AgeCounter({ d }: { d: number }) {
  const ages = [84, 94, 99]
  const exiting = useContext(SlidePhase) === 'exit'
  const [i, setI] = useState(exiting ? ages.length - 1 : -1)
  useEffect(() => {
    if (exiting) return
    const base = parseFloat(getComputedStyle(document.querySelector('.slide[data-state="enter"]') ?? document.body).getPropertyValue('--base')) || 0
    const timers = ages.map((_, k) => setTimeout(() => setI(k), (d + base + k * 1.1) * 1000))
    return () => timers.forEach(clearTimeout)
  }, [d, exiting])
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'calc(var(--u) * 1.4)' }}>
      {ages.map((a, k) => (
        <span
          key={a}
          className="stat"
          style={{
            fontSize: `calc(var(--u) * ${k === ages.length - 1 ? 6.6 : 4.2})`,
            opacity: i >= k ? (k === i ? 1 : 0.82) : 0,
            color: k === ages.length - 1 && i === k ? 'var(--ember)' : 'var(--paper)',
            transform: i >= k ? 'none' : 'translateY(calc(var(--u) * 1))',
            filter: i >= k ? 'none' : 'blur(8px)',
            transition: 'all 0.9s var(--ease-out)',
          }}
        >
          {k > 0 && <span style={{ fontSize: 'calc(var(--u) * 2.2)', color: 'var(--paper-dim)', marginRight: '0.3em', verticalAlign: 'calc(var(--u) * 0.8)' }}>→</span>}
          {a}
        </span>
      ))}
    </div>
  )
}

function HealthScene({ index }: { index: number }) {
  const b = useBuild(index, 0.8, 2.2)
  return (
    <group>
      <ModelSlot name="DnaHelix" progress={b} position={[4.9, 0.35, 0]} scale={2.15} />
      <Label index={index} delay={1.4} position={[-7.4, -3.25, 0]} center={false}>
        <span className="alarm" style={{ color: '#ffb0a3' }}>Today</span>
      </Label>
      <Label index={index} delay={1.6} position={[7.4, -3.25, 0]} center={false} style={{ transform: 'translateX(-100%)' }}>
        <span className="em">+30 to 40 years</span>
      </Label>
      {['Heart disease', 'Cancer', 'Alzheimer’s', 'Stroke'].map((k, i) => (
        <Label key={k} index={index} delay={1.6 + i * 0.25} center={false} position={[(i % 2 ? 2.05 : -0.74), -0.15 - Math.floor(i / 2) * 0.7, 0]} style={{ transform: 'translateY(-50%)' }}>
          <span className="strike3d" style={{ color: '#fff6f2', fontSize: '1.4em', '--sd': 1.2 + i * 0.35 } as React.CSSProperties}>
            {k}
          </span>
        </Label>
      ))}
    </group>
  )
}

export const health: SlideDef = {
  id: 'health',
  label: 'Live long enough',
  act: 'V · Living in it',
  formation: 'ecg',
  tint: '#2e1a1a',
  Scene: HealthScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 46)' }}>
      <Eyebrow n="15">How AI gets sold</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="Over the next 30–40 years, we *may fix most of what kills you.*" d={0.15} step={0.05} />
      </h1>
      <R d={1.2} className="caption" style={{ marginTop: 'calc(var(--u) * 2.2)', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 'calc(var(--u) * 1.0)', color: 'var(--paper)' }}>
        One possible lifespan: each decade may buy the next
      </R>
      <div style={{ marginTop: 'calc(var(--u) * 0.4)' }}>
        <AgeCounter d={1.3} />
      </div>
      <R d={4.3} className="quote" style={{ marginTop: 'calc(var(--u) * 1.6)', fontSize: 'calc(var(--u) * 1.9)' }}>
        Buckle your seatbelt. Skip the bungee jumping.
      </R>
      <R d={4.9} className="lede" style={{ marginTop: 'calc(var(--u) * 1.4)', maxWidth: 'calc(var(--u) * 40)', color: 'var(--paper)' }}>
        That’s how AI gets sold to a skeptical public: <span className="em">much longer, healthier lives.</span>
      </R>
    </div>
  ),
  notes:
    'Over the next 30 to 40 years, most of the things that kill you, we will fix. Buckle your seatbelt, do not go bungee jumping. Can I hang on to 84? 94? 99? That is how AI will be sold to the public: help against China, and we live much longer.',
}

/* ------------------------------------------------------------------ 16 back to the physical */

function PhysicalScene({ index }: { index: number }) {
  const b = useBuild(index, 0.9, 2.4)
  return (
    <group>
      <ModelSlot name="HumanGathering" progress={b} position={[3.4, -1.15, 0.4]} scale={3.35} />
      <pointLight position={[3.4, -0.2, 1.0]} color="#ff9a3c" intensity={18 * b} distance={8.5} decay={1.6} />
    </group>
  )
}

export const physical: SlideDef = {
  id: 'physical',
  label: 'Back to the physical',
  act: 'V · Living in it',
  formation: 'embers',
  camera: { pos: [0, 3.6, 13.8], look: [0, -0.2, 0] },
  tint: '#33200f',
  Scene: PhysicalScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 38)' }}>
      <Eyebrow n="16">What gets more valuable</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="Being human gets *more valuable.*" d={0.15} step={0.07} />
      </h1>
      <R d={1.0} className="lede" style={{ marginTop: 'calc(var(--u) * 2.0)', color: 'var(--paper)' }}>
        Time saved on writing flows into <span className="em">mentoring, talks, travel and people</span>. Charisma and presence matter more.
      </R>
      <R d={1.8} className="lede" style={{ marginTop: 'calc(var(--u) * 1.4)' }}>
        For most people, life may feel <span style={{ color: 'var(--paper)' }}>more normal, maybe happier</span>, even as the egghead class takes a tumble.
      </R>
      <R d={2.6} className="quote" style={{ marginTop: 'calc(var(--u) * 10)', fontSize: 'calc(var(--u) * 1.6)', borderLeft: '2px solid var(--ember)', paddingLeft: 'calc(var(--u) * 1.2)' }}>
        Your agent reads the group chats and pings you only when it matters. You get the time back for people.
      </R>
    </div>
  ),
  notes:
    'I reallocated two-thirds of my time: more mentoring, public talks, travel, working with people; less writing. Charisma and how you look will matter more. The egghead class takes a tumble. Being in the world, human and physical, will be more the thing.',
}

/* ------------------------------------------------------------------ 17 two camps */

const MAP_W = 19
const mapCache = new Map<string, THREE.Vector3>()
const mapXY = (lat: number, lon: number) => {
  const k = `${lat},${lon}`
  let v = mapCache.get(k)
  if (!v) mapCache.set(k, (v = new THREE.Vector3((lon / 180) * (MAP_W / 2), (lat / 90) * (MAP_W / 4), 0)))
  return v
}
const HUB_US: [number, number] = [38.9, -77.0]
const HUB_CN: [number, number] = [39.9, 116.4]
const SWING: [number, number][] = [[48.9, 2.4], [28.6, 77.2], [-6.2, 106.8], [-15.8, -47.9], [6.5, 3.4], [24.7, 46.7]]

const arcVertex = /* glsl */ `
  varying float vU;
  void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const arcFragment = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uOn; uniform float uPhase;
  varying float vU;
  void main() {
    float pulse = 1.0 - smoothstep(0.0, 0.08, abs(fract(uTime * 0.35 + uPhase) - vU));
    float lean = 0.5 + 0.5 * sin(uTime * 0.9 + uPhase * 6.2831);
    float a = (0.22 + 0.78 * pulse) * uOn * (0.2 + 0.8 * lean * lean);
    gl_FragColor = vec4(uColor * (1.0 + 2.5 * pulse), a);
  }
`

function Arc({ from, to, color, phase, index, delay }: { from: THREE.Vector3; to: THREE.Vector3; color: string; phase: number; index: number; delay: number }) {
  const geom = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5)
    mid.z += 0.6 + from.distanceTo(to) * 0.42
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
    return new THREE.TubeGeometry(curve, 64, 0.04, 6, false)
  }, [from, to])
  const uniforms = useMemo(() => ({ uColor: { value: glow(color, 4.5) }, uTime: { value: 0 }, uOn: { value: 0 }, uPhase: { value: phase } }), [color, phase])
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime
    const age = ageOf(index)
    uniforms.uOn.value = Math.min(1, Math.max(0, (age - delay) / 0.8))
  })
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: arcVertex, fragmentShader: arcFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [uniforms],
  )
  return <mesh geometry={geom} material={material} />
}

function EuropeLeader({ index }: { index: number }) {
  const pts = useMemo(() => {
    const a = mapXY(50.8, 4.4).clone().setZ(0.05)
    return [a, a.clone().add(new THREE.Vector3(1.05, 1.5, 0.45))]
  }, [])
  const draw = useBuildRef(index, 2.6, 0.4)
  return <GlowLine points={pts} color={palette.paper} boost={2} radius={0.01} draw={draw} segments={6} straight />
}

/** Europe's pin pulses between US ice and China red: it has to choose. */
function ChoosingBeacon({ position, index }: { position: THREE.Vector3; index: number }) {
  const core = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const a = useMemo(() => glow(palette.ice, 6), [])
  const b = useMemo(() => glow(palette.alarm, 6), [])
  useFrame(({ clock }) => {
    const on = ageOf(index) > 2.6 ? 1 : 0
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.6)
    if (core.current) core.current.color.copy(a).lerp(b, k)
    if (ring.current) {
      const t = (clock.elapsedTime * 0.8) % 1
      ring.current.scale.setScalar((0.3 + t * 1.6) * on)
      ;(ring.current.material as THREE.MeshBasicMaterial).color.copy(a).lerp(b, k)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - t
    }
  })
  return (
    <group position={position}>
      <mesh scale={0.09}>
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

function CampsScene({ index }: { index: number }) {
  const us = mapXY(...HUB_US)
  const cn = mapXY(...HUB_CN)
  return (
    <group rotation-x={-0.32}>
      {SWING.map(([lat, lon], i) => {
        const p = mapXY(lat, lon)
        return (
          <group key={i}>
            <Arc from={p} to={us} color={palette.ice} phase={i * 0.137} index={index} delay={1.8 + i * 0.06} />
            <Arc from={p} to={cn} color={palette.alarm} phase={i * 0.137 + 0.5} index={index} delay={1.8 + i * 0.06} />
          </group>
        )
      })}
      <Beacon position={us.clone().setZ(0.02)} normal={new THREE.Vector3(0, 0, 1)} delay={1.2} index={index} color={palette.ice} />
      <Beacon position={cn.clone().setZ(0.02)} normal={new THREE.Vector3(0, 0, 1)} delay={1.4} index={index} color={palette.alarm} />
      <Label index={index} delay={1.4} position={us.clone().add(new THREE.Vector3(-1.1, 0.55, 0.2))}>
        <span style={{ color: 'var(--paper)', textShadow: '0 0 12px var(--ice), 0 0 4px #000' }}>United States</span>
      </Label>
      <ChoosingBeacon position={mapXY(50.8, 4.4).clone().setZ(0.02)} index={index} />
      <EuropeLeader index={index} />
      <Label index={index} delay={2.8} position={mapXY(50.8, 4.4).clone().add(new THREE.Vector3(2.3, 1.95, 0.6))}>
        <span style={{ display: 'block', textAlign: 'center', lineHeight: 1.4 }}>
          Europe
          <br />
          choose, or bet on open models
        </span>
      </Label>
      <Label index={index} delay={1.6} position={cn.clone().add(new THREE.Vector3(0.6, 0.7, 0.2))}>
        <span style={{ color: 'var(--paper)', textShadow: '0 0 12px var(--alarm), 0 0 4px #000' }}>China</span>
      </Label>
    </group>
  )
}

export const camps: SlideDef = {
  id: 'camps',
  label: 'Two camps',
  act: 'V · Living in it',
  formation: 'flatMap',
  camera: { pos: [-0.4, 3.3, 23.2], look: [-0.4, 1.75, 0] },
  tint: '#1a1f3a',
  Scene: CampsScene,
  Overlay: () => (
    <>
      <Eyebrow n="17">Geopolitics</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 60)' }}>
        <Words text="Countries without AI risk *losing their sovereignty.*" d={0.15} step={0.05} />
      </h1>
      <R d={0.8} className="lede" style={{ marginTop: 'calc(var(--u) * 0.6)', color: 'var(--paper)' }}>
        Who sets the rules when your hospitals run on a foreign model?
      </R>

      <R d={2.2} className="caption" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'calc(var(--u) * 32)', width: 'calc(var(--u) * 28)', lineHeight: 1.5, fontSize: 'calc(var(--u) * 0.95)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', color: 'var(--paper)' }}>
          <span style={{ width: 'calc(var(--u) * 2.4)', height: 2, background: 'var(--ice)', boxShadow: '0 0 8px rgba(127,220,255,0.7)' }} />
          US models
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', color: 'var(--paper)', marginTop: '0.35em' }}>
          <span style={{ width: 'calc(var(--u) * 2.4)', height: 2, background: 'var(--alarm)', boxShadow: '0 0 8px rgba(255,79,58,0.7)' }} />
          Chinese models
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', color: 'var(--paper)', marginTop: '0.35em' }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#b49bff', boxShadow: '0 0 8px rgba(155,125,255,0.8)', margin: '0 calc(var(--u) * 0.95)' }} />
          Europe: still choosing
        </div>
        <div style={{ marginTop: '0.6em' }}>Arcs: possible dependencies, not forecasts</div>
      </R>
      <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', right: 'var(--pad-x)', bottom: 'calc(var(--u) * 4.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <R d={2.4} className="body" style={{ maxWidth: 'calc(var(--u) * 50)', color: 'var(--paper)', fontSize: 'calc(var(--u) * 1.2)', textWrap: 'balance' } as React.CSSProperties}>
          Most countries, <span style={{ color: '#c4b2ff' }}>Europe</span> included, may have to rely on{' '}
          <span className="ice">US</span> or <span className="alarm">Chinese</span> models, unless open models are good enough.
        </R>
        <R d={3.2} className="quote" style={{ textAlign: 'right', fontSize: 'calc(var(--u) * 1.6)' }}>
          Not bad for the US. <span className="em">Very dicey for everyone else.</span>
        </R>
      </div>
    </>
  ),
  notes:
    'Countries that do not have AI are at risk of losing sovereignty. Open source may help, but much of the world, the EU in particular, may depend on the US or Chinese system. The world divides into two camps; countries will have to choose.',
}

/* ------------------------------------------------------------------ 18 work harder */

const CARD_LABELS = [
  'Update today',
  'v9.1 · already',
  'Agent SDK · migrate',
  'New reasoning mode',
  'Benchmark record',
  'Open weights drop',
  'Workflow: outdated',
  'Coding agent · beta',
  'Patch notes: 40 pp',
]

function StormScene({ index }: { index: number }) {
  const b = useBuild(index, 0.8, 2.0)
  const [overloaded, setOverloaded] = useState(false)
  const flag = useRef(false)
  const cards = useRef<(THREE.Group | null)[]>([])
  const n = 9
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + i * 0.37, h: -2.2 + ((i * 5) % n) / n * 5.2, r: 3.15 + (i % 3) * 0.25 })), [])
  useFrame(() => {
    const raw = ageOf(index)
    const exiting = raw < 0 && deck.get().prev === index
    const age = Math.max(0, raw)
    const on = age > 3.2 || (exiting && flag.current)
    if (on !== flag.current) {
      flag.current = on
      setOverloaded(on)
    }
    // accelerating orbit: angle = w0*t + k*t^2
    const spin = 0.25 * age + 0.06 * age * age
    seeds.forEach((s, i) => {
      const g = cards.current[i]
      if (!g) return
      if (!g.userData.front) {
        let meshes = 0
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.renderOrder = 20 + o.renderOrder
            meshes++
          }
        })
        if (meshes > 0) g.userData.front = true
      }
      const appear = Math.min(1, Math.max(0, (age - (i === 0 ? 0.9 : 2.4) - i * 0.1) / 0.6))
      const a = s.a + spin * (1 + (i % 3) * 0.15)
      g.position.set(Math.cos(a) * s.r, s.h + Math.sin(age * 1.3 + i) * 0.15, Math.sin(a) * s.r)
      // cards face the audience (small tilt) and vanish while they pass behind the calendar
      g.rotation.set(Math.sin(i * 1.7) * 0.04, Math.sin(a) * 0.1, Math.sin(i) * 0.05)
      const front = Math.min(1, Math.max(0, (Math.sin(a) * s.r + 1.2) / 2.4))
      const vis = Math.min(1, Math.max(0, (front - 0.25) / 0.3))
      g.scale.setScalar(appear * 0.9 * (0.3 + 0.7 * front) * vis * vis * (3 - 2 * vis))
      if (i === 0) {
        // The first notification lands front and centre, readable, before the storm takes it.
        const hold = 1 - Math.min(1, Math.max(0, (age - 5.2) / 1.4))
        const k = hold * hold * (3 - 2 * hold)
        g.position.lerp(new THREE.Vector3(0.9, 2.5, 2.6), k)
        g.rotation.set(g.rotation.x * (1 - k), g.rotation.y * (1 - k), g.rotation.z * (1 - k))
        g.scale.setScalar(appear * (0.9 + 0.25 * k))
      }
    })
  })
  return (
    <group>
      <ModelSlot name="CalendarGrid" progress={b} variant={overloaded ? 'overloaded' : 'calm'} position={[0, -0.1, 0]} scale={1.8} />
      {seeds.map((_, i) => (
        <group key={i} ref={(el) => void (cards.current[i] = el)} scale={0}>
          <ModelSlot name="NotificationCard" extra={{ label: CARD_LABELS[i % CARD_LABELS.length] }} progress={1} />
        </group>
      ))}
    </group>
  )
}

export const workHarder: SlideDef = {
  id: 'work-harder',
  label: 'Work harder',
  act: 'V · Living in it',
  formation: 'vortex',
  camera: { pos: [-4.2, 0.6, 16.2], look: [-4.2, 0.2, 0] },
  tint: '#1b2440',
  Scene: StormScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 46)' }}>
      <Eyebrow n="18">The kicker</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="Long run: more leisure." d={0.15} step={0.07} />
        <br />
        <Words text="*Short run: work harder.*" d={0.7} step={0.07} />
      </h1>
      <R d={1.6} className="lede" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 36)', color: 'var(--paper)' }}>
        New terms of competition: adjust, learn, keep up with the models. The leisure comes once the tools mature.
      </R>
      <R d={2.6} className="quote" style={{ marginTop: 'calc(var(--u) * 9)', fontSize: 'calc(var(--u) * 2.4)', maxWidth: 'calc(var(--u) * 38)' }}>
        A new model used to be exciting. Now: <span className="em">“Please postpone it a week.”</span>
      </R>
    </div>
  ),
  notes: 'Right now you have to work harder: new terms of competition, adjust, learn, keep up. I used to be excited when a new model came out. Now: my calendar cannot handle it, please postpone it a week.',
}

/* ------------------------------------------------------------------ 19 close */

export const close: SlideDef = {
  id: 'close',
  label: 'Close',
  act: 'Epilogue',
  formation: 'dawn',
  camera: { pos: [0, 0, 15.8], look: [0, 0, 0] },
  tint: '#3a2610',
  bloom: 0.2,
  Scene: ({ index }) => <EclipseDisc index={index} radius={4.1} rim="#ffd28a" boost={8} />,
  Overlay: () => (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div style={{ width: 'calc(var(--u) * 38)', transform: 'translateY(calc(var(--u) * -0.6))' }}>
        <R d={0.1} className="mono em" style={{ textAlign: 'center', marginBottom: 'calc(var(--u) * 1.4)', letterSpacing: '0.06em', fontSize: 'calc(var(--u) * 0.82)', textTransform: 'uppercase', lineHeight: 1.6 }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: '2.9em', letterSpacing: 0, textTransform: 'none' }}>2% → 2.5%</span>
          <br />
          faster growth could stabilize the debt · <span style={{ color: 'var(--paper)' }}>you are Plan A</span>
        </R>
        <h2 className="h2 it" style={{ fontSize: 'calc(var(--u) * 2.0)', color: 'var(--paper-dim)' }}>
          <Words text="It will feel bad for a while." d={0.5} step={0.08} />
        </h2>
        <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.2)', fontSize: 'calc(var(--u) * 2.45)', maxWidth: 'calc(var(--u) * 33)', marginLeft: 'auto', marginRight: 'auto' }}>
          <Words text="Then we live through one of the *most fantastic chapters* in human history." d={1.6} step={0.07} />
        </h1>
        <R d={3.4} className="caption" style={{ marginTop: 'calc(var(--u) * 2.8)', color: 'var(--paper-dim)' }}>
          Based on a talk by <span style={{ color: 'var(--paper)' }}>Tyler Cowen</span>
          <br />
          Sana AI Summit · New York · May 21, 2026
          <br />
          <span style={{ opacity: 0.85 }}>youtube.com/watch?v=aJlg6o0A_Js</span>
        </R>
      </div>
    </div>
  ),
  notes: 'More leisure in the long term, more work and stress in the short term. Live through one of the most fantastic chapters of human history. Thank you.',
}
