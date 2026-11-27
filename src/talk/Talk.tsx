/**
 * /watch: the deck's scenes as a film over Tyler Cowen's original audio.
 *
 * One clock drives everything: the audio's time. Each frame the driver works out which cue is on
 * screen and hands the deck's store that cue's start as `changedAt`, so every set piece, the
 * swarm and the camera are positioned by talk time. Pausing the audio pauses the film (the
 * render loop is driven manually), and seeking lands on the same frame a straight playthrough
 * would show.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas, advance } from '@react-three/fiber'
import { Look } from '../stage/Look'
import { fx } from '../stage/fx'
import { Swarm } from '../three/Swarm'
import { ReadySignal, SceneBoundary, Scenes, SlideFx } from '../deck/Deck'
import { clock, deck } from '../deck/store'
import { setProgram } from '../deck/slides'
import { labelLayer } from '../slides/common'
import { cues, cueAt } from './program'
import { media, type MediaStatus } from './media'
import { warp, ts } from './time'
import { timeline } from './timeline'
import { TalkCamera } from './TalkCamera'
import { Beats } from './Beats'
import { Captions } from './Captions'
import { Controls, StartScreen } from './Controls'
import '../deck/deck.css'
import './talk.css'

const capture = new URLSearchParams(window.location.search).has('capture')

// Install the talk's program and clock before anything renders.
setProgram(cues.map((c) => c.slide))
clock.now = () => media.t
clock.age = (index, raw, _instant, channel) => {
  const c = cues[index]
  return warp(channel === 'label' ? (c.labelWarp ?? c.warp) : c.warp, c.start, raw)
}

function hashTime() {
  const m = window.location.hash.match(/t=([\d:.]+)/)
  return m ? ts(m[1]) : 0
}

/** Moves the deck's store to the cue on screen at talk time t. */
function syncDeck(force = false) {
  const i = cueAt(media.t)
  const d = deck.get()
  const jumped = media.jumped
  media.jumped = false
  // Within a cue nothing changes here, even on a seek: every scene re-reads talk time itself.
  if (i === d.index && !force) return
  const natural = !jumped && !force && i === d.index + 1
  deck.sync({ index: i, prev: i - 1, changedAt: cues[i].start, instant: !natural })
  if (natural) fx.warp = 1
}

function useMediaStatus() {
  const [s, setS] = useState<MediaStatus>(media.status())
  useEffect(() => media.subscribe(() => setS(media.status())), [])
  return s
}

function readCaptionsPref() {
  try {
    return localStorage.getItem('talk:cc') === '1'
  } catch {
    return false
  }
}

export default function Talk() {
  const audio = useRef<HTMLAudioElement>(null)
  const [ready, setReady] = useState(false)
  const [captions, setCaptions] = useState(readCaptionsPref)
  const [idle, setIdle] = useState(false)
  const status = useMediaStatus()
  const resumeAt = useMemo(hashTime, [])

  // Clock, deck store and the manual render loop.
  useEffect(() => {
    deck.setCount(cues.length)
    media.t = resumeAt
    syncDeck(true)
    timeline.emit(media.t)
    if (audio.current) media.attach(audio.current)
    if (resumeAt && audio.current) audio.current.currentTime = resumeAt

    let raf = 0
    let last = performance.now()
    let ambient = 0
    let settleUntil = 0
    let wasPlaying = false
    let lastT = media.t
    const onResize = () => (settleUntil = Math.max(settleUntil, performance.now() + 120))
    window.addEventListener('resize', onResize)
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      media.frame(now / 1000)
      const s = media.status()
      // When paused, the film freezes; after a seek it renders ~1.5 s so damped motion settles.
      if (media.t !== lastT && !s.playing) settleUntil = now + 1500
      if (wasPlaying && !s.playing) settleUntil = now + 80
      wasPlaying = s.playing
      lastT = media.t
      syncDeck()
      timeline.emit(media.t)
      const live = s.playing || !s.started || capture || now < settleUntil
      if (live) {
        ambient += dt
        advance(ambient)
      }
    }
    raf = requestAnimationFrame(loop)

    window.__talk = {
      seek: (t: number | string) => media.seek(ts(t)),
      get t() {
        return media.t
      },
      get audioTime() {
        return media.el?.currentTime ?? -1
      },
      get index() {
        return deck.get().index
      },
      cues: cues.map((c) => ({ id: c.id, chapter: c.chapter, start: c.start })),
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [resumeAt])

  // Fonts first: some formations rasterize Fraunces glyphs into particles.
  useEffect(() => {
    Promise.all([
      document.fonts.load('600 100px Fraunces'),
      document.fonts.load('300 100px Fraunces'),
      document.fonts.load('italic 300 100px Fraunces'),
      document.fonts.load('400 100px "Geist Sans"'),
      document.fonts.load('400 100px "Geist Mono"'),
    ]).finally(() => setReady(true))
  }, [])

  // Keyboard.
  useEffect(() => {
    const chapterJump = (dir: 1 | -1) => {
      const i = cueAt(media.t)
      if (dir < 0 && media.t - cues[i].start > 3) return media.seek(cues[i].start)
      const j = Math.max(0, Math.min(cues.length - 1, i + dir))
      media.seek(cues[j].start)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === ' ' || k === 'k' || k === 'K') {
        e.preventDefault()
        media.toggle()
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) chapterJump(k === 'ArrowRight' ? 1 : -1)
        else media.seek(media.t + (k === 'ArrowRight' ? 5 : -5))
      } else if (k === 'l' || k === 'L' || k === 'j' || k === 'J') media.seek(media.t + (k.toLowerCase() === 'l' ? 10 : -10))
      else if (k === 'PageDown' || k === ']') chapterJump(1)
      else if (k === 'PageUp' || k === '[') chapterJump(-1)
      else if (k === 'Home') media.seek(0)
      else if (k === 'End') media.seek(media.duration - 1)
      else if (k === 'c' || k === 'C') setCaptions((v) => !v)
      else if (k === 'm' || k === 'M') media.setMuted(!media.status().muted)
      else if (k === 'f' || k === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen().catch(() => {})
      } else if (/^[0-9]$/.test(k)) media.seek((Number(k) / 10) * media.duration)
      else return
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('talk:cc', captions ? '1' : '0')
    } catch {
      /* private mode */
    }
  }, [captions])

  // Chrome hides after a few still seconds while playing.
  const idleTimer = useRef(0)
  const poke = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2600)
  }
  useEffect(() => {
    window.addEventListener('pointermove', poke)
    return () => window.removeEventListener('pointermove', poke)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chromeVisible = !capture && status.started && (!status.playing || !idle)
  return (
    <div className={`talk ${chromeVisible || !status.playing ? '' : 'no-cursor'} ${capture ? 'capture' : ''}`} style={{ '--cc-lift': chromeVisible ? 1 : 0 } as CSSProperties}>
      <audio ref={audio} preload="auto" playsInline>
        <source src="../audio/talk.webm" type="audio/webm; codecs=opus" />
        <source src="../audio/talk.m4a" type="audio/mp4" />
      </audio>
      <div className="labels" ref={(el) => void (el && (labelLayer.current = el))} />
      <div className="stage">
        {ready && (
          <Canvas
            frameloop="never"
            dpr={capture ? 1 : [1, 2]}
            gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: capture }}
            camera={{ fov: 38, near: 0.1, far: 3000, position: [0, 0, 16] }}
          >
            <Look />
            <SlideFx />
            <TalkCamera />
            <SceneBoundary name="swarm">
              <Swarm />
            </SceneBoundary>
            <Suspense fallback={null}>
              <Scenes />
            </Suspense>
            <ReadySignal />
          </Canvas>
        )}
      </div>
      <div
        className="click-zone"
        onClick={() => {
          if (!status.started || capture) return
          media.toggle()
          poke()
        }}
        onDoubleClick={() => {
          if (capture) return
          if (document.fullscreenElement) document.exitFullscreen()
          else document.documentElement.requestFullscreen().catch(() => {})
        }}
      />
      {ready && <Beats onReplay={() => (media.seek(0), media.play())} />}
      <Captions on={captions && !capture} />
      {!capture && <StartScreen show={!status.started} resumeAt={resumeAt} />}
      {ready && !capture && <Controls status={status} visible={chromeVisible} captions={captions} onCaptions={() => setCaptions((v) => !v)} />}
      <div className={`loading ${ready ? 'gone' : ''}`}>Loading</div>
    </div>
  )
}

declare global {
  interface Window {
    __talk?: { seek: (t: number | string) => void; readonly t: number; readonly audioTime: number; readonly index: number; cues: { id: string; chapter: string; start: number }[] }
  }
}
