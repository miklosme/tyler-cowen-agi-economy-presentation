import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import { rng } from '../lib/sample'
import { useFrame } from '@react-three/fiber'
import { Eyebrow, R, SlidePhase, Words } from '../deck/Text'
import { ageOf, useBuild } from '../deck/hooks'
import { deck } from '../deck/store'
import { ModelSlot, useModelModule } from '../deck/ModelSlot'
import type { SlideDef } from '../deck/types'
import { Label } from './common'
import { ENGINE_X } from './layout'

/* ------------------------------------------------------------------ 03 more projects */

/** Counts the cyan new-work squares actually on screen (same timing as ProjectsScene). */
function NewWorkCount() {
  const ref = useRef<HTMLSpanElement>(null)
  const phase = useContext(SlidePhase)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const d = deck.get()
      const age = performance.now() / 1000 - d.changedAt + (d.instant ? 1.4 : 0)
      const grow = phase === 'exit' ? 1 : Math.min(1, Math.max(0, (age - 1.8) / 4))
      if (ref.current) ref.current.textContent = Math.round(900 * Math.pow(grow, 0.625)).toLocaleString('en-US')
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])
  return <span ref={ref} className="mono ice" />
}

export function Counter({ to, d, dur = 3.2 }: { to: number; d: number; dur?: number }) {
  const [v, setV] = useState(1)
  useEffect(() => {
    const base = parseFloat(getComputedStyle(document.querySelector('.slide[data-state="enter"]') ?? document.body).getPropertyValue('--base')) || 0
    const t0 = performance.now() + (d + base) * 1000
    let raf = 0
    const tick = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - t0) / (dur * 1000)))
      const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setV(Math.max(1, Math.round(Math.pow(to, e))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, d, dur])
  return <>{v.toLocaleString('en-US')}</>
}

/** "Many, many more": cyan new-work squares keep popping up across the grid. */
function ProjectsScene({ index }: { index: number }) {
  const n = 2100
  const mesh = useRef<THREE.InstancedMesh>(null)
  const cells = useMemo(() => {
    const r = rng(17)
    const pitch = 0.95
    const out: { x: number; z: number; t: number }[] = []
    while (out.length < n) {
      const i = Math.floor(r() * 44)
      const j = Math.floor(r() * 60)
      const x = (i - 22 + 0.5) * pitch
      const z = -3.2 - j * pitch
      // new work appears mostly out toward the edges and the horizon
      const d = Math.hypot(x, (z + 10) * 0.8) / 30
      if (r() > 0.62 + d * 1.2) continue
      out.push({ x, z, t: Math.pow(r(), 1.6) })
    }
    return out
  }, [])
  const geom = useMemo(() => new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: glow(palette.ice, 1.45), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const lift = useRef<THREE.InstancedMesh>(null)
  const L = 150
  const lifters = useMemo(() => {
    const r = rng(29)
    return Array.from({ length: L }, () => ({
      x: 1.5 + Math.pow(r(), 0.8) * 19,
      z: -6 - r() * 30,
      ph: r(),
      sp: 0.35 + r() * 0.35,
      t: 0.15 + r() * 0.8,
      spin: (r() - 0.5) * 1.2,
    }))
  }, [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const sv = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!mesh.current) return
    const age = ageOf(index)
    const grow = age < 0 ? (deck.get().prev === index ? 1 : 0) : Math.min(1, Math.max(0, (age - 1.9) / 4.4))
    if (lift.current) {
      const t = Math.max(0, age < 0 ? 6 : age)
      let c = 0
      for (const p of lifters) {
        if (grow < p.t) continue
        const k = ((t - 1.9 - p.t * 4.4) * p.sp * 0.32 + p.ph) % 1
        if (k < 0) continue
        const h = k * 7.5
        const s = Math.min(1, (grow - p.t) * 10) * (1 - k) * 0.9
        e.set(-Math.PI / 2 + k * 1.1, k * p.spin * 3, 0)
        q.setFromEuler(e)
        m4.compose(v.set(p.x, -2.5 + h, p.z), q, sv.set(s, s, s))
        lift.current.setMatrixAt(c++, m4)
      }
      lift.current.count = c
      lift.current.instanceMatrix.needsUpdate = true
    }
    let shown = 0
    for (let k = 0; k < n; k++) {
      const c = cells[k]
      const on = grow >= c.t ? Math.min(1, (grow - c.t) * 12) : 0
      if (on <= 0) continue
      m4.makeScale(on, 1, on).setPosition(c.x, -2.59, c.z)
      mesh.current.setMatrixAt(shown++, m4)
    }
    mesh.current.count = shown
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={mesh} args={[geom, mat, n]} frustumCulled={false} />
      <instancedMesh ref={lift} args={[liftGeom, mat, L]} frustumCulled={false} />
    </group>
  )
}
const liftGeom = new THREE.PlaneGeometry(0.5, 0.5)

export const projects: SlideDef = {
  id: 'projects',
  label: 'More projects',
  act: 'II · Work',
  formation: 'projects',
  Scene: ProjectsScene,
  camera: { pos: [0, 2.6, 11], look: [0, 0.9, -10], fov: 44 },
  tint: '#1d2638',
  Overlay: () => (
    <div className="scrim" style={{ width: 'calc(var(--u) * 54)' }}>
      <Eyebrow n="03">Work</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="Not mass unemployment." d={0.1} step={0.06} />
        <br />
        <Words text="*Many, many more projects.*" d={0.55} step={0.07} />
      </h1>
      <R d={1.2} className="lede" style={{ marginTop: 'calc(var(--u) * 1.4)', maxWidth: 'calc(var(--u) * 42)', color: 'var(--paper)' }}>
        AI will change most jobs. But it makes projects cheaper, so we start far more of them, and each one needs people: testing ideas, gathering data, making
        entertainment, instruction and art.
      </R>
      <div style={{ display: 'flex', gap: 'calc(var(--u) * 0.8)', marginTop: 'calc(var(--u) * 0.9)' }}>
        <R as="span" d={1.0} className="chip" style={{ fontSize: 'calc(var(--u) * 1.05)', color: 'var(--paper)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, border: '1.5px solid var(--ember)', boxShadow: '0 0 8px var(--ember)' }} />
          Existing projects
        </R>
        <R as="span" d={2.2} className="chip" style={{ fontSize: 'calc(var(--u) * 1.05)', color: 'var(--paper)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#c8f1ff', boxShadow: '0 0 8px var(--ice)' }} />
          New ones AI makes possible
        </R>
      </div>
    </div>
  ),
  notes: 'AI will not bring mass unemployment. It will change most jobs. Key feature of AI: many, many more projects.',
}

/* ------------------------------------------------------------------ 04 job engines */

const ENGINES = [
  {
    model: 'LabFlask',
    title: 'Run experiments',
    body: 'Testing AI’s ideas in the real world, not just by PhDs, above all in biomedicine.',
    color: 'var(--ice)',
  },
  {
    model: 'DataScanner',
    title: 'Turn the world into data',
    body: 'Most of the world isn’t data yet. Firms already hire basketball analysts to teach AI how to watch a game.',
    color: 'var(--ice)',
  },
  {
    model: 'PowerCompute',
    title: 'Build energy & compute',
    body: 'Fusion, fission or solar on every roof, plus the data centers: whatever wins, it takes a lot more hands.',
    color: 'var(--ember)',
  },
]

function EnginesScene({ index }: { index: number }) {
  const b = useBuild(index, 1.0, 2.4)
  return (
    <group>
      {ENGINES.map((e, i) => (
        <ModelSlot
          key={e.model}
          name={e.model}
          progress={Math.min(1, Math.max(0, b * 1.5 - i * 0.25))}
          position={[ENGINE_X[i], 0.35, 0]}
          scale={1.5}
        />
      ))}
    </group>
  )
}

export const engines: SlideDef = {
  id: 'engines',
  label: 'Job engines',
  act: 'II · Work',
  formation: 'engines',
  tint: '#16283a',
  Scene: EnginesScene,
  Overlay: () => (
    <>
      <Eyebrow n="04">Where the new jobs come from</Eyebrow>
      <h2 className="h1" style={{ marginTop: 'calc(var(--u) * 1.3)', fontSize: 'calc(var(--u) * 3.4)' }}>
        <Words text="Three job engines about to *go crazy.*" d={0.1} step={0.06} />
      </h2>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(var(--u) * 38.5)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '0 calc(var(--u) * 3.5)', gap: 'calc(var(--u) * 3)' }}>
        {ENGINES.map((e, i) => (
          <div key={e.model} style={{ textAlign: 'center' }}>
            <R d={0.9 + i * 0.55} className="h3" style={{ color: e.color }}>
              {e.title}
            </R>
            <R d={1.2 + i * 0.55} className="body" style={{ marginTop: 'calc(var(--u) * 0.6)', fontSize: 'calc(var(--u) * 1.15)', color: 'var(--paper)' }}>
              {e.body}
            </R>
          </div>
        ))}
      </div>
      <R d={3.0} className="body" style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--u) * 4.1)', textAlign: 'center', fontSize: 'calc(var(--u) * 1.15)', color: 'var(--paper)' }}>
        Plus the forever-growth sectors: <span style={{ color: 'var(--paper)' }}>healthcare</span> (no one ever lives long enough) and{' '}
        <span style={{ color: 'var(--paper)' }}>tech</span>.
      </R>
    </>
  ),
  notes:
    'Two categories of job will go crazy: running experiments (AI will have many new ideas, most of all in biomedicine) and gathering data (Mercor wants people trained in basketball analytics to teach AI). Plus the build-out of energy and compute. Healthcare and tech keep growing.',
}

/* ------------------------------------------------------------------ 05 status remix */

const STEP_TEXT = ['Be very smart', 'Good school', 'Work hard', 'Follow the rules', 'Partner · Manhattan · $2M a year']

function StatusScene({ index }: { index: number }) {
  const b = useBuild(index, 0.9, 1.8)
  const mod = useModelModule('StatusStaircase')
  const anchors = (mod?.STEP_ANCHORS as [number, number, number][] | undefined) ?? []
  const [remixed, setRemixed] = useState(false)
  const flag = useRef(false)
  useFrame(() => {
    const age = ageOf(index)
    const on = age > 4.6 || (age < 0 && deck.get().prev === index && flag.current)
    if (on !== flag.current) {
      flag.current = on
      setRemixed(on)
    }
  })
  const S = 2.45
  const offset: [number, number, number] = [3.4, 0.1, 0]
  return (
    <group>
      <ModelSlot name="StatusStaircase" progress={b} variant={remixed ? 'remixed' : 'intact'} position={offset} scale={S} />
      <Label index={index} delay={6.2} position={[0.4, 3.55, 0.3]}>
        <span className="ice">Take initiative</span>
      </Label>
      <Label index={index} delay={remixed ? 5.6 : 999} position={[4.2, -1.27, 0.6]} style={{ textAlign: 'center', lineHeight: 1.4 }}>
        <span style={{ color: '#ffa898' }}>Was: partner</span>
        <br />
        <span style={{ color: '#ffa898' }}>Manhattan · $2M</span>
      </Label>
      {anchors.slice(0, 5).map((a, i) => (
        <Label
          key={i}
          index={index}
          delay={remixed ? 999 : 1.1 + i * 0.2}
          position={i === 4 ? [offset[0] + a[0] * S - 0.75, offset[1] + a[1] * S + 0.35, offset[2] + a[2] * S] : [offset[0] + a[0] * S + 0.75, offset[1] + a[1] * S + 0.05, offset[2] + a[2] * S]}
          className={i === 4 ? '' : 'dim'}
          center={false}
          style={{ transform: i === 4 ? 'translate(-100%, -50%)' : 'translateY(-50%)' }}
        >
          {i === 4 ? <b>{STEP_TEXT[i]}</b> : STEP_TEXT[i]}
        </Label>
      ))}
    </group>
  )
}

export const status: SlideDef = {
  id: 'status',
  label: 'Status remix',
  act: 'II · Work',
  formation: 'ladder',
  tint: '#2a2030',
  Scene: StatusScene,
  Overlay: () => (
    <>
      <Eyebrow n="05">Status</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 36)' }}>
        <Words text="Status is about to be *remixed.*" d={0.15} step={0.07} />
      </h1>
      <R d={0.8} className="caption" style={{ marginTop: 'calc(var(--u) * 1.6)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
        The old ladder
      </R>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--u) * 0.5)', marginTop: 'calc(var(--u) * 0.7)', maxWidth: 'calc(var(--u) * 36)' }}>
        {['Be smart', 'Good school', 'Work hard', 'Follow the rules', 'Partner · Manhattan · $2M'].map((c, i) => (
          <R as="span" key={c} d={1.0 + i * 0.12} className="chip" style={{ fontSize: 'calc(var(--u) * 1.05)', color: 'var(--paper)', textTransform: 'none', letterSpacing: '0.04em' }}>
            <span className="strike" style={{ '--sd': 4.5 + i * 0.18 } as React.CSSProperties}>
              {c}
            </span>
          </R>
        ))}
      </div>
      <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'calc(var(--u) * 27)', width: 'calc(var(--u) * 36)' }}>
        <R d={4.9} className="h3 ice">
          The new winners take initiative.
        </R>
        <R d={5.1} className="body" style={{ marginTop: 'calc(var(--u) * 0.5)', color: 'var(--paper)' }}>
          They figure out how AI and agents work, and do something different.
        </R>
        <R d={5.6} className="body" style={{ marginTop: 'calc(var(--u) * 1.2)', color: 'var(--paper)' }}>
          And it will hurt: <span className="alarm">those who lose status suffer more than those who gain it.</span> AI already polls worst with the young.
        </R>
      </div>
    </>
  ),
  notes:
    'If you were smart, went to a good school, worked hard and followed the rules, you could become a partner in Manhattan earning $2M a year. Those people might lose. The winners take initiative. Losers suffer more psychologically than winners gain. AI polls badly, worst with young people.',
}
