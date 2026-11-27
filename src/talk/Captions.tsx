/** Optional closed captions (C), from the talk's English caption track. Off by default. */
import vtt from '../../source/talk.en.vtt?raw'
import { useAt } from './timeline'

type CaptionCue = { start: number; end: number; text: string }

const TIME = /(\d+):(\d+):(\d+)\.(\d+) --> (\d+):(\d+):(\d+)\.(\d+)/

function parse(src: string): CaptionCue[] {
  const out: CaptionCue[] = []
  for (const block of src.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => TIME.test(l))
    if (i < 0) continue
    const m = lines[i].match(TIME)!.slice(1).map(Number)
    const start = m[0] * 3600 + m[1] * 60 + m[2] + m[3] / 1000
    const end = m[4] * 3600 + m[5] * 60 + m[6] + m[7] / 1000
    const text = lines.slice(i + 1).join(' ').trim()
    if (text) out.push({ start, end, text })
  }
  return out
}

const CUES = parse(vtt)

function activeCue(t: number) {
  for (let i = 0; i < CUES.length; i++) {
    if (CUES[i].start > t) break
    // Bridge short gaps so the line doesn't flicker between phrases.
    const end = Math.max(CUES[i].end, Math.min((CUES[i + 1]?.start ?? Infinity) - 0.05, CUES[i].end + 0.6))
    if (t < end) return i
  }
  return -1
}

export function Captions({ on }: { on: boolean }) {
  const i = useAt((t) => (on ? activeCue(t) : -1))
  if (i < 0) return null
  return (
    <div className="cc" aria-live="off">
      <span>{CUES[i].text}</span>
    </div>
  )
}
