import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

/** Index of the slide an overlay belongs to; eyebrows number themselves from it (page = index + 1). */
export const SlideNumber = createContext(0)
/** Whether an overlay is entering or exiting; exiting overlays show their final state, not a reset. */
export const SlidePhase = createContext<'enter' | 'exit'>('enter')

type Props = {
  /** Text to split into words. Wrap words in *asterisks* to give them the `em` accent class. */
  text: string
  /** Delay (s) before the first word. */
  d?: number
  /** Delay step between words. */
  step?: number
  className?: string
  emClass?: string
}

/** Word-by-word blur-in reveal. */
export function Words({ text, d = 0, step = 0.045, className, emClass = 'em' }: Props) {
  const words = text.split(' ')
  let em = false
  return (
    <span className={className}>
      {words.map((raw, i) => {
        let w = raw
        let cls = ''
        if (w.startsWith('*')) {
          em = true
          w = w.slice(1)
        }
        if (em) cls = emClass
        const ends = w.endsWith('*') || /\*[.,;:!?)"’”]+$/.test(w)
        if (ends) w = w.replace('*', '')
        const node = (
          <span key={i} className={`w ${cls}`} style={{ '--d': d + i * step } as CSSProperties}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        )
        if (ends) em = false
        return node
      })}
    </span>
  )
}

/** Generic delayed reveal wrapper. */
export function R({ d = 0, children, className = '', style, as: Tag = 'div' }: { d?: number; children?: ReactNode; className?: string; style?: CSSProperties; as?: 'div' | 'span' | 'p' | 'li' }) {
  return (
    <Tag className={`rv ${className}`} style={{ ...style, '--d': d } as CSSProperties}>
      {children}
    </Tag>
  )
}

export function Eyebrow({ children, d = 0 }: { n?: string; children: ReactNode; d?: number }) {
  const n = String(useContext(SlideNumber) + 1).padStart(2, '0')
  return (
    <R d={d} className="eyebrow">
      <span className="num">{n}</span>
      <span className="bar" />
      <span>{children}</span>
    </R>
  )
}
