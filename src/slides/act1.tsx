import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Eyebrow, R, Words } from '../deck/Text'
import { ageOf, useBuildRef } from '../deck/hooks'
import { palette } from '../theme'
import { gauss, rng } from '../lib/sample'
import { useBuild } from '../deck/hooks'
import { ModelSlot } from '../deck/ModelSlot'
import type { SlideDef } from '../deck/types'
import { EclipseDisc, GlowLine, Label } from './common'
import { INVENTIONS, INVENTION_SCALE, LATER, TIMELINE, yearX } from './layout'

/* ------------------------------------------------------------------ 00 title */

export const title: SlideDef = {
  id: 'title',
  label: 'Title',
  act: 'Prologue',
  formation: 'eclipse',
  camera: { pos: [0, 0, 15], look: [0, 0, 0] },
  tint: '#1b1f3f',
  Scene: ({ index }) => <EclipseDisc index={index} radius={3.7} rim="#ffe2b0" boost={6} />,
  Overlay: () => (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div style={{ transform: 'translateY(calc(var(--u) * -0.6))' }}>
        <h1 className="display" style={{ margin: 0 }}>
          <Words text="The AGI" d={0.25} step={0.12} />
          <br />
          <Words text="*Economy*" d={0.5} step={0.12} />
        </h1>
        <R d={1.0} className="lede" style={{ maxWidth: 'calc(var(--u) * 33)', margin: 'calc(var(--u) * 1.8) auto 0', color: 'var(--paper)', fontSize: 'calc(var(--u) * 1.6)', textWrap: 'balance' } as React.CSSProperties}>
          How <span className="em">half a percentage point</span> of extra annual growth could <span className="em" style={{ fontWeight: 400 }}>stabilize U.S. federal debt</span>.
        </R>
        <R d={1.4} className="rule-draw hair" style={{ width: 'calc(var(--u) * 8)', margin: 'calc(var(--u) * 1.4) auto 0', background: 'linear-gradient(90deg, rgba(255,181,71,0), rgba(255,181,71,0.8), rgba(255,181,71,0))' }} />
        <R d={1.5} className="caption" style={{ marginTop: 'calc(var(--u) * 1.0)', color: 'var(--paper)', fontSize: 'calc(var(--u) * 1.0)' }}>
          Based on a talk by <span style={{ color: 'var(--paper)' }}>Tyler Cowen</span>
          <br />
          Sana AI Summit · New York · May 21, 2026
        </R>
      </div>
    </div>
  ),
  notes:
    'Open with the mood: a mix of optimism and realism. AI is already doing remarkable things, and a lot of people will not like what comes next.',
}

/* ------------------------------------------------------------------ 01 two truths */

const heapVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uGrow;
  uniform float uScale;
  varying float vA;
  void main() {
    float on = step(aSeed, uGrow);
    vec3 p = position;
    p.y *= 0.35 + 0.65 * uGrow;
    vA = on * (0.55 + 0.45 * fract(aSeed * 91.7));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(0.045 * uScale / -mv.z, 1.0, 16.0);
  }
`
const heapFragment = /* glsl */ `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    gl_FragColor = vec4(vec3(0.45, 0.78, 1.0) * 1.6, exp(-d2 * 3.0) * vA);
  }
`

/** Realism, made visible: a cold heap that keeps slowly piling up long after optimism has arrived. */
function SlowHeap({ index }: { index: number }) {
  const { geometry, material } = useMemo(() => {
    const r = rng(5)
    const n = 7000
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = gauss(r) * 1.1
      const h = 0.95 * Math.exp(-Math.pow(x / 1.15, 2)) * Math.pow(r(), 0.55)
      pos.set([4.6 + x, -0.45 + h, gauss(r) * 0.4], i * 3)
      seed[i] = r()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uGrow: { value: 0 }, uScale: { value: 1000 } },
      vertexShader: heapVertex,
      fragmentShader: heapFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [])
  useFrame(({ size, camera }) => {
    const age = ageOf(index)
    if (age >= 0) material.uniforms.uGrow.value = Math.min(1, Math.max(0, (age - 2.2) / 7))
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
    material.uniforms.uScale.value = size.height / (2 * Math.tan(fov / 2))
  })
  return (
    <group>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <Label index={index} delay={3.2} position={[4.6, 0.95, 0]} style={{ background: 'rgba(4,5,10,0.45)', border: '1px solid rgba(127,220,255,0.35)' }}>
        <span className="ice">benefits still arriving…</span>
      </Label>
    </group>
  )
}

export const twoTruths: SlideDef = {
  id: 'two-truths',
  label: 'Optimism & realism',
  act: 'I · The shock',
  formation: 'split',
  tint: '#241d3a',
  Scene: SlowHeap,
  Overlay: () => (
    <>
      <Eyebrow n="01">Two things are true at once</Eyebrow>
      <div style={{ position: 'absolute', left: 'calc(var(--u) * 9.5)', width: 'calc(var(--u) * 29)', top: 'calc(var(--u) * 35.5)', textAlign: 'center' }}>
        <h2 className="h1 em" style={{ marginBottom: 'calc(var(--u) * 0.8)' }}>
          <Words text="Optimism" d={0.1} />
        </h2>
        <R d={0.35} className="lede" style={{ color: 'var(--paper)' }}>
          Striking math theorems already. Next: longer lives, more wealth, more entertainment.
        </R>
      </div>
      <div style={{ position: 'absolute', right: 'calc(var(--u) * 9.5)', width: 'calc(var(--u) * 29)', top: 'calc(var(--u) * 35.5)', textAlign: 'center' }}>
        <h2 className="h1 ice" style={{ marginBottom: 'calc(var(--u) * 0.8)' }}>
          <Words text="Realism" d={0.45} />
        </h2>
        <R d={1.8} className="lede" style={{ color: 'var(--paper)' }}>
          Many will have to relearn their jobs, and won’t like it. The benefits arrive slower than promised.
        </R>
      </div>
      <R d={2.4} className="quote" style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--u) * 4.2)', textAlign: 'center', fontSize: 'calc(var(--u) * 2.1)' }}>
        So it will feel <span className="em">bad</span> for a while.
      </R>
    </>
  ),
  notes: 'Optimism: it proved a striking theorem just yesterday. Realism: people will not like it, and it will be slower than advocates say.',
}

/* ------------------------------------------------------------------ 02 the last revolution */

function RevolutionScene({ index }: { index: number }) {
  const b = useBuild(index, 1.2, 2.2)
  const flight = INVENTIONS[0]
  const leader = useMemo(() => [new THREE.Vector3(flight.x - 0.14, flight.y - 0.55, 0.45), new THREE.Vector3(flight.x - 0.14, TIMELINE.y + 0.05, 0.45)], [])
  const draw = useBuildRef(index, 1.6, 0.6)
  return (
    <group>
      <GlowLine points={leader} color={palette.ember} boost={3} radius={0.012} draw={draw} segments={6} straight />
      {INVENTIONS.map((inv, i) => {
        const p = Math.min(1, Math.max(0, b * 1.6 - i * 0.2))
        return (
          <group key={inv.model}>
            <ModelSlot name={inv.model} progress={p} position={[inv.x, inv.y, 0]} scale={INVENTION_SCALE} />
            <Label
              index={index}
              delay={1.4 + i * 0.25}
              position={inv.labelSide === 'right' ? [inv.x + 1.15, inv.y, 0] : [inv.x + (inv.year === 1908 ? 0.3 : 0), inv.labelY, 0]}
              center={inv.labelSide !== 'right'}
              style={inv.labelSide === 'right' ? { transform: 'translateY(-50%)' } : undefined}
            >
              <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
                <span style={{ color: 'var(--paper)', fontWeight: 500 }}>{inv.year}</span>
                <br />
                {inv.label}
              </div>
            </Label>
          </group>
        )
      })}
      {LATER.map((l, i) => (
        <Label key={l.label} index={index} delay={2.6 + i * 0.2} position={[yearX(l.year), TIMELINE.y + 1.0 + (i % 2) * 0.45, 0]} className="dim">
          <span style={{ color: 'var(--ice)' }}>{l.year}</span> · {l.label}
        </Label>
      ))}
      <Label index={index} delay={2.8} position={[yearX(2025) - 0.3, TIMELINE.y + 3.9, 0]} center={false} style={{ transform: 'translate(-100%, -50%)', textAlign: 'right', lineHeight: 1.45 }}>
        <span className="em">AI → the next shift in work</span>
        <br />
        <span style={{ color: 'var(--paper-dim)' }}>illustrative impact, not data</span>
      </Label>
      {([[1900, '1900'], [2000, '2000'], [2025, 'Today']] as const).map(([y, t], i) => (
        <Label key={y} index={index} delay={1.3 + i * 0.12} position={[yearX(y) - (y === 2025 ? 0.2 : 0), TIMELINE.y - 0.75, 0]} style={{ opacity: 0.6 }}>
          {t}
        </Label>
      ))}
    </group>
  )
}

export const revolution: SlideDef = {
  id: 'revolution',
  label: 'The last revolution',
  act: 'I · The shock',
  formation: 'timeline',
  camera: { pos: [0, 0.5, 18.5], look: [0, 0.2, 0] },
  tint: '#2b2030',
  Scene: RevolutionScene,
  Overlay: () => (
    <>
      <Eyebrow>Early 1900s versus today</Eyebrow>
      <h1 className="h1" style={{ marginTop: 'calc(var(--u) * 1.6)', maxWidth: 'calc(var(--u) * 62)' }}>
        <Words text="No one in this room has lived through a revolution that *remakes daily life and work.*" d={0.15} step={0.05} />
      </h1>
      <div style={{ position: 'absolute', right: 'calc(var(--u) * 5.2)', top: 'calc(var(--u) * 7.4)', width: 'calc(var(--u) * 25)' }}>
        <R d={1.6} className="body" style={{ color: 'var(--paper)' }}>
          Born around 1900? You watched flight, the car, radio and television reshape daily life within fifty years.
        </R>
        <R d={2.0} className="body" style={{ marginTop: 'calc(var(--u) * 0.8)', color: 'var(--paper)' }}>
          Computers and the internet mattered. They didn’t upend our lives in the same way.
        </R>
      </div>
      <R d={3.2} className="quote" style={{ position: 'absolute', left: 'var(--pad-x)', right: 'var(--pad-x)', bottom: 'calc(var(--u) * 4.4)', fontSize: 'calc(var(--u) * 1.85)', textAlign: 'center' }}>
        This time, almost all of us will do jobs <span className="em">very different</span> from the ones we expected.
      </R>
    </>
  ),
  notes:
    'A grandmother born in 1905 saw consumer society, cars, airplanes, radio and TV in her first fifty years. We have not lived through anything like that. What is coming: jobs radically different from what we expected. Maybe less routine, more fun, better paid, but different.',
}
