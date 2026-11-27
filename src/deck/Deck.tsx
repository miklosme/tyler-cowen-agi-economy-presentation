import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { Look } from '../stage/Look'
import { fx } from '../stage/fx'
import { Swarm } from '../three/Swarm'
import { CameraRig } from './CameraRig'
import { deck, useDeck } from './store'
import { flightSeconds, slides, stationOf } from './slides'
import { labelLayer } from '../slides/common'
import { SlideNumber, SlidePhase } from './Text'
import './deck.css'

const capture = new URLSearchParams(window.location.search).has('capture')

function hashIndex() {
  const m = window.location.hash.match(/#\/(\d+)/)
  return m ? Number(m[1]) : 0
}

export function ReadySignal() {
  const n = useRef(0)
  const frames = useRef<number[]>([])
  useFrame(({ gl, scene }) => {
    ;(window as unknown as { __scene: unknown }).__scene = scene
    n.current++
    if (n.current === 40) window.__ready = true
    const now = performance.now()
    frames.current.push(now)
    while (frames.current.length && now - frames.current[0] > 1000) frames.current.shift()
    ;(window as unknown as { __diag: unknown }).__diag = {
      fps: frames.current.length,
      lost: gl.getContext().isContextLost(),
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      geos: gl.info.memory.geometries,
      tex: gl.info.memory.textures,
      progs: gl.info.programs?.length,
    }
  })
  return null
}

/** Keeps one failing set piece from unmounting the whole WebGL tree. */
export class SceneBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(e: unknown) {
    console.error(`scene ${this.props.name} crashed`, e)
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

export function SlideFx() {
  const d = useDeck()
  useEffect(() => {
    const s = slides[d.index]
    fx.tint.set(s.tint ?? '#1a1f3a')
    fx.bloomBoost = s.bloom ?? 0
  }, [d.index])
  return null
}

/**
 * Set pieces mount the first time their slide comes within two steps and then stay mounted
 * (hidden when far away). Never unmounting avoids drei <Html>'s React 19 unmount race and
 * means shaders compile once, not on every revisit.
 */
export function Scenes() {
  const d = useDeck()
  const seen = useRef(new Set<number>())
  for (const i of [d.index - 1, d.index, d.index + 1, d.index + 2, d.prev]) if (i >= 0 && i < slides.length) seen.current.add(i)
  const near = (i: number) => Math.abs(i - d.index) <= 1 || i === d.prev
  // The upcoming slide stays rendered (so its shaders are compiled before we fly there) but
  // shrunk to nothing: otherwise its props show up as stray specks far down the flight path.
  const staged = (i: number) => i !== d.index && i !== d.prev
  return (
    <>
      {[...seen.current].sort((a, b) => a - b).map((i) => {
        const S = slides[i].Scene
        if (!S) return null
        return (
          <group key={slides[i].id} position={stationOf(i)} visible={near(i)} scale={staged(i) ? 1e-4 : 1}>
            <SceneBoundary name={slides[i].id}>
              <Suspense fallback={null}>
                <S index={i} />
              </Suspense>
            </SceneBoundary>
          </group>
        )
      })}
    </>
  )
}

function Overlays() {
  const d = useDeck()
  const [exiting, setExiting] = useState<number | null>(null)
  const prevIndex = useRef(d.index)
  useEffect(() => {
    if (prevIndex.current !== d.index) {
      setExiting(prevIndex.current)
      prevIndex.current = d.index
      const t = setTimeout(() => setExiting(null), 650)
      return () => clearTimeout(t)
    }
  }, [d.index])
  const base = d.instant ? 0.15 : flightSeconds(d.prev, d.index) * 0.44
  return (
    <div className="overlay">
      <div className="frame">
        {exiting !== null && exiting !== d.index && (
          <div className="slide" data-state="exit" key={`x${exiting}`}>
            <SlidePhase.Provider value="exit">
              <SlideNumber.Provider value={exiting}>
                {(() => {
                  const O = slides[exiting].Overlay
                  return <O index={exiting} />
                })()}
              </SlideNumber.Provider>
            </SlidePhase.Provider>
          </div>
        )}
        <div className="slide" data-state="enter" key={`e${d.index}-${d.changedAt}`} style={{ '--base': `${base}s` } as CSSProperties}>
          <SlideNumber.Provider value={d.index}>
            {(() => {
              const O = slides[d.index].Overlay
              return <O index={d.index} />
            })()}
          </SlideNumber.Provider>
        </div>
      </div>
    </div>
  )
}

function Hud({ notes }: { notes: boolean }) {
  const d = useDeck()
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (d.index > 0) setTouched(true)
  }, [d.index])
  const s = slides[d.index]
  return (
    <div className="hud">
      <div className="hud-top">
        <span className="brand" style={{ opacity: d.index === 0 || d.index === slides.length - 1 ? 0 : 1, transition: 'opacity 0.8s' }}>
          <i />
          The AGI Economy
        </span>
        <span>{s.act}</span>
      </div>
      <div className="hud-bottom">
        <span>
          {String(d.index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
        <div className="ticks">
          {slides.map((sl, i) => (
            <span key={sl.id} className={i < d.index ? 'done' : i === d.index ? 'on' : ''} />
          ))}
        </div>
        {!capture && <span className={`hints ${touched ? 'gone' : ''}`}>← → · F fullscreen · N notes</span>}
      </div>
      {notes && s.notes && <div className="notes">{s.notes}</div>}
    </div>
  )
}

export default function Deck() {
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState(false)

  useEffect(() => {
    deck.setCount(slides.length)
    deck.go(hashIndex(), { instant: true })
    window.__deck = {
      count: slides.length,
      go: (i: number, o?: { instant?: boolean }) => deck.go(i, o),
      get index() {
        return deck.get().index
      },
    }
    Promise.all([
      document.fonts.load('600 100px Fraunces'),
      document.fonts.load('300 100px Fraunces'),
      document.fonts.load('italic 300 100px Fraunces'),
      document.fonts.load('400 100px "Geist Sans"'),
      document.fonts.load('400 100px "Geist Mono"'),
    ]).finally(() => setReady(true))

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(k)) {
        e.preventDefault()
        deck.next()
      } else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(k)) {
        e.preventDefault()
        deck.back()
      } else if (k === 'Home') deck.go(0)
      else if (k === 'End') deck.go(slides.length - 1)
      else if (k === 'f' || k === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen().catch(() => {})
      } else if (k === 'n' || k === 'N') setNotes((v) => !v)
    }
    const onHash = () => {
      const i = hashIndex()
      if (i !== deck.get().index) deck.go(i)
    }
    let touchX: number | null = null
    const onTouchStart = (e: TouchEvent) => (touchX = e.touches[0].clientX)
    const onTouchEnd = (e: TouchEvent) => {
      if (touchX === null) return
      const dx = e.changedTouches[0].clientX - touchX
      if (Math.abs(dx) > 40) (dx < 0 ? deck.next : deck.back)()
      touchX = null
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <>
      <div className="labels" ref={(el) => void (el && (labelLayer.current = el))} />
      <div className="stage">
        {ready && (
          <Canvas
            dpr={capture ? 1 : [1, 2]}
            gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: capture }}
            camera={{ fov: 38, near: 0.1, far: 3000, position: [0, 0, 16] }}
          >
            <Look />
            <SlideFx />
            <CameraRig capture={capture} />
            <SceneBoundary name="swarm">
              <Swarm />
            </SceneBoundary>
            <Scenes />
            {!capture && <AdaptiveDpr pixelated={false} />}
            <ReadySignal />
          </Canvas>
        )}
      </div>
      <div
        className="click-zone"
        onClick={(e) => {
          if (e.clientX < window.innerWidth * 0.3) deck.back()
          else deck.next()
        }}
      />
      {ready && <Overlays />}
      {ready && <Hud notes={notes} />}
      <div className={`loading ${ready ? 'gone' : ''}`}>Loading</div>
    </>
  )
}
