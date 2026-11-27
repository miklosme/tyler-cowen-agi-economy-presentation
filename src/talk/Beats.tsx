/**
 * On-screen text for the talk. The audio carries the argument, so text is kept to what an ear
 * can't hold: who is speaking, the few numbers he says out loud, and the names of the three new
 * job engines. Everything else is told by the scenes.
 */
import type { CSSProperties, ReactNode } from 'react'
import { ts } from './time'
import { useWindow } from './timeline'

type T = string | number

export function Beat({ at, out = Infinity, className = '', style, children }: { at: T; out?: T; className?: string; style?: CSSProperties; children: ReactNode }) {
  const on = useWindow(ts(at), ts(out))
  return (
    <div className={`beat ${className}`} data-on={on} style={style}>
      {children}
    </div>
  )
}

/** A part of a beat that joins it later, on its own word. */
export function Step({ at, className = '', style, children }: { at: T; className?: string; style?: CSSProperties; children: ReactNode }) {
  const on = useWindow(ts(at))
  return (
    <span className={`step ${className}`} data-on={on} style={style}>
      {children}
    </span>
  )
}

const u = (n: number) => `calc(var(--u) * ${n})`

function Engine({ at, out, n, children }: { at: T; out: T; n: string; children: ReactNode }) {
  return (
    <Beat at={at} out={out} className="kicker">
      <span className="kicker-n">{n}</span>
      <span className="h2">{children}</span>
    </Beat>
  )
}

export function Beats({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="beats">
      <div className="frame">
        {/* Title, inside the eclipse ring. */}
        <Beat at={0} out="0:09.0" style={{ inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <h1 className="display" style={{ margin: 0, transform: `translateY(${u(-0.6)})` }}>
            The AGI
            <br />
            <span className="em">Economy</span>
          </h1>
        </Beat>

        {/* Who is speaking. */}
        <Beat at="0:05.4" out="0:13.0" className="lower-third">
          <span className="lt-name">Tyler Cowen</span>
          <span className="lt-meta">Sana AI Summit · New York · May 21, 2026</span>
        </Beat>

        {/* Two truths at once: one word each side. */}
        <Beat at="0:10.9" out="0:51.3" style={{ left: u(9.5), width: u(29), top: u(36), textAlign: 'center' }}>
          <span className="h1 em">Optimism</span>
        </Beat>
        <Beat at="0:33.3" out="0:51.3" style={{ right: u(9.5), width: u(29), top: u(36), textAlign: 'center' }}>
          <span className="h1 ice">Realism</span>
        </Beat>

        {/* The job engines, named as the camera visits each one. */}
        <Engine at="3:37.6" out="4:18.4" n="01">
          Running experiments
        </Engine>
        <Engine at="4:19.4" out="4:52.8" n="02">
          Gathering data
        </Engine>
        <Engine at="4:53.6" out="5:07.0" n="03">
          Energy &amp; compute
        </Engine>

        {/* "I'm 64 … can I hang on to 84? … 94? … then I'll get to 99." */}
        <Beat at="6:44.6" out="7:13.6" className="ages" style={{ left: 'var(--pad-x)', top: u(15) }}>
          <Step at="6:44.6" className="stat">
            64
          </Step>
          <Step at="7:00.9" className="stat">
            <i>→</i>84
          </Step>
          <Step at="7:03.2" className="stat">
            <i>→</i>94
          </Step>
          <Step at="7:09.1" className="stat em big">
            <i>→</i>99
          </Step>
        </Beat>

        {/* The memo: five hours to five minutes. */}
        <Beat at="8:41.2" out="8:52.6" className="halo" style={{ left: u(53), top: u(23) }}>
          <span className="caption up">One memo</span>
          <div className="stat" style={{ fontSize: u(4.4), marginTop: u(0.8), whiteSpace: 'nowrap' }}>
            <Step at="8:42.5">5 hours</Step>{' '}
            <Step at="8:44.1" className="em">
              → 5 minutes
            </Step>
          </div>
        </Beat>

        {/* "Over 38 trillion. It might have hit 39 trillion." */}
        <Beat at="10:27.4" out="10:34.6" className="halo" style={{ left: 'var(--pad-x)', top: 'var(--pad-y)' }}>
          <span className="caption up">U.S. federal debt</span>
          <div className="stat" style={{ fontSize: u(6.4), marginTop: u(0.8) }}>
            $3
            <span className="swap">
              <Step at={0} className="swap-a">
                8
              </Step>
              <Step at="10:29.9" className="swap-b alarm">
                9
              </Step>
            </span>{' '}
            trillion
          </div>
        </Beat>

        {/* The mid-'90s: half a point, done before. */}
        <Beat at="11:56.2" out="12:31.6" style={{ left: 'var(--pad-x)', top: 'var(--pad-y)' }}>
          <span className="stat" style={{ fontSize: u(4.2) }}>
            1995–1998
          </span>
          <Step at="12:06.6" className="block" style={{ marginTop: u(1.2) }}>
            <span className="stat em" style={{ fontSize: u(6.4) }}>
              +0.5
            </span>
            <span className="caption up" style={{ display: 'block', marginTop: u(0.6) }}>
              points of growth a year
            </span>
          </Step>
        </Beat>

        {/* "Earn two million dollars a year" … "earning 350k a year". */}
        <Beat at="13:53.8" out="14:12.0" className="salary" style={{ left: 'var(--pad-x)', top: u(16) }}>
          <Step at="13:53.8" className="stat was">
            $2,000,000
          </Step>
          <Step at="14:04.6" className="stat alarm">
            $350,000
          </Step>
        </Beat>

        {/* "I've reallocated, I'd say, two-thirds of my own time." */}
        <Beat at="16:25.4" out="16:41.2" style={{ left: 'var(--pad-x)', top: u(12) }}>
          <span className="stat em" style={{ fontSize: u(8) }}>
            ⅔
          </span>
          <span className="caption up" style={{ display: 'block', marginTop: u(0.8) }}>
            of his time, reallocated
          </span>
        </Beat>

        {/* End card, inside the dawn ring. */}
        <Beat at="18:51.8" className="end-card" style={{ inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div style={{ width: u(36) }}>
            <span className="caption up">A talk by</span>
            <h1 className="h1" style={{ marginTop: u(0.6), fontSize: u(3.6) }}>
              Tyler Cowen
            </h1>
            <p className="lede" style={{ marginTop: u(0.9), color: 'var(--paper)' }}>
              The AGI economy: how AI could stabilize public debt
            </p>
            <p className="caption" style={{ marginTop: u(0.5) }}>
              Sana AI Summit · New York · May 21, 2026
            </p>
            <div className="end-actions">
              <button type="button" onClick={onReplay}>
                ↺ Watch again
              </button>
              <a href="https://www.youtube.com/watch?v=aJlg6o0A_Js" target="_blank" rel="noreferrer">
                Original video ↗
              </a>
              <a href="../">Slide deck →</a>
            </div>
          </div>
        </Beat>
      </div>
    </div>
  )
}
