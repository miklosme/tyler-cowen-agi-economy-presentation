/**
 * The talk, cue by cue. Each cue puts one of the deck's scenes on screen at a moment in Tyler
 * Cowen's audio, frames it with camera shots, and warps the scene's own build timeline so its
 * beats (a needle moving, a label appearing, an arc being drawn) land on the words.
 *
 * All times are talk time ("m:ss.s" into the audio). Camera positions are station-local, like a
 * slide's `camera`.
 */
import type { SlideDef, V3 } from '../deck/types'
import { revolution, title, twoTruths } from '../slides/act1'
import { engines, projects, status } from '../slides/act2'
import { bottleneck, debt, doneBefore, number, planA, slow40, sticky } from '../slides/act3'
import { camps, close, health, losers, physical, winners, workHarder } from '../slides/act4'
import { CampsTalkScene, SlowSectorsScene, WinnersTalkScene } from './scenes'
import { ts } from './time'

type T = string | number

export type Framing = {
  pos: V3
  look: V3
  fov?: number
  /** Slow push toward the look point, as a fraction of the distance per second. */
  push?: number
  /** Slow orbit around the look point, radians per second. */
  orbit?: number
}
export type Shot = Framing & { at: number; /** Seconds to move into this shot. */ move: number }

export type Cue = {
  id: string
  chapter: string
  start: number
  slide: SlideDef
  base: Framing
  shots: Shot[]
  /** [talk time, scene age] keyframes for the scene's set piece. */
  warp?: [number, number][]
  /** Separate keyframes for the scene's 3D labels; defaults to `warp`. */
  labelWarp?: [number, number][]
}

type CueSpec = {
  chapter: string
  start: T
  slide: SlideDef
  id?: string
  base?: Partial<Framing>
  shots?: (Partial<Framing> & { at: T; move?: number })[]
  warp?: [T, number][]
  labelWarp?: [T, number][]
}

const DEFAULT_PUSH = 0.0016

function cue(s: CueSpec): Cue {
  const c = s.slide.camera ?? {}
  const base: Framing = {
    pos: s.base?.pos ?? c.pos ?? [0, 0, 14.5],
    look: s.base?.look ?? c.look ?? [0, 0, 0],
    fov: s.base?.fov ?? c.fov ?? 38,
    push: s.base?.push ?? DEFAULT_PUSH,
    orbit: s.base?.orbit ?? 0,
  }
  const id = s.id ?? s.slide.id
  const conv = (w?: [T, number][]) => w?.map(([t, a]) => [ts(t), a] as [number, number])
  let prev = base
  const shots = (s.shots ?? []).map((sh) => {
    const shot: Shot = {
      at: ts(sh.at),
      move: sh.move ?? 4,
      pos: sh.pos ?? prev.pos,
      look: sh.look ?? prev.look,
      fov: sh.fov ?? prev.fov,
      push: sh.push ?? DEFAULT_PUSH,
      orbit: sh.orbit ?? 0,
    }
    prev = shot
    return shot
  })
  return {
    id,
    chapter: s.chapter,
    start: ts(s.start),
    slide: s.id ? { ...s.slide, id } : s.slide,
    base,
    shots,
    warp: conv(s.warp),
    labelWarp: conv(s.labelWarp),
  }
}

const HOLD = Infinity

export const cues: Cue[] = [
  cue({ chapter: 'The AGI Economy', start: 0, slide: title, base: { push: 0.0022 } }),

  cue({
    chapter: 'Optimism & realism',
    start: '0:10.5',
    slide: twoTruths,
    // The cold heap of "benefits still arriving" only piles up once realism comes in.
    warp: [['0:12.7', 2.2], ['0:36.2', 2.2], ['0:47.5', 9.2]],
    labelWarp: [['0:43.4', 3.15]],
  }),

  cue({
    chapter: 'The last revolution',
    start: '0:51.5',
    slide: revolution,
    // Her inventions build as he lists them: consumer society, cars, airplanes, radio, TV.
    warp: [['0:52.65', 1.15], ['1:05.0', 1.19], ['1:10.4', 3.4]],
    // 1900 at "born in 1905"; the inventions with the list; PC and web with "the internet was
    // a change"; the AI curve at "but what is coming".
    labelWarp: [['1:02.6', 1.28], ['1:03.4', 1.39], ['1:05.9', 1.39], ['1:09.6', 2.2], ['1:16.6', 2.2], ['1:17.6', 2.6], ['1:22.5', 2.62], ['1:23.5', 3.05]],
    shots: [{ at: '1:37.3', pos: [3.2, 0.9, 16.2], look: [4.2, 0.5, 0], move: 6 }],
  }),

  cue({
    chapter: 'Status, remixed',
    start: '1:54.0',
    slide: status,
    base: { pos: [2.4, 0.7, 14.6], look: [2.4, 0.4, 0] },
    // The old ladder builds step by step as he climbs it ("very smart, good school, worked hard,
    // followed the rules … partner, $2 million"), then breaks on "the people who might lose",
    // and "take initiative" lights up on "the people who will win".
    warp: [
      ['1:55.0', 1.0],
      ['1:57.3', 1.1],
      ['1:59.2', 1.3],
      ['2:00.3', 1.5],
      ['2:01.3', 1.7],
      ['2:06.2', 1.9],
      ['2:07.5', 2.7],
      ['2:13.8', 4.6],
      ['2:15.0', 5.6],
      ['2:16.2', 6.2],
    ],
    shots: [
      { at: '2:32.8', pos: [2.7, 0.5, 12.6], look: [2.9, 0.3, 0], move: 6 },
      { at: '2:39.4', pos: [3.7, -0.3, 9.6], look: [4.0, -0.9, 0], move: 4 },
      { at: '2:50.0', pos: [2.0, 1.7, 16.0], look: [2.2, 0.3, 0], move: 7 },
    ],
  }),

  cue({
    chapter: 'More projects',
    start: '3:03.5',
    slide: projects,
    // New work starts popping up on "many, many more projects".
    warp: [['3:05.35', 1.85], ['3:11.8', 1.9]],
    shots: [{ at: '3:17.6', pos: [0, 2.0, 6.5], look: [0, 0.5, -14], move: 9 }],
  }),

  cue({
    chapter: 'New job engines',
    start: '3:28.7',
    slide: engines,
    shots: [
      { at: '3:37.0', pos: [-5.6, 1.0, 7.0], look: [-5.6, 0.3, 0], move: 3.5 },
      { at: '4:18.8', pos: [0, 1.0, 7.0], look: [0, 0.3, 0], move: 3.5 },
      { at: '4:53.1', pos: [5.6, 1.0, 7.0], look: [5.6, 0.3, 0], move: 3.5 },
      { at: '5:07.4', pos: [0, 1.4, 16.5], look: [0, 0.3, 0], move: 5 },
      { at: '5:20.7', pos: [0, 3.2, 18.5], look: [0, 0.0, 0], move: 12 },
    ],
  }),

  cue({
    chapter: 'Live long enough',
    start: '5:44.3',
    slide: health,
    // "Today … +30 to 40 years" on "over the next 30 to 40 years", then the killers get struck
    // through on "most of the things that kill you, we will fix".
    labelWarp: [['6:18.9', 1.35], ['6:20.3', 1.62], ['6:22.4', 2.4]],
    base: { pos: [3.0, 0.5, 12.4], look: [3.6, 0.3, 0] },
    shots: [
      { at: '6:17.0', pos: [0, 0, 14.5], look: [0, 0, 0], move: 4 },
      { at: '7:13.1', pos: [3.6, 0.7, 9.8], look: [4.7, 0.4, 0], move: 7 },
      { at: '7:33.7', pos: [0, 0.2, 15.5], look: [0, 0, 0], move: 6 },
    ],
  }),

  cue({
    chapter: '2% → 2.5%',
    start: '7:45.2',
    slide: number,
    // The dial waits, empty, through "Silicon Valley thinks I'm crazy"; the needle swings to 2%
    // on "about 2%" and on to 2.5% on "to about 2.5%". The off-the-dial dreams stay hidden.
    warp: [['7:46.05', 0.85], ['8:04.6', 0.85], ['8:05.0', 1.0], ['8:05.9', 1.9], ['8:07.3', 2.6], ['8:08.65', 3.95], [HOLD, 3.95]],
  }),

  cue({
    chapter: 'Human bottlenecks',
    start: '8:19.0',
    slide: bottleneck,
    base: { pos: [-3.4, 0.1, 12.6], look: [-3.6, -0.2, 0] },
    shots: [
      { at: '8:39.6', pos: [-0.4, 0.2, 14.2], look: [-0.4, 0, 0], move: 3 },
      { at: '8:53.0', pos: [-4.4, 0.2, 9.4], look: [-4.4, -0.1, 0], move: 6 },
      { at: '9:15.2', pos: [-2.0, 0.3, 13.2], look: [-3.0, 0, 0], move: 5 },
    ],
  }),

  cue({
    id: 'number-again',
    chapter: 'Off the dial',
    start: '9:22.5',
    slide: number,
    base: { pos: [1.0, -0.4, 13.4], look: [0.8, 0, 0] },
    // Back at 2.5%; Silicon Valley's 20%, 40%, 200% appear (struck out) as he says them.
    warp: [['9:22.5', 3.95], ['9:41.4', 3.95], ['9:41.5', 4.0], ['9:42.8', 4.2], ['9:43.6', 4.5], ['9:44.5', 4.8]],
    shots: [{ at: '9:41.0', pos: [2.4, 0, 12.6], look: [2.6, -0.3, 0], move: 3 }],
  }),

  cue({
    chapter: 'A sticky world',
    start: '9:51.0',
    slide: sticky,
    shots: [
      { at: '9:55.3', pos: [3.0, 0.2, 9.6], look: [3.6, -0.7, -0.5], move: 3.5 },
      { at: '10:03.7', pos: [-1.2, 0.5, 14.8], look: [-1.6, -0.6, 0], move: 6 },
    ],
  }),

  cue({
    chapter: 'The debt',
    start: '10:14.2',
    slide: debt,
    // The two paths draw from "if our economy can grow two and a half percent instead of two";
    // the red one is labelled on "the next Greece", the gold one on "a manageable level".
    warp: [['10:15.45', 1.25], ['10:34.9', 1.25], ['10:43.5', 4.0]],
    labelWarp: [['10:15.7', 1.5], ['10:42.0', 1.5], ['10:42.3', 3.45], ['10:45.0', 3.45], ['10:45.4', 3.95]],
  }),

  cue({
    chapter: 'Plan A',
    start: '10:50.8',
    slide: planA,
    // A ghost "B" forms on "there is no…" and crumbles on "…plan B".
    warp: [['10:52.6', 1.8], ['11:14.0', 1.8]],
    base: { pos: [-3.0, 0.3, 12.8], look: [-3.3, 0.2, 0] },
    shots: [
      { at: '11:11.6', pos: [0, 0, 14.5], look: [0, 0, 0], move: 2.4 },
      { at: '11:18.0', pos: [-2.2, 0.2, 13.6], look: [-2.6, 0.1, 0], move: 8 },
    ],
  }),

  cue({
    chapter: 'We’ve done it before',
    start: '11:48.5',
    slide: doneBefore,
    shots: [
      { at: '12:00.0', pos: [2.4, 0.3, 10.4], look: [2.8, -0.6, -0.2], move: 5 },
      { at: '12:28.0', pos: [1.6, 0.8, 15.0], look: [1.6, -0.75, 0], move: 7 },
    ],
  }),

  cue({
    chapter: 'Who wins',
    start: '12:48.3',
    slide: { ...winners, Scene: (p) => <WinnersTalkScene {...p} start={ts('12:48.3')} /> },
    base: { pos: [0, 0.3, 15.6], look: [0, 0, 0] },
    shots: [{ at: '13:18.7', pos: [0.2, -0.5, 12.4], look: [0.2, -0.7, 0], move: 5 }],
  }),

  cue({
    chapter: 'Who loses',
    start: '13:46.6',
    slide: losers,
    // Manhattan lights up on "live in Manhattan"; the arc to Houston draws on "sent to Houston".
    warp: [['13:48.0', 1.4], ['13:52.6', 1.45], ['13:53.2', 1.95], ['13:59.4', 1.95], ['14:01.4', 3.9]],
  }),

  cue({
    chapter: 'The slow 40%',
    start: '14:48.2',
    slide: { ...slow40, Scene: (p) => <SlowSectorsScene {...p} start={ts('14:48.2')} /> },
    base: { pos: [-3.6, 0.9, 13.4], look: [-3.6, 0.5, 0] },
    shots: [
      { at: '14:56.6', pos: [-5.7, 0.7, 9.6], look: [-5.7, 0.4, 0], move: 6 },
      { at: '15:40.8', pos: [-3.6, 0.9, 13.4], look: [-3.6, 0.5, 0], move: 4 },
      { at: '16:08.3', pos: [-3.4, 1.3, 15.8], look: [-3.4, 0.4, 0], move: 6 },
    ],
  }),

  cue({
    chapter: 'Being human',
    start: '16:15.0',
    slide: physical,
    base: { pos: [2.4, 2.9, 12.8], look: [2.9, -0.5, 0] },
    shots: [
      { at: '16:26.7', pos: [3.2, 1.1, 8.6], look: [3.3, -0.4, 0.4], move: 6 },
      { at: '16:54.1', pos: [3.2, 1.1, 8.6], look: [3.3, -0.4, 0.4], move: 1, orbit: 0.006 },
      { at: '17:16.8', pos: [2.2, 3.1, 13.4], look: [2.9, -0.5, 0], move: 7 },
    ],
  }),

  cue({
    chapter: 'Two camps',
    start: '17:32.3',
    slide: { ...camps, Scene: (p) => <CampsTalkScene {...p} start={ts('17:32.3')} /> },
    // Opens on Stockholm ("it shows Sweden"), pulls back to the world on "sovereignty".
    base: { pos: [0.9, 4.0, 9.0], look: [0.9, 2.7, -1.0] },
    shots: [{ at: '17:52.1', pos: [-0.4, 2.9, 19.6], look: [-0.4, 1.6, 0], move: 5 }],
  }),

  cue({
    chapter: 'Work harder',
    start: '18:21.5',
    slide: workHarder,
    base: { pos: [0, 0.6, 15.4], look: [0, 0.2, 0] },
    // The notification storm starts on "just keeping up with AI" and overloads the calendar on
    // "my calendar can't handle it".
    warp: [['18:23.8', 2.3], ['18:31.8', 2.3], ['18:35.5', 3.2]],
  }),

  cue({ chapter: 'Thank you', start: '18:39.7', slide: close, base: { push: 0.0012 } }),
]

/** Index of the cue on screen at talk time t. */
export function cueAt(t: number): number {
  let i = 0
  while (i + 1 < cues.length && cues[i + 1].start <= t) i++
  return i
}
