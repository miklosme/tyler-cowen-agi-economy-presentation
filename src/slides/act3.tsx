import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Eyebrow, R, Words } from '../deck/Text'
import { ageOf, useBuild, useBuildRef } from '../deck/hooks'
import { deck } from '../deck/store'
import { ModelSlot } from '../deck/ModelSlot'
import type { SlideDef } from '../deck/types'
import { glow, palette } from '../theme'
import { GlowLine, Label, SceneHtml } from './common'
import { DREAMS, GAUGE, GDP, HOURGLASS_POS, gaugeAngle } from './layout'
import { CHART, DEBT_START_YEAR, DEBT_YEARS, PATH_HIGH, PATH_LOW, chartX, chartY } from '../lib/debt'
import { easeInOutCubic, clamp01, inkPixels, rng } from '../lib/sample'

/* ------------------------------------------------------------------ 06 the number */

function GaugeScene({ index }: { index: number }) {
  const needle = useRef<THREE.Group>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const hub = useRef<THREE.Mesh>(null)
  const held = useRef(2.0)
  useFrame(() => {
    const age = ageOf(index)
    const exiting = age < 0 && deck.get().prev === index
    const a1 = clamp01((age - 1.0) / 0.9)
    const a2 = clamp01((age - 2.6) / 1.4)
    let pct = age < 0 ? 2.0 : 2.0 * easeInOutCubic(a1) + 0.5 * easeInOutCubic(a2)
    if (exiting) pct = Math.max(held.current, 2.5)
    else held.current = pct
    if (needle.current) needle.current.rotation.z = gaugeAngle(pct)
    if (readout.current) {
      readout.current.textContent = `${pct.toFixed(1)}%`
      const box = readout.current.parentElement
      if (box) box.style.opacity = age < 0.9 && !exiting ? '0' : '1'
    }
    if (readout.current) readout.current.style.color = pct > 2.05 ? 'var(--ember)' : 'var(--paper)'
    if (hub.current) (hub.current.material as THREE.MeshBasicMaterial).opacity = clamp01((age - 1) / 0.6)
  })
  return (
    <group>
      <group position={[GAUGE.cx, GAUGE.cy, 0.05]}>
        <group ref={needle}>
          <mesh position={[GAUGE.r * 0.42, 0, 0]}>
            <boxGeometry args={[GAUGE.r * 0.84, 0.035, 0.035]} />
            <meshBasicMaterial color={glow(palette.paper, 3)} toneMapped={false} />
          </mesh>
          <mesh position={[GAUGE.r * 0.86, 0, 0]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshBasicMaterial color={glow(palette.ember, 8)} toneMapped={false} />
          </mesh>
        </group>
        <group rotation-z={gaugeAngle(2.0)}>
          {/* ghost tick: where the needle used to rest, the 2.0% baseline */}

          <mesh position={[GAUGE.r * 0.93, 0, -0.02]}>
            <boxGeometry args={[GAUGE.r * 0.16, 0.016, 0.016]} />
            <meshBasicMaterial color={glow(palette.paper, 1.6)} toneMapped={false} transparent opacity={0.55} />
          </mesh>
        </group>
        <mesh ref={hub}>
          <circleGeometry args={[0.16, 48]} />
          <meshBasicMaterial color={glow(palette.paper, 2)} toneMapped={false} transparent />
        </mesh>
      </group>
      <SceneHtml position={[GAUGE.cx, GAUGE.cy - 1.1, 0]} center>
        <div style={{ textAlign: 'center', opacity: 0, transition: 'opacity 0.8s' }}>
          <span ref={readout} className="stat" style={{ fontSize: 'calc(var(--u) * 6.4)', display: 'block', transition: 'color 0.6s' }} />
          <span className="caption" style={{ letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Real growth per year · near term
          </span>
        </div>
      </SceneHtml>
      <Label index={index} delay={4.0} className="bare" position={[GAUGE.r + 1.05, GAUGE.cy + 0.25, 0]} center={false}>
        <span className="caption" style={{ color: 'var(--paper-dim)', letterSpacing: '0.16em' }}>Silicon Valley · off the dial</span>
      </Label>
      {DREAMS.map((g, i) => {
        return (
          <Label key={g.t} index={index} delay={4.2 + i * 0.3} className="bare" center={false} position={[GAUGE.r + 1.05, GAUGE.cy - 0.45 - i * 0.7, 0]}>
            <span style={{ color: 'var(--paper)', textDecoration: 'line-through', textDecorationColor: '#ff7a66', textDecorationThickness: '2px', fontSize: 'calc(var(--u) * 1.6)', fontFamily: 'var(--serif)', letterSpacing: 0 }}>{g.t}</span>
          </Label>
        )
      })}
      <Label index={index} delay={3.6} center={false} position={[GAUGE.cx + Math.cos(gaugeAngle(2.0)) * (GAUGE.r + 0.6) + 0.2, GAUGE.cy + Math.sin(gaugeAngle(2.0)) * (GAUGE.r + 0.6) + 0.35, 0]} style={{ transform: 'translate(0, -50%)' }}>
        <span style={{ color: 'var(--paper)' }}>← 2.0% baseline</span>
      </Label>
      <Label index={index} delay={3.9} position={[GAUGE.cx + Math.cos(gaugeAngle(2.25)) * (GAUGE.r + 1.15) + 0.55, GAUGE.cy + Math.sin(gaugeAngle(2.25)) * (GAUGE.r + 1.15), 0]}>
        <span className="em">+0.5 percentage points</span>
      </Label>
      {[0, 1, 3].map((p) => {
        const a = gaugeAngle(p)
        const r = GAUGE.r + 0.55
        return (
          <Label key={p} index={index} delay={1.0} position={[GAUGE.cx + Math.cos(a) * r, GAUGE.cy + Math.sin(a) * r, 0]} style={{ fontSize: '1.15em' }}>
            {p}%
          </Label>
        )
      })}
    </group>
  )
}

export const number: SlideDef = {
  id: 'number',
  label: 'The number',
  act: 'III · The number',
  formation: 'gauge',
  tint: '#221e3d',
  Scene: GaugeScene,
  Overlay: () => (
    <>
      <Eyebrow n="06">The contrarian forecast</Eyebrow>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--u) * 4.4)', textAlign: 'center' }}>
        <h2 className="h2">
          <Words text="AI could lift annual growth from about 2% to about *2.5%.*" d={0.2} step={0.05} />
        </h2>
        <R d={4.0} className="lede" style={{ marginTop: 'calc(var(--u) * 1)' }}>
          Not pessimism about AI, <span style={{ color: 'var(--paper)' }}>realism about us.</span> And that half point turns out to be <span className="em">everything</span>.
        </R>
      </div>
    </>
  ),
  notes:
    'AI in the short and medium term boosts growth from about 2% to about 2.5%. Silicon Valley friends think that is crazy: why not 20, 40, 200% a year? Because of the human bottlenecks.',
}

/* ------------------------------------------------------------------ 07 bottleneck */

function BottleneckScene({ index }: { index: number }) {
  const b = useBuild(index, 0.9, 2.2)
  return <ModelSlot name="Hourglass" progress={b} position={[...HOURGLASS_POS]} scale={2.5} />
}

export const bottleneck: SlideDef = {
  id: 'bottleneck',
  label: 'Human bottleneck',
  act: 'III · The number',
  formation: 'funnel',
  tint: '#132538',
  Scene: BottleneckScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'calc(var(--u) * 52)', right: 'var(--pad-x)', top: 'calc(var(--u) * 10)' }}>
      <Eyebrow n="07">Bottleneck #1 · People</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="The smarter the AI, the *harder it is to absorb.*" d={0.15} step={0.05} />
      </h1>
      <R d={1.2} className="card" style={{ marginTop: 'calc(var(--u) * 2.4)', display: 'flex', alignItems: 'center', gap: 'calc(var(--u) * 2)' }}>
        <div>
          <div className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            One memo
          </div>
          <div className="stat" style={{ fontSize: 'calc(var(--u) * 3.4)', marginTop: 'calc(var(--u) * 0.4)' }}>
            5 hrs <span className="em">→</span> 5 min
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(243,238,228,0.2)' }} />
        <div className="body" style={{ flex: 1, fontSize: 'calc(var(--u) * 1.25)', color: 'var(--paper)' }}>
          Done by 9:05. <span className="em">The next team still waits until tomorrow.</span>
        </div>
      </R>
      <R d={1.8} className="lede" style={{ marginTop: 'calc(var(--u) * 2)', color: 'var(--paper)' }}>
        The 4 hours 55 minutes become leisure, not company productivity. Organizations aren’t yet built to pass the gain along.
      </R>
      <R d={2.9} className="h3 em" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        Coding teams and startups already move the next team’s work forward. Most of the economy doesn’t, yet.
      </R>
    </div>
  ),
  notes:
    'The smarter the AI, the harder to work with it, to get organizations to adopt it, to integrate it. The 5-hour memo now takes 5 minutes with Claude, but it converts into leisure, not organizational productivity. Coding and startups are different.',
}

/* ------------------------------------------------------------------ 08 sticky world */

function StickyScene({ index }: { index: number }) {
  const pill = useRef<THREE.Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const b = useBuild(index, 0.8, 1.6)
  const x0 = -7.6
  const x1 = -0.3
  const y = -1.75
  useFrame(() => {
    const age = ageOf(index)
    if (age < 0 && deck.get().prev === index) return // hold the final state while leaving
    const t = clamp01((age - 1.4) / 4.2)
    const k = t * (2 - t)
    if (pill.current) pill.current.position.x = x0 + (x1 - x0) * k
    if (label.current) {
      label.current.textContent = k > 0.995 ? 'Approved · ~10 years' : `Year ${(k * 10).toFixed(1)}`
      label.current.style.opacity = age < 1.2 ? '0' : '1'
    }
  })
  const ticks = useMemo(() => Array.from({ length: 11 }, (_, i) => x0 + ((x1 - x0) * i) / 10), [])
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, y - 0.38, 0]}>
        <boxGeometry args={[x1 - x0, 0.012, 0.012]} />
        <meshBasicMaterial color={glow(palette.ember, 2.5)} toneMapped={false} transparent opacity={b} />
      </mesh>
      {ticks.map((tx, i) => (
        <mesh key={i} position={[tx, y - 0.38, 0]}>
          <boxGeometry args={[0.012, i % 5 === 0 ? 0.28 : 0.14, 0.012]} />
          <meshBasicMaterial color={glow(palette.paper, 2)} toneMapped={false} transparent opacity={b} />
        </mesh>
      ))}
      {[0, 5, 10].map((yr) => (
        <Label key={yr} index={index} delay={1.2} position={[x0 + ((x1 - x0) * yr) / 10, y - 0.85, 0]}>
          {yr === 0 ? 'Idea' : yr === 10 ? 'Approval' : 'yr 5'}
        </Label>
      ))}
      <group ref={pill} position={[x0, y, 0]}>
        <ModelSlot name="PillCapsule" progress={b} scale={0.55} />
        <SceneHtml position={[0, 0.75, 0]} center>
          <span ref={label} className="tag3d" style={{ color: 'var(--ember)', background: 'rgba(4,5,10,0.7)', padding: '0.3em 0.65em', borderRadius: 4 }} />
        </SceneHtml>
      </group>
      <ModelSlot name="CoolingTower" progress={b} variant="dormant" position={[3.7, -0.8, -0.5]} scale={1.5} />
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2
        return (
          <mesh key={i} position={[3.7 + Math.cos(a) * 1.75, -2.02, -0.5 + Math.sin(a) * 0.9]} scale={b}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color={glow(palette.ember, 3)} toneMapped={false} />
          </mesh>
        )
      })}


    </group>
  )
}

export const sticky: SlideDef = {
  id: 'sticky',
  label: 'A sticky world',
  act: 'III · The number',
  formation: 'strata',
  tint: '#2e2216',
  Scene: StickyScene,
  Overlay: () => (
    <>
      <Eyebrow n="08">Bottleneck #2 · A sticky world</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 52)' }}>
        <Words text="Radical technology, meet a *very sticky world.*" d={0.15} step={0.06} />
      </h1>
      <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'calc(var(--u) * 21)', width: 'calc(var(--u) * 26)' }}>
        <R d={1.4} className="stat" style={{ fontSize: 'calc(var(--u) * 3.6)' }}>
          ~10 years
        </R>
        <R d={1.6} className="body" style={{ marginTop: 'calc(var(--u) * 0.4)', color: 'var(--paper)' }}>
          from idea to FDA approval for a new drug, on average. Even if AI finds the molecule tomorrow.
        </R>
      </div>
      <div className="scrim" style={{ position: 'absolute', right: 'var(--pad-x)', top: 'calc(var(--u) * 21)', width: 'calc(var(--u) * 16)', textAlign: 'left' }}>
        <R d={2.0} className="stat" style={{ fontSize: 'calc(var(--u) * 3.6)' }}>
          Decades
        </R>
        <R d={2.2} className="body" style={{ marginTop: 'calc(var(--u) * 0.4)', color: 'var(--paper)' }}>
          with no new US nuclear reactor approved for construction, until recently.
        </R>
        <R d={2.5} className="caption" style={{ marginTop: 'calc(var(--u) * 0.6)', color: 'var(--ice)', fontSize: 'calc(var(--u) * 1.05)', lineHeight: 1.5 }}>
          1978 to 2012:
          <br />
          no approvals
        </R>
      </div>
      <R d={2.8} className="quote" style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--u) * 4.4)', textAlign: 'center', fontSize: 'calc(var(--u) * 1.9)' }}>
        Unfortunate in many ways. <span className="em">Stabilizing</span> in others: the world can’t lurch overnight.
      </R>
    </>
  ),
  notes:
    'On average it takes the FDA about 10 years from idea to approval for a new drug. The NRC approved no new reactor construction between 1978 and 2012 (Vogtle 3 & 4). That is the stickiness of the world: unfortunate, but in some ways stabilizing.',
}

/* ------------------------------------------------------------------ 09 the slow 40% */

function SlowScene({ index }: { index: number }) {
  const draw = useBuildRef(index, 1.6, 1.2)
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
  const bracketGold = useMemo(
    () => [
      new THREE.Vector3(xf + 0.2, GDP.y1 + 0.1, 0.3),
      new THREE.Vector3(xf + 0.2, GDP.y1 + 0.28, 0.3),
      new THREE.Vector3(GDP.x1, GDP.y1 + 0.28, 0.3),
      new THREE.Vector3(GDP.x1, GDP.y1 + 0.1, 0.3),
    ],
    [xf],
  )
  const sectors = ['Government', 'Higher education', 'Parts of healthcare', 'Nonprofits']
  return (
    <group>
      <GlowLine points={bracket} color={palette.paper} boost={2.5} radius={0.015} draw={draw} segments={90} straight />
      <GlowLine points={bracketGold} color={palette.ember} boost={4} radius={0.015} draw={draw} segments={90} straight />
      <Label index={index} delay={1.7} position={[(GDP.x0 + xf) / 2, GDP.y1 - 0.95, 0.8]}>
        <span className="stat" style={{ fontSize: 'calc(var(--u) * 5)', color: 'var(--paper)', letterSpacing: '-0.03em', textTransform: 'none' }}>
          40%<span style={{ color: 'var(--paper-dim)' }}>+</span>
        </span>
      </Label>
      <Label index={index} delay={2.0} position={[(GDP.x0 + xf) / 2, GDP.y1 + 0.75, 0.3]}>
        <span style={{ color: 'var(--paper)' }}>Slow to adjust</span>
      </Label>
      <Label index={index} delay={2.6} position={[(xf + GDP.x1) / 2, GDP.y1 + 0.75, 0.3]}>
        <span style={{ color: 'var(--ember)' }}>Rest of GDP</span>
      </Label>
      <Label index={index} delay={2.9} position={[(xf + GDP.x1) / 2, 0.3, 0.6]} style={{ background: 'rgba(4,5,10,0.92)', textAlign: 'center', lineHeight: 1.45 }}>
        <span style={{ color: 'var(--paper-dim)' }}>Some adapt faster</span>
        <br />
        <span style={{ color: 'var(--ember)' }}>e.g. tech, startups</span>
      </Label>
      {sectors.map((s, i) => (
        <Label key={s} index={index} delay={2.2 + i * 0.2} center={false} position={[GDP.x0 + 0.35, 0.75 - i * 0.75, 0.6]} style={{ background: 'rgba(4,5,10,0.94)', transform: 'translateY(-50%)' }}>
          <span style={{ color: 'var(--paper)' }}>{s}</span>
        </Label>
      ))}
    </group>
  )
}

export const slow40: SlideDef = {
  id: 'slow-40',
  label: 'The slow 40%',
  act: 'III · The number',
  formation: 'gdp',
  camera: { pos: [0, 0.9, 14.4], look: [0, 0.6, 0] },
  tint: '#182438',
  Scene: SlowScene,
  Overlay: () => (
    <div style={{ position: 'absolute', left: 'calc(var(--u) * 60)', right: 'var(--pad-x)', top: 'var(--pad-y)' }}>
      <Eyebrow n="09">Bottleneck #3 · The slow sectors</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="At least *40% of GDP* will be slow to adjust." d={0.15} step={0.05} />
      </h1>
      <R d={0.9} className="caption" style={{ marginTop: 'calc(var(--u) * 0.8)', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--paper)' }}>
        A rough estimate
      </R>


      <R d={1.5} className="card" style={{ marginTop: 'calc(var(--u) * 2.4)' }}>
        <div className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}>
          Exhibit A · higher education
        </div>
        <p className="body" style={{ marginTop: 'calc(var(--u) * 0.8)', color: 'var(--paper)' }}>
          UC Berkeley Law bans AI even for brainstorming. If AI can do the task, is the assignment still testing the right skill?
        </p>
        <p className="quote" style={{ marginTop: 'calc(var(--u) * 1)', fontSize: 'calc(var(--u) * 1.75)' }}>
          Don’t blame the cheaters. <span className="em" style={{ whiteSpace: 'nowrap' }}>Blame the system.</span>
        </p>
      </R>
      <R d={2.4} className="h3 em" style={{ marginTop: 'calc(var(--u) * 2)' }}>
        That’s another reason we won’t grow 20% a year.
      </R>
    </div>
  ),
  notes:
    'Higher ed bitches about cheating. If AI can help you cheat on a task, you are teaching a task humans may not do in two or three years. Government, higher ed, parts of health care, nonprofits: at least 40% of GDP, slow to adjust.',
}

/* ------------------------------------------------------------------ 10 debt */

function DebtScene({ index }: { index: number }) {
  const draw = useBuildRef(index, 1.3, 3.2)
  const toPoints = (path: number[]) => {
    const pts: THREE.Vector3[] = []
    for (let t = 0; t <= DEBT_YEARS; t++) {
      const y = chartY(path[t])
      if (y > CHART.y0 + CHART.height + 0.35) {
        pts.push(new THREE.Vector3(chartX(t), CHART.y0 + CHART.height + 0.35, 0.1))
        break
      }
      pts.push(new THREE.Vector3(chartX(t), y, 0.1))
    }
    return pts
  }
  const low = useMemo(() => toPoints(PATH_LOW), [])
  const high = useMemo(() => toPoints(PATH_HIGH), [])
  const lowEnd = low[low.length - 1]
  const highEnd = high[high.length - 1]
  const dot = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (dot.current) dot.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 3))
  })
  return (
    <group>
      <GlowLine points={low} color={palette.alarm} boost={4.5} radius={0.035} draw={draw} />
      <GlowLine points={high} color={palette.ember} boost={4.5} radius={0.035} draw={draw} />
      {[1, 2, 3].map((r) => (
        <mesh key={r} position={[(-2.6 + CHART.x1) / 2, chartY(r), -0.05]}>
          <boxGeometry args={[CHART.x1 + 2.6, 0.008, 0.008]} />
          <meshBasicMaterial color={glow(palette.paper, 1.2)} toneMapped={false} transparent opacity={0.18} />
        </mesh>
      ))}
      <mesh ref={dot} position={[chartX(0), chartY(1), 0.15]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshBasicMaterial color={glow(palette.paper, 6)} toneMapped={false} />
      </mesh>
      <Label index={index} delay={1.2} position={[chartX(0) + 0.15, chartY(1) - 0.45, 0]} center={false}>
        Today · ~100% of GDP
      </Label>
      {[1, 2, 3].map((r) => (
        <Label key={r} index={index} delay={1.0} position={[CHART.x1 + 0.3, chartY(r), 0]} center={false} style={{ opacity: 0.85, transform: 'translateY(-50%)' }}>
          {r * 100}%{r === 1 ? ' of GDP' : ''}
        </Label>
      ))}
      {[0, 20, 40].map((t) => (
        <Label key={t} index={index} delay={1.0} position={[chartX(t), CHART.y0 - 0.45, 0]} style={{ opacity: 0.55 }}>
          {DEBT_START_YEAR + t}
        </Label>
      ))}
      <Label index={index} delay={3.4} position={[lowEnd.x - 0.9, lowEnd.y + 0.15, 0]} center={false} style={{ transform: 'translate(-100%, -100%)', textAlign: 'right' }}>
        <span style={{ color: 'var(--alarm)', fontSize: '1.3em' }}>2.0% growth · ~{Math.round(PATH_LOW[DEBT_YEARS] * 100)}% by 2066</span>
        <br />
        <span style={{ textTransform: 'none', letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>explodes: “the next Greece”</span>
      </Label>
      <Label index={index} delay={3.9} position={[highEnd.x - 0.2, highEnd.y + 0.3, 0]} center={false} style={{ transform: 'translate(-100%, -100%)', textAlign: 'right' }}>
        <span style={{ color: 'var(--ember)', fontSize: '1.3em' }}>2.5% growth · ~{Math.round(PATH_HIGH[DEBT_YEARS] * 100)}% by 2066</span>
        <br />
        <span style={{ textTransform: 'none', letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>flattens toward a manageable level</span>
      </Label>
      <Label index={index} delay={1.0} position={[CHART.x1 + 0.3, chartY(3) + 0.42, 0]} center={false} style={{ transform: 'translateY(-100%)', opacity: 0.85 }}>
        Debt held
        <br />
        by the public
        <br />
        % of GDP
        <br />
        <span style={{ color: 'var(--ember)' }}>illustrative</span>
      </Label>
    </group>
  )
}

export const debt: SlideDef = {
  id: 'debt',
  label: 'Half a point',
  act: 'III · The number',
  formation: 'debt',
  camera: { pos: [0.4, 0.4, 15.2], look: [0.4, 0.3, 0] },
  tint: '#3a1616',
  Scene: DebtScene,
  Overlay: () => (
    <>
      <Eyebrow n="10">Why half a point is everything</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="$38 trillion" d={0.15} step={0.08} />
        <br />
        <Words text="*and counting.*" d={0.4} step={0.08} emClass="alarm" />
      </h1>
      <R d={0.5} className="caption" style={{ marginTop: 'calc(var(--u) * 0.6)' }}>
        Gross federal debt, 2026
      </R>
      <R d={0.9} className="h3 em" style={{ marginTop: 'calc(var(--u) * 1.2)', maxWidth: 'calc(var(--u) * 30)', fontSize: 'calc(var(--u) * 1.75)' }}>
        At 2.5% instead of 2%, the debt nearly levels off (in this scenario).
      </R>
      <R d={1.3} className="body" style={{ marginTop: 'calc(var(--u) * 0.7)', maxWidth: 'calc(var(--u) * 29)', color: 'var(--paper)' }}>
        A manageable path instead of a crisis: no huge tax hike, no gutted Medicare, Medicaid or Social Security.
      </R>
      <R d={0.9} className="caption" style={{ position: 'absolute', left: 'var(--pad-x)', right: 'calc(var(--u) * 16)', bottom: 'calc(var(--u) * 3.2)', fontSize: 'calc(var(--u) * 0.82)' }}>
        <span style={{ color: 'var(--paper)' }}>Illustrative scenario, not a forecast.</span> Debt held by the public, about 100% of GDP today. Same programs and tax rates;
        faster growth lifts revenue while real program costs follow the same path. Interest costs rise as debt grows.
      </R>
    </>
  ),
  notes:
    'US debt is over 38 trillion, maybe 39. If we grow 2.5% instead of 2%, that debt, rather than exploding and making us the next Greece, converges to a manageable level. No huge tax increase, no Medicare or Social Security ravaged.',
}

/* ------------------------------------------------------------------ 11 plan A */

const ghostVertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute vec3 aStart;
  attribute vec3 aDrift;
  attribute float aSeed;
  uniform float uForm;
  uniform float uScatter;
  uniform float uScale;
  varying float vA;
  void main() {
    float f = 1.0 - pow(1.0 - clamp(uForm * 1.15 - aSeed * 0.15, 0.0, 1.0), 3.0);
    float sc = clamp(uScatter * 1.3 - aSeed * 0.3, 0.0, 1.0);
    vec3 p = mix(aStart, aTarget, f) + aDrift * sc + vec3(0.0, -2.2 * sc * sc, 0.0);
    vA = f * (1.0 - sc);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(0.035 * uScale / -mv.z, 1.0, 24.0);
  }
`
const ghostFragment = /* glsl */ `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    gl_FragColor = vec4(vec3(0.62, 0.7, 0.86) * 1.4, exp(-d2 * 3.0) * vA);
  }
`

/** A "B" that tries to form beside the A and then crumbles: there is no Plan B. */
function GhostB({ index }: { index: number }) {
  const { geometry, material } = useMemo(() => {
    const ink = inkPixels(
      (ctx, w, h) => {
        ctx.font = `300 ${h * 1.05}px Fraunces`
        ctx.textAlign = 'center'
        ctx.fillText('B', w / 2, h * 0.9)
      },
      { w: 300, h: 300, worldW: 4.2 },
    )
    const r = rng(9)
    const n = 6000
    const target = new Float32Array(n * 3)
    const start = new Float32Array(n * 3)
    const drift = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const j = Math.floor(r() * (ink.pts.length / 2))
      target.set([ink.pts[j * 2], ink.pts[j * 2 + 1], (r() - 0.5) * 0.15], i * 3)
      start.set([(r() - 0.5) * 7, (r() - 0.5) * 7, (r() - 0.5) * 4 - 2], i * 3)
      drift.set([(r() - 0.3) * 2.5, (r() - 0.5) * 1.5, (r() - 0.5) * 2], i * 3)
      seed[i] = r()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(target, 3))
    g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3))
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
    g.setAttribute('aDrift', new THREE.BufferAttribute(drift, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50)
    const m = new THREE.ShaderMaterial({
      uniforms: { uForm: { value: 0 }, uScatter: { value: 0 }, uScale: { value: 1000 } },
      vertexShader: ghostVertex,
      fragmentShader: ghostFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [])
  useFrame(({ size, camera }) => {
    const age = ageOf(index)
    const exiting = age < 0 && deck.get().prev === index
    if (!exiting) {
      material.uniforms.uForm.value = clamp01((age - 1.9) / 1.0)
      material.uniforms.uScatter.value = clamp01((age - 3.3) / 1.8)
    } else {
      material.uniforms.uScatter.value = Math.min(1, material.uniforms.uScatter.value + 0.06)
    }
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
    material.uniforms.uScale.value = size.height / (2 * Math.tan(fov / 2))
  })
  return <points geometry={geometry} material={material} position={[5.4, 4.6, -3.5]} scale={0.55} frustumCulled={false} />
}


export const planA: SlideDef = {
  id: 'plan-a',
  label: 'Plan A',
  act: 'III · The number',
  formation: 'planA',
  tint: '#33230f',
  bloom: 0.25,
  Scene: GhostB,
  Overlay: () => (
    <div style={{ position: 'absolute', left: 'calc(var(--u) * 56)', right: 'var(--pad-x)', top: 'calc(var(--u) * 11)' }}>
      <Eyebrow n="11">The stakes</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.8)', fontSize: 'calc(var(--u) * 3.8)' }}>
        <Words text="If you work in AI, you are *Plan A.*" d={0.4} step={0.07} />
      </h1>
      <h2 className="h2 it" style={{ marginTop: 'calc(var(--u) * 1.8)', color: 'var(--paper)', fontSize: 'calc(var(--u) * 3.1)' }}>
        <Words text="There is no Plan B." d={2.0} step={0.12} />
      </h2>
      <R d={3.4} className="card" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 34)', boxShadow: 'inset 3px 0 0 var(--ember)' }}>
        <div className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}>The assignment</div>
        <div className="lede" style={{ marginTop: 'calc(var(--u) * 0.5)', color: 'var(--paper)' }}>
          Make the <span className="em">next team’s work start sooner.</span> No more 9:05 memos waiting until tomorrow.
        </div>
      </R>
      <R d={4.1} className="body" style={{ marginTop: 'calc(var(--u) * 2.2)', maxWidth: 'calc(var(--u) * 32)', color: 'var(--paper)' }}>
        Without AI there’s no other productivity savior on the horizon, and{' '}
        <span style={{ color: 'var(--paper)' }}>no painless way out of the debt.</span>
      </R>
    </div>
  ),
  notes: 'If you work in AI, you are our savior, our plan A. There is no plan B. Without AI there is no obvious productivity savior, and we are all kind of screwed.',
}

/* ------------------------------------------------------------------ 12 done before */

function NinetiesScene({ index }: { index: number }) {
  const b = useBuild(index, 1.0, 2.2)
  return (
    <group>
      <ModelSlot name="InventoryShelf" progress={b} position={[1.6, -0.45, -0.6]} scale={2.0} />
      <ModelSlot name="RetroComputer" progress={Math.min(1, b * 1.2)} position={[5.6, -0.8, 0.4]} scale={1.72} />
    </group>
  )
}

export const doneBefore: SlideDef = {
  id: 'done-before',
  label: 'We’ve done it before',
  act: 'III · The number',
  formation: 'grid90s',
  camera: { pos: [0, 0.8, 14.5], look: [0, -0.75, 0] },
  tint: '#2a1840',
  Scene: NinetiesScene,
  Overlay: () => (
    <div className="scrim" style={{ position: 'absolute', left: 'var(--pad-x)', top: 'var(--pad-y)', width: 'calc(var(--u) * 40)' }}>
      <Eyebrow n="12">Is half a point plausible?</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)' }}>
        <Words text="We’ve done it *before.*" d={0.15} step={0.07} />
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--u) * 1.2)', marginTop: 'calc(var(--u) * 2)' }}>
        <R d={0.9} className="stat" style={{ fontSize: 'calc(var(--u) * 7)', color: 'var(--ember)' }}>
          +0.5
        </R>
        <R d={1.1} className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--paper)', whiteSpace: 'nowrap', lineHeight: 1.6 }}>
          percentage points of
          <br />
          extra annual growth, roughly
          <br />
          1995 to 1998
        </R>
      </div>
      <R d={1.4} className="lede" style={{ marginTop: 'calc(var(--u) * 1.4)', color: 'var(--paper)' }}>
        Very basic software helped, including the inventory systems Walmart rolled out. Real wages rose. It wasn’t utopian. AI can repeat it, even if we’re stingy
        about data centers.
      </R>
      <R
        d={2.2}
        className="quote"
        style={{
          marginTop: 'calc(var(--u) * 2.2)',
          fontSize: 'calc(var(--u) * 1.9)',
          padding: 'calc(var(--u) * 0.8) calc(var(--u) * 1.2) calc(var(--u) * 0.8) 0',
          background: 'linear-gradient(90deg, rgba(4,5,10,0.8) 60%, rgba(4,5,10,0))',
        }}
      >
        AI just has to repeat the mid-’90s, and <span className="em">make it last longer than three years.</span>
      </R>
    </div>
  ),
  notes:
    '1995 to 1998: basic software, inventory management for companies like Walmart. In the talk, growth went up about half a percentage point (the late-1990s US productivity acceleration). Can AI do what we did in the mid-90s? Pretty sure yes, even if we are stingy with data centers. Just make it last more than three years.',
}
