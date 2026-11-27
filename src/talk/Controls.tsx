/** Player chrome: start screen, chapter scrubber, play/pause, captions and fullscreen. */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cues, cueAt } from './program'
import { media, type MediaStatus } from './media'
import { fmt } from './time'
import { timeline, useAt } from './timeline'

function Icon({ name }: { name: 'play' | 'pause' | 'cc' | 'full' | 'exit-full' | 'sound' | 'muted' }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'play':
      return (
        <svg {...p}>
          <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...p}>
          <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
          <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'cc':
      return (
        <svg {...p}>
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" />
        </svg>
      )
    case 'full':
      return (
        <svg {...p}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      )
    case 'exit-full':
      return (
        <svg {...p}>
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      )
    case 'sound':
      return (
        <svg {...p}>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
          <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
        </svg>
      )
    case 'muted':
      return (
        <svg {...p}>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        </svg>
      )
  }
}

function Scrubber() {
  const track = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const dragging = useRef(false)
  useEffect(
    () =>
      timeline.subscribe(() => {
        if (fill.current) fill.current.style.transform = `scaleX(${timeline.get() / media.duration})`
      }),
    [],
  )
  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * media.duration
  }
  const onDown = (e: ReactPointerEvent) => {
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    media.seek(timeAt(e.clientX))
  }
  const onMove = (e: ReactPointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    setHover({ x: e.clientX - r.left, t: timeAt(e.clientX) })
    if (dragging.current) media.seek(timeAt(e.clientX))
  }
  const ends = cues.map((c, i) => (i + 1 < cues.length ? cues[i + 1].start : media.duration))
  return (
    <div
      className="scrub"
      ref={track}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => !dragging.current && setHover(null)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(media.duration)}
    >
      <div className="scrub-segs">
        {cues.map((c, i) => (
          <span key={c.id} style={{ flexGrow: ends[i] - c.start }} />
        ))}
      </div>
      <div className="scrub-fill-clip">
        <div className="scrub-fill" ref={fill} />
      </div>
      <div className="scrub-segs gaps" aria-hidden>
        {cues.map((c, i) => (
          <span key={c.id} style={{ flexGrow: ends[i] - c.start }} />
        ))}
      </div>
      {hover && (
        <div className="scrub-tip" style={{ left: hover.x }}>
          <b>{cues[cueAt(hover.t)].chapter}</b>
          <span>{fmt(hover.t)}</span>
        </div>
      )}
    </div>
  )
}

function Clock() {
  const s = useAt((t) => Math.floor(t))
  return (
    <span className="clock">
      {fmt(s)} <span>/ {fmt(media.duration)}</span>
    </span>
  )
}

function Chapter() {
  const i = useAt(cueAt)
  return (
    <span className="chapter">
      <span className="num">{String(i).padStart(2, '0')}</span>
      {cues[i].chapter}
    </span>
  )
}

export function Controls({ status, visible, captions, onCaptions }: { status: MediaStatus; visible: boolean; captions: boolean; onCaptions: () => void }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const blur = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).blur()
  return (
    <div className={`chrome ${visible ? '' : 'hidden'}`} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="bar-top">
        <a className="brand" href="../" title="Open the slide deck version">
          <i />
          The AGI Economy
        </a>
        <Chapter />
      </div>
      <div className="bar-bottom">
        <Scrubber />
        <div className="row">
          <button type="button" className="icon" onClick={(e) => (blur(e), media.toggle())} aria-label={status.playing ? 'Pause' : 'Play'} title={status.playing ? 'Pause (space)' : 'Play (space)'}>
            <Icon name={status.playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="icon" onClick={(e) => (blur(e), media.setMuted(!status.muted))} aria-label={status.muted ? 'Unmute' : 'Mute'} title="Mute (M)">
            <Icon name={status.muted ? 'muted' : 'sound'} />
          </button>
          <Clock />
          {status.silent && <span className="notice">Audio file missing · run “bun run audio” · playing silently</span>}
          {status.buffering && status.playing && <span className="notice">Buffering…</span>}
          <span className="spacer" />
          <button type="button" className={`icon ${captions ? 'on' : ''}`} onClick={(e) => (blur(e), onCaptions())} aria-pressed={captions} aria-label="Captions" title="Captions (C)">
            <Icon name="cc" />
          </button>
          <button
            type="button"
            className="icon"
            onClick={(e) => {
              blur(e)
              if (document.fullscreenElement) document.exitFullscreen()
              else document.documentElement.requestFullscreen().catch(() => {})
            }}
            aria-label="Fullscreen"
            title="Fullscreen (F)"
          >
            <Icon name={full ? 'exit-full' : 'full'} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Before the first play: the title is on screen; this adds the play button. */
export function StartScreen({ show, resumeAt }: { show: boolean; resumeAt: number }) {
  return (
    <div className={`start ${show ? '' : 'gone'}`}>
      <button type="button" className="start-play" onClick={(e) => (e.stopPropagation(), media.play())} aria-label="Play the talk">
        <span className="ring">
          <Icon name="play" />
        </span>
        <span className="start-label">
          {resumeAt > 1 ? `Play from ${fmt(resumeAt)}` : 'Play the talk'}
          <small>{fmt(media.duration)} · sound on</small>
        </span>
      </button>
      <p className="start-credit">Tyler Cowen · Sana AI Summit 2026</p>
    </div>
  )
}
