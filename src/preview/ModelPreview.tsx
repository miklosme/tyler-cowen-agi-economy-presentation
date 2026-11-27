/**
 * Model harness: /?model=<Name>&progress=1&az=30&el=12&dist=6&variant=x&animate=1&capture=1
 *
 * Renders one model from src/models on the deck's exact look (sky, lights, bloom, grain)
 * so it can be judged in context. `capture=1` hides the HUD and sets window.__ready once
 * the model has rendered a few frames. `animate=1` plays progress 0 -> 1 over 2.4 s.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Look } from '../stage/Look'
import type { ModelMeta, ModelProps } from '../models/types'

type ModelModule = { default: ComponentType<ModelProps>; meta?: ModelMeta }
const modules = import.meta.glob<ModelModule>('../models/*.tsx')

function nameOf(path: string) {
  return path.replace('../models/', '').replace('.tsx', '')
}

declare global {
  interface Window {
    __ready?: boolean
    __deck?: unknown
  }
}

function ReadyAfterFrames({ frames = 30 }: { frames?: number }) {
  const n = useRef(0)
  useFrame(() => {
    n.current++
    if (n.current === frames) window.__ready = true
  })
  return null
}

function Rig({ az, el, dist }: { az: number; el: number; dist: number }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const a = (az * Math.PI) / 180
    const e = (el * Math.PI) / 180
    camera.position.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist)
    camera.lookAt(0, 0, 0)
  }, [camera, az, el, dist])
  return null
}

function Animated({ Model, variant, animate, progress }: { Model: ComponentType<ModelProps>; variant?: string; animate: boolean; progress: number }) {
  const [p, setP] = useState(animate ? 0 : progress)
  const start = useRef<number | null>(null)
  useFrame((state) => {
    if (!animate) return
    if (start.current === null) start.current = state.clock.elapsedTime
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 2.4)
    setP(t)
  })
  return <Model progress={animate ? p : progress} variant={variant} />
}

export default function ModelPreview() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const name = params.get('model') ?? ''
  const capture = params.has('capture')
  const entry = Object.entries(modules).find(([p]) => nameOf(p) === name)
  const [meta, setMeta] = useState<ModelMeta | undefined>()

  const Model = useMemo(() => {
    if (!entry) return null
    return lazy(async () => {
      const mod = await entry[1]()
      setMeta(mod.meta)
      return { default: mod.default }
    })
  }, [entry?.[0]])

  if (!entry || !Model) {
    return (
      <div style={{ color: '#ddd', font: '14px/1.6 monospace', padding: 32 }}>
        <p>Unknown model "{name}". Available:</p>
        <ul>
          {Object.keys(modules).map((p) => (
            <li key={p}>
              <a style={{ color: '#ffb547' }} href={`?model=${nameOf(p)}`}>{nameOf(p)}</a>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const az = Number(params.get('az') ?? meta?.azimuth ?? 28) + Number(params.get('azoff') ?? 0)
  const el = Number(params.get('el') ?? meta?.elevation ?? 14) + Number(params.get('eloff') ?? 0)
  const dist = Number(params.get('dist') ?? meta?.distance ?? 6.5)
  const progress = Number(params.get('progress') ?? 1)
  const animate = params.get('animate') === '1'
  const variant = params.get('variant') ?? undefined

  return (
    <>
      <Canvas
        dpr={capture ? 1 : [1, 2]}
        gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture }}
        camera={{ fov: 35, near: 0.05, far: 2000, position: [0, 1, dist] }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Look />
        <Rig az={az} el={el} dist={dist} />
        <Suspense fallback={null}>
          <Animated Model={Model} variant={variant} animate={animate} progress={progress} />
          <ReadyAfterFrames frames={animate ? 200 : 45} />
        </Suspense>
        {!capture && <OrbitControls makeDefault target={[0, 0, 0]} />}
      </Canvas>
      {!capture && (
        <div style={{ position: 'fixed', left: 16, bottom: 16, color: '#bbb', font: '12px/1.5 monospace', pointerEvents: 'none' }}>
          {meta?.title ?? name} · progress {progress} · drag to orbit
        </div>
      )}
    </>
  )
}
