/**
 * The talk's master clock. Wraps the <audio> element and turns its coarse `currentTime` into a
 * smooth per-frame time that every scene, the camera and the text layer read. If the audio
 * can't load, it falls back to a silent virtual clock so the visuals still play.
 */
import { TALK_DURATION } from './time'

type Listener = () => void

export type MediaStatus = {
  playing: boolean
  /** True once the viewer has pressed play (autoplay with sound needs a gesture). */
  started: boolean
  ended: boolean
  buffering: boolean
  muted: boolean
  /** The audio failed to load; the clock runs silently. */
  silent: boolean
}

const listeners = new Set<Listener>()
let status: MediaStatus = { playing: false, started: false, ended: false, buffering: false, muted: false, silent: false }

function setStatus(patch: Partial<MediaStatus>) {
  const next = { ...status, ...patch }
  if ((Object.keys(next) as (keyof MediaStatus)[]).every((k) => next[k] === status[k])) return
  status = next
  listeners.forEach((l) => l())
}

export const media = {
  el: null as HTMLAudioElement | null,
  /** Smoothed talk time in seconds. */
  t: 0,
  duration: TALK_DURATION,
  /** Set when time jumps (seek, tab wake-up); the driver snaps instead of flying. */
  jumped: true,
  lastFrame: 0,

  status: () => status,
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },

  attach(el: HTMLAudioElement) {
    media.el = el
    const sync = () =>
      setStatus({
        playing: status.silent ? status.playing : !el.paused && !el.ended,
        ended: el.ended,
        muted: el.muted,
      })
    el.addEventListener('play', sync)
    el.addEventListener('pause', sync)
    el.addEventListener('ended', sync)
    el.addEventListener('volumechange', sync)
    el.addEventListener('waiting', () => setStatus({ buffering: true }))
    el.addEventListener('playing', () => setStatus({ buffering: false }))
    el.addEventListener('canplay', () => setStatus({ buffering: false }))
    el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(el.duration) && el.duration > 0) media.duration = el.duration
      if (Math.abs(el.currentTime - media.t) > 0.05) el.currentTime = media.t
    })
    // All <source>s failed: run the visuals on a silent clock instead.
    const last = el.querySelector('source:last-of-type')
    last?.addEventListener('error', () => setStatus({ silent: true, buffering: false }))
    el.addEventListener('error', () => setStatus({ silent: true, buffering: false }))
  },

  play() {
    setStatus({ started: true, ended: false })
    if (media.t >= media.duration - 0.05) media.seek(0)
    if (status.silent || !media.el) {
      setStatus({ playing: true })
      return
    }
    media.el.play().catch((e: unknown) => {
      // Autoplay refusal leaves us paused; a load failure falls back to the silent clock.
      if (e instanceof DOMException && e.name === 'NotAllowedError') return
      setStatus({ silent: true, playing: true })
    })
  },
  pause() {
    if (status.silent || !media.el) setStatus({ playing: false })
    else media.el.pause()
  },
  toggle() {
    if (status.playing) media.pause()
    else media.play()
  },
  seek(t: number) {
    const next = Math.max(0, Math.min(media.duration - 0.01, t))
    media.t = next
    media.jumped = true
    if (media.el && !status.silent) media.el.currentTime = next
    setStatus({ ended: false })
  },
  setMuted(m: boolean) {
    if (media.el) media.el.muted = m
  },

  /** Advance the clock. Call once per animation frame with performance.now() / 1000. */
  frame(now: number) {
    const dt = media.lastFrame ? Math.min(0.25, now - media.lastFrame) : 0
    const gap = media.lastFrame ? now - media.lastFrame : 0
    media.lastFrame = now
    const el = media.el
    if (status.silent || !el) {
      if (status.playing) {
        media.t += dt
        if (gap > 0.25) media.jumped = true
        if (media.t >= media.duration) {
          media.t = media.duration
          setStatus({ playing: false, ended: true })
        }
      }
      return
    }
    const actual = el.currentTime
    if (el.paused || el.seeking || el.readyState < 3) {
      if (!el.seeking && Math.abs(actual - media.t) > 1e-3) {
        if (Math.abs(actual - media.t) > 0.3) media.jumped = true
        media.t = actual
      }
      return
    }
    // Playing: run on the frame clock, nudged toward the element's time; snap on big drift
    // (e.g. a background tab that stopped animation frames while the audio kept going).
    const predicted = media.t + dt * el.playbackRate
    const drift = actual - predicted
    if (Math.abs(drift) > 0.3) {
      media.t = actual
      media.jumped = true
    } else media.t = predicted + drift * 0.08
  },
}
