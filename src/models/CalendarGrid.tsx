/**
 * CalendarGrid: a desk month calendar (7x5 gold grid, header, two binder rings).
 *
 * Variants: "calm" (a handful of events) and "overloaded" (cells stuffed with glowing ice and
 * ember event bars that pile out of the cells toward the viewer, jitter and throw sparks).
 * The variant switch is damped, so the slide can flip it and watch the month fill up.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'Calendar grid',
  distance: 6.0,
  elevation: 10,
  azimuth: 20,
  variants: ['calm', 'overloaded'],
}

// ---- Layout ------------------------------------------------------------------------------
const BW = 2.3 // body width
const BH = 2.0 // body height
const BD = 0.1 // body depth
const BY = -0.12 // body centre y (rings poke out above)
const TOP = BY + BH / 2
const FACE = BD / 2 // front face z
const COLS = 7
const ROWS = 5
const GX0 = -1.05
const GX1 = 1.05
const GY1 = BY + 0.5 // grid top
const GY0 = BY - 0.92 // grid bottom
const CW = (GX1 - GX0) / COLS
const CH = (GY1 - GY0) / ROWS
const HEADER_Y0 = GY1 + 0.17
const RING_X = [-0.62, 0.62]
const RING_R = 0.185
const HOLE_Y = TOP - 0.11
const HEAD_Y = (TOP + HEADER_Y0) / 2 - 0.03
const FIRST = 2 // month starts on the 3rd column
const DAYS = 31
const TODAY = 11
const K = 6 // max event bars per cell
const SLOTS = 3 // bars that fit inside a cell

const cellCenter = (i: number) => {
  const c = i % COLS
  const r = Math.floor(i / COLS)
  return [GX0 + CW * (c + 0.5), GY1 - CH * (r + 0.5)] as const
}

// ---- Helpers -----------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const easeOutBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function slab(w: number, h: number, d: number, r: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, r), {
    depth: d - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  })
  g.translate(0, 0, -d / 2 + bevel)
  return g
}

// Lines that draw on: each vertex carries a reveal key; fragments past uReveal are discarded.
const lineVertex = /* glsl */ `
  attribute float aKey;
  varying float vKey;
  void main() {
    vKey = aKey;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const lineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uPulse;
  varying float vKey;
  void main() {
    if (vKey > uReveal) discard;
    float head = smoothstep(uReveal - 0.06, uReveal, vKey) * step(uReveal, 0.999);
    gl_FragColor = vec4(uColor * (uPulse + head * 2.5), 1.0);
  }
`

// Event bars: instanced boxes with a crisp bright rim and a softer fill (reads as separate pills).
const barVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFront;
  varying float vTop;
  void main() {
    vUv = uv;
    vColor = instanceColor;
    vFront = step(0.5, normal.z);
    vTop = step(0.5, normal.y);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`
const barFragment = /* glsl */ `
  uniform float uHeat;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFront;
  varying float vTop;
  void main() {
    vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-4));
    float edge = min(e.x, e.y);
    float rim = 1.0 - smoothstep(1.4, 2.8, edge);
    // Per-face shading so stacks read as blocks: lit top, mid front, dark sides.
    float fill = mix(mix(0.08, 0.24, vFront), 0.34, vTop) * (0.8 + 0.2 * vUv.y);
    // Hot tower caps (instance colour boosted past 2) glow from within.
    float hot = smoothstep(2.0, 2.3, max(vColor.r, max(vColor.g, vColor.b)));
    fill = mix(fill, mix(mix(0.12, 0.26, vFront), 0.32, vTop), hot);
    // Faces stay under ~0.95 per channel (the deck's grain pass speckles brighter surfaces);
    // the heat lives in the thin rims and the bloom. Hot caps get a pale-gold rim.
    vec3 face = vColor * fill;
    face *= min(1.0, 0.95 / max(max(face.r, face.g), max(face.b, 1e-4)));
    vec3 rimCol = mix(vColor, vec3(2.4, 1.9, 1.1), hot) * rim * (0.7 + 0.35 * uHeat);
    rimCol *= min(1.0, 1.35 / max(max(rimCol.r, rimCol.g), max(rimCol.b, 1e-4)));
    vec3 col = face + rimCol;
    gl_FragColor = vec4(col, 1.0);
  }
`

const sparkVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aDir;
  uniform float uTime;
  uniform float uStrain;
  uniform float uPixelRatio;
  varying float vA;
  varying float vHue;
  void main() {
    float life = fract(uTime * (0.35 + aSeed * 0.4) + aSeed * 13.0);
    vec3 p = position;
    p.y += life * (0.45 + aSeed * 0.35);
    p.z += life * 0.25;
    p.x += sin(life * 6.0 + aSeed * 20.0) * 0.05 + aDir * life * (0.25 + 0.3 * fract(aSeed * 3.7));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = uStrain * smoothstep(0.0, 0.1, life) * (1.0 - life);
    vHue = step(0.55, fract(aSeed * 7.31));
    gl_PointSize = (3.5 + 4.5 * aSeed) * uPixelRatio * (6.0 / -mv.z) * (0.4 + uStrain);
  }
`
const sparkFragment = /* glsl */ `
  uniform vec3 uIce;
  uniform vec3 uEmber;
  varying float vA;
  varying float vHue;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(uIce, uEmber, vHue) * a * vA, 1.0);
  }
`

type Bar = {
  cell: number
  slot: number
  calm: boolean
  ghost: boolean
  t: number // overload threshold 0..1 at which this bar appears
  x: number
  w: number
  jx: number
  rz: number
  ph: number
}

function lineGeo(pos: number[], key: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aKey', new THREE.Float32BufferAttribute(key, 1))
  return g
}

export default function CalendarGrid({ progress = 1, variant = 'calm', accent = palette.ember }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const shake = useRef<THREE.Group>(null)
  const sheet = useRef<THREE.Group>(null)
  const header = useRef<THREE.Group>(null)
  const ringsRef = useRef<THREE.Group[]>([])
  const tiles = useRef<THREE.InstancedMesh>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const bars = useRef<THREE.InstancedMesh>(null)
  const prog = useRef(progress)
  prog.current = progress
  const target = variant === 'overloaded' ? 1 : 0
  const overload = useRef(target)
  const targetRef = useRef(target)
  targetRef.current = target

  const parts = useMemo(() => {
    const body = slab(BW, BH, BD, 0.12, 0.02)
    const headerGeo = slab(BW - 0.12, TOP - HEADER_Y0 - 0.06, 0.03, 0.06, 0.008)
    const tile = new THREE.BoxGeometry(CW - 0.035, CH - 0.035, 0.016)
    const dot = new THREE.CircleGeometry(0.014, 10)
    const bar = new THREE.BoxGeometry(1, 1, 1)
    const ring = new THREE.TorusGeometry(RING_R, 0.03, 10, 40)
    const hole = new THREE.CircleGeometry(0.045, 20)

    // 1) Silhouette rim (front + back) and the back's ring-strip: brightest gold.
    const rp: number[] = []
    const rk: number[] = []
    const outline = roundedRect(BW - 0.04, BH - 0.04, 0.1).getSpacedPoints(96)
    for (let i = 0; i < outline.length - 1; i++) {
      const a = outline[i]
      const b = outline[i + 1]
      const ka = Math.abs(Math.atan2(a.x, a.y)) / Math.PI
      const kb = Math.abs(Math.atan2(b.x, b.y)) / Math.PI
      for (const z of [FACE + 0.004, -FACE - 0.004]) {
        rp.push(a.x, a.y + BY, z, b.x, b.y + BY, z)
        rk.push(ka, kb)
      }
    }
    const by = HEADER_Y0 - 0.02
    rp.push(-BW / 2 + 0.12, by, -FACE - 0.004, BW / 2 - 0.12, by, -FACE - 0.004)
    rk.push(0.3, 1)
    const rimLines = lineGeo(rp, rk)

    // 2) Interior grid rules: dimmer, drawn row by row so the first week lands first.
    const gp: number[] = []
    const gk: number[] = []
    const gz = FACE + 0.012
    for (let r = 0; r <= ROWS; r++) {
      const y = GY1 - CH * r
      const k0 = r * 0.11
      gp.push(GX0, y, gz, GX1, y, gz)
      gk.push(k0, k0 + 0.35)
    }
    for (let c = 0; c <= COLS; c++) {
      const x = GX0 + CW * c
      // Vertical rules share the row timing: key grows with depth down the grid.
      gp.push(x, GY1, gz, x, GY0, gz)
      gk.push(0.02 + c * 0.012, 0.02 + c * 0.012 + 0.55)
    }
    const gridLines = lineGeo(gp, gk)

    // 3) Header: underline, weekday ticks, month-title bar and nav chevrons.
    const hp: number[] = []
    const hk: number[] = []
    const hy = HEAD_Y
    const hz = FACE + 0.035
    const hseg = (x0: number, y0: number, x1: number, y1: number, k0: number, k1: number, z = hz) => {
      hp.push(x0, y0, z, x1, y1, z)
      hk.push(k0, k1)
    }
    hseg(-BW / 2 + 0.12, HEADER_Y0 - 0.02, BW / 2 - 0.12, HEADER_Y0 - 0.02, 0.0, 0.5, FACE + 0.012)
    for (let c = 0; c < COLS; c++) {
      const x = GX0 + CW * (c + 0.5)
      hseg(x - 0.05, GY1 + 0.075, x + 0.05, GY1 + 0.075, 0.4 + c * 0.04, 0.48 + c * 0.04, FACE + 0.012)
    }
    hseg(-0.42, hy, 0.18, hy, 0.25, 0.6)
    hseg(-0.42, hy - 0.005, 0.18, hy - 0.005, 0.25, 0.6)
    hseg(0.26, hy, 0.44, hy, 0.55, 0.7)
    hseg(-0.92, hy, -0.86, hy + 0.05, 0.6, 0.7)
    hseg(-0.92, hy, -0.86, hy - 0.05, 0.6, 0.7)
    hseg(0.92, hy, 0.86, hy + 0.05, 0.6, 0.7)
    hseg(0.92, hy, 0.86, hy - 0.05, 0.6, 0.7)
    const headLines = lineGeo(hp, hk)

    // 4) Today box: the calm-state focal point.
    const [tx, ty] = cellCenter(FIRST + TODAY - 1)
    const tw = CW / 2 - 0.02
    const th = CH / 2 - 0.02
    const corners = [
      [tx - tw, ty + th],
      [tx + tw, ty + th],
      [tx + tw, ty - th],
      [tx - tw, ty - th],
      [tx - tw, ty + th],
    ]
    const tp: number[] = []
    const tk: number[] = []
    for (let i = 0; i < 4; i++) {
      for (const dz of [0.03, 0.032]) {
        tp.push(corners[i][0], corners[i][1], FACE + dz, corners[i + 1][0], corners[i + 1][1], FACE + dz)
        tk.push(i * 0.25, (i + 1) * 0.25)
      }
    }
    const todayLines = lineGeo(tp, tk)

    // Event bars. Calm: a handful. Overloaded: every cell fills; most overflow piles stay
    // compact (bars touch), and four "hero" towers climb out of the late month, leaning
    // in different directions and breaking the calendar's silhouette.
    const r = rng(7)
    const calmCells = new Map<number, number>([
      [FIRST + 3, 1],
      [FIRST + 8, 2],
      [FIRST + TODAY - 1, 1],
      [FIRST + 15, 1],
      [FIRST + 19, 1],
      [FIRST + 24, 2],
    ])
    // Hero towers: bars touch (ys < bar height), each leans its own way at its own height.
    // The tallest climbs the right edge past the header line, beside the right ring.
    const heroes = new Map<number, { n: number; lx: number; rz: number; ys: number; zs: number }>([
      [FIRST + 27 - 1, { n: 13, lx: -0.022, rz: 0.045, ys: 0.042, zs: 0.03 }], // out past the left edge
      [FIRST + 26 - 1, { n: 36, lx: 0.011, rz: -0.012, ys: 0.044, zs: 0.008 }], // up the right side
      [FIRST + 29 - 1, { n: 9, lx: -0.012, rz: 0.03, ys: 0.042, zs: 0.04 }],
      [FIRST + 31 - 1, { n: 15, lx: 0.016, rz: -0.035, ys: 0.042, zs: 0.034 }],
    ])
    const list: Bar[] = []
    const lean: { x: number; rz: number; ys: number; zs: number; hero: boolean; n: number }[] = []
    for (let cell = 0; cell < COLS * ROWS; cell++) {
      const h = heroes.get(cell)
      const day = cell - FIRST + 1
      const ghost = day < 1 || day > DAYS
      const f = ghost ? 0 : day / DAYS
      // Week one stays light (some days empty); pressure builds through the month.
      const n = h
        ? h.n
        : ghost
          ? 0
          : f < 0.24
            ? r() < 0.3
              ? 0
              : 1
            : Math.min(K, Math.round(1.5 + Math.pow(f, 1.4) * (K - 1.5) * (0.75 + 0.45 * r())))
      lean.push(
        h
          ? { x: h.lx, rz: h.rz, ys: h.ys, zs: h.zs, hero: true, n }
          : { x: (r() - 0.5) * 0.012, rz: (r() - 0.5) * 0.08, ys: 0.044, zs: 0.04, hero: false, n },
      )
      const calmN = calmCells.get(cell) ?? 0
      for (let k = 0; k < Math.max(n, calmN); k++) {
        const over = k >= SLOTS
        list.push({
          cell,
          slot: k,
          ghost,
          calm: k < calmN,
          t: Math.min(0.95, f * 0.3 + (k / Math.max(n, 1)) * 0.5 + r() * 0.08),
          x: over ? (r() - 0.5) * 0.03 : (r() - 0.5) * 0.016,
          w: over ? 0.19 + r() * 0.04 : 0.13 + r() * 0.06,
          jx: r(),
          rz: (r() - 0.5) * 0.2,
          ph: r() * 100,
        })
      }
    }
    // Colour + brightness: early weeks quiet and ice-heavy; heat (ember) rises with the date
    // and with stack height; only the four hero caps are hot deep ember.
    const tallest = new Map<number, number>()
    list.forEach((b) => tallest.set(b.cell, Math.max(tallest.get(b.cell) ?? 0, b.slot)))
    const colors = new Float32Array(list.length * 3)
    const color = new THREE.Color()
    list.forEach((b, i) => {
      const day = b.cell - FIRST + 1
      const f = clamp01(day / DAYS)
      const over = Math.max(0, b.slot - SLOTS + 1)
      const hero = lean[b.cell].hero
      let ember: boolean
      let boost: number
      if (b.calm && !b.ghost) {
        ember = b.cell === FIRST + TODAY - 1 || b.cell === FIRST + 24
        boost = 1.9
      } else if (hero) {
        ember = b.slot / lean[b.cell].n > 0.35 + r() * 0.25
        boost = 1.15 + (b.slot / lean[b.cell].n) * 0.6
      } else {
        ember = r() < 0.12 + 0.45 * f + over * 0.12
        boost = over > 0 ? 1.15 + over * 0.1 : 0.85 + 0.35 * f
      }
      let hex: string = ember ? palette.ember : palette.ice
      if (hero && b.slot === tallest.get(b.cell)) {
        hex = palette.emberDeep
        boost = 2.4
      }
      if (b.ghost) boost *= 0.55
      color.copy(glow(hex, boost))
      colors.set([color.r, color.g, color.b], i * 3)
    })

    // Sparks: thrown off the four hero tower caps.
    const tops = [...heroes.entries()].map(([cell, h]) => {
      const [x, y] = cellCenter(cell)
      const over = h.n - SLOTS
      return [
        x + 0.025 + h.lx * over,
        y + CH / 2 - 0.1 - (SLOTS - 1) * 0.058 + over * h.ys,
        FACE + 0.035 + over * h.zs,
        Math.sign(h.lx),
      ]
    })
    const SP = 110
    const sp = new Float32Array(SP * 3)
    const ss = new Float32Array(SP)
    const sd = new Float32Array(SP)
    for (let i = 0; i < SP; i++) {
      const tp = tops[i % tops.length]
      sp.set([tp[0] + (r() - 0.5) * 0.16, tp[1] + r() * 0.04, tp[2] + (r() - 0.5) * 0.08], i * 3)
      ss[i] = r()
      sd[i] = tp[3]
    }
    const sparks = new THREE.BufferGeometry()
    sparks.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sparks.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1))
    sparks.setAttribute('aDir', new THREE.BufferAttribute(sd, 1))

    const todayFill = new THREE.PlaneGeometry(CW - 0.05, CH - 0.05)
    const grommet = new THREE.RingGeometry(0.052, 0.062, 28)

    return {
      body,
      headerGeo,
      tile,
      dot,
      bar,
      ring,
      hole,
      rimLines,
      gridLines,
      headLines,
      todayLines,
      todayFill,
      grommet,
      list,
      lean,
      colors,
      sparks,
    }
  }, [])

  const mats = useMemo(() => {
    const rim = { uColor: { value: glow(accent, 1) }, uReveal: { value: 0 }, uPulse: { value: 3.4 } }
    const grid = { uColor: { value: glow(accent, 1) }, uReveal: { value: 0 }, uPulse: { value: 1.0 } }
    const head = { uColor: { value: glow(accent, 1) }, uReveal: { value: 0 }, uPulse: { value: 3.4 } }
    const today = { uColor: { value: glow(palette.ember, 1) }, uReveal: { value: 0 }, uPulse: { value: 6 } }
    const mk = (uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: lineVertex, fragmentShader: lineFragment, toneMapped: false })
    const sparkU = {
      uTime: { value: 0 },
      uStrain: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uIce: { value: glow(palette.ice, 3) },
      uEmber: { value: glow(palette.ember, 3) },
    }
    const barU = { uHeat: { value: 0 } }
    return {
      rim,
      grid,
      head,
      today,
      rimMat: mk(rim),
      gridMat: mk(grid),
      headMat: mk(head),
      todayMat: mk(today),
      barU,
      barMat: new THREE.ShaderMaterial({ uniforms: barU, vertexShader: barVertex, fragmentShader: barFragment }),
      body: new THREE.MeshStandardMaterial({ color: '#1e2540', metalness: 0.6, roughness: 0.26 }),
      headerPlate: new THREE.MeshStandardMaterial({ color: '#2e3960', metalness: 0.6, roughness: 0.2 }),
      tileMat: new THREE.MeshStandardMaterial({ color: '#232c52', metalness: 0.45, roughness: 0.32 }),
      dotMat: new THREE.MeshBasicMaterial({ color: glow(accent, 1.6), toneMapped: false }),
      ringMat: new THREE.MeshStandardMaterial({ color: '#d4dbef', metalness: 1, roughness: 0.2, emissive: palette.ember, emissiveIntensity: 0.14 }),
      holeMat: new THREE.MeshBasicMaterial({ color: '#020308' }),
      grommetMat: new THREE.MeshBasicMaterial({ color: glow(accent, 2.2), toneMapped: false }),
      todayFill: new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.ember),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      sparkU,
      sparkMat: new THREE.ShaderMaterial({
        uniforms: sparkU,
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), c2: new THREE.Color() }), [])

  useFrame((state, dt) => {
    const p = prog.current
    const t = state.clock.elapsedTime
    const { o } = tmp
    if (!root.current || !sheet.current || !header.current || !shake.current) return
    root.current.visible = p > 0.001

    // Damped variant blend.
    overload.current = THREE.MathUtils.damp(overload.current, targetRef.current, 1.6, dt)
    const ov = overload.current
    const strain = THREE.MathUtils.smoothstep(ov, 0.4, 1)

    // --- Build-in ---
    // Header drops in and the rings swing shut, the sheet unrolls from the header, the rim
    // draws on, the grid draws week by week, tiles pop in a diagonal wave, events land last.
    const hk = easeOutExpo(seg(p, 0, 0.22))
    header.current.position.y = (1 - hk) * 0.5
    header.current.scale.setScalar(Math.max(0.0001, hk))
    const unroll = easeOut(seg(p, 0.03, 0.32))
    sheet.current.scale.y = Math.max(0.0001, unroll)
    sheet.current.position.y = TOP
    mats.rim.uReveal.value = -0.02 + 1.04 * easeOut(seg(p, 0.05, 0.36))
    mats.head.uReveal.value = -0.02 + 1.04 * easeOut(seg(p, 0.1, 0.42))
    mats.grid.uReveal.value = -0.02 + 1.04 * seg(p, 0.14, 0.58)
    mats.today.uReveal.value = -0.02 + 1.04 * easeOut(seg(p, 0.6, 0.85))

    // --- Idle + strain ---
    const idle = easeOut(seg(p, 0.7, 1))
    const sh = strain * idle
    const pulse = 0.5 + 0.5 * Math.sin(t * 6.0)
    root.current.rotation.y = Math.sin(t * 0.3) * 0.05 * idle
    root.current.rotation.x = Math.sin(t * 0.23 + 1) * 0.025 * idle
    root.current.position.y = Math.sin(t * 0.5) * 0.03 * idle
    shake.current.position.set(
      (Math.sin(t * 37.1) + Math.sin(t * 23.7)) * 0.006 * sh,
      (Math.sin(t * 41.3) + Math.sin(t * 29.9)) * 0.004 * sh,
      0,
    )
    shake.current.rotation.z = Math.sin(t * 31.0) * 0.006 * sh
    // A strained heartbeat: the slab swells a touch on each beat.
    const beat = Math.pow(Math.max(0, Math.sin(t * 5.2)), 6)
    shake.current.scale.set(1 + beat * 0.014 * sh, 1 + beat * 0.01 * sh, 1 + beat * 0.2 * sh)

    ringsRef.current.forEach((g, i) => {
      if (!g) return
      const k = easeOutBack(seg(p, 0.08 + i * 0.05, 0.34 + i * 0.05))
      g.scale.setScalar(Math.max(0.0001, Math.min(1.2, k)))
      // Under strain the rings rattle in their holes.
      g.rotation.x = (1 - k) * -1.6 + Math.sin(t * 17 + i * 2) * 0.09 * sh
      g.rotation.z = Math.sin(t * 13 + i * 3) * 0.06 * sh
    })

    // Linework heats from gold toward deep ember / alarm and throbs as the month overloads.
    // Heat only arrives once the month has actually filled (not during the build).
    const heat = strain * seg(p, 0.65, 1)
    tmp.c.set(palette.alarm)
    mats.rim.uColor.value.set(accent).lerp(tmp.c, heat * 0.7)
    mats.rim.uPulse.value = 3.4 + heat * (0.6 + beat * 3.5)
    mats.head.uColor.value.set(accent).lerp(tmp.c, heat * 0.6)
    mats.head.uPulse.value = 3.4 + heat * beat * 3
    mats.grid.uColor.value.set(accent).lerp(tmp.c.set(palette.emberDeep), heat * 0.6)
    mats.grid.uPulse.value = 1.0 + heat * (0.3 + beat * 0.9)
    mats.today.uColor.value.set(palette.ember).lerp(tmp.c.set(palette.emberDeep), heat * 0.6)
    mats.grommetMat.color.copy(mats.rim.uColor.value).multiplyScalar(2.2)
    // Today's cell: a warm wash when calm; a red throb in time with the heartbeat when overloaded.
    mats.todayFill.color.set(palette.ember).lerp(tmp.c.set(palette.emberDeep).lerp(tmp.c2.set(palette.alarm), 0.35), heat)
    mats.todayFill.opacity = seg(p, 0.75, 1) * (0.1 + 0.05 * Math.sin(t * 2.2) + heat * (0.25 + beat * 0.55))
    mats.today.uPulse.value = 5.5 + Math.sin(t * 2.2) * 1.2 * (1 - strain) + strain * pulse * 4
    mats.barU.uHeat.value = strain
    mats.sparkU.uTime.value += dt
    mats.sparkU.uStrain.value = sh

    // Tiles + day dots: diagonal pop wave.
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = i % COLS
      const r = Math.floor(i / COLS)
      const [x, y] = cellCenter(i)
      const k = easeOutBack(seg(p, 0.16 + (c * 0.5 + r) * 0.035, 0.36 + (c * 0.5 + r) * 0.035))
      const day = i - FIRST + 1
      const inMonth = day >= 1 && day <= DAYS
      o.position.set(x, y, FACE + 0.008)
      o.rotation.set(0, 0, 0)
      o.scale.set(Math.max(0.0001, k), Math.max(0.0001, k), 1)
      o.updateMatrix()
      tiles.current?.setMatrixAt(i, o.matrix)
      o.position.set(x - CW / 2 + 0.05, y + CH / 2 - 0.05, FACE + 0.018)
      o.scale.setScalar(Math.max(0.0001, inMonth ? k : 0))
      o.updateMatrix()
      dots.current?.setMatrixAt(i, o.matrix)
    }
    if (tiles.current) tiles.current.instanceMatrix.needsUpdate = true
    if (dots.current) dots.current.instanceMatrix.needsUpdate = true

    // Event bars.
    if (bars.current) {
      const list = parts.list
      const BAR_H = 0.045
      const gap = 0.058
      for (let i = 0; i < list.length; i++) {
        const b = list[i]
        const [cx, cy] = cellCenter(b.cell)
        const ln = parts.lean[b.cell]
        const want = b.calm ? 1 : clamp01((ov - b.t) / 0.08)
        const d0 = 0.45 + (b.cell / 35) * 0.18 + (b.slot / Math.max(ln.n, 1)) * 0.15
        const v = Math.min(want, 1) * easeOutBack(seg(p, d0, d0 + 0.18))
        const over = Math.max(0, b.slot - SLOTS + 1)
        const jit = (0.0015 + over * (ln.hero ? 0.003 : 0.004)) * strain
        const ph = b.ph + t * (18 + b.jx * 10)
        let x = cx + 0.025 + b.x + Math.sin(ph) * jit
        let y = cy + CH / 2 - 0.1 - Math.min(b.slot, SLOTS - 1) * gap
        let z = FACE + 0.035
        let rz = 0
        let depth = 0.024
        if (over > 0) {
          // Overflow: a jammed pile climbing out of the cell toward the viewer. Bars are deep
          // enough that consecutive ones touch, so piles read as solid stacks.
          x += ln.x * over
          y = cy + CH / 2 - 0.1 - (SLOTS - 1) * gap + over * ln.ys
          z += over * ln.zs
          depth = Math.max(0.03, ln.zs + 0.008)
          // Hero towers sway as one under strain; small piles rattle per bar.
          const sway = ln.hero ? Math.sin(t * 3.1 + b.cell) * 0.02 * strain * (over / Math.max(ln.n - SLOTS, 1)) : 0
          rz = ln.rz * over * 0.5 + b.rz * 0.25 + sway + Math.sin(ph * 0.7) * 0.025 * strain
          x += sway * over * 0.04
        }
        y += Math.cos(ph * 1.3) * jit
        o.position.set(x, y, z - depth * 0.5 + 0.012 + (1 - v) * 0.2)
        o.rotation.set(0, 0, rz)
        o.scale.set(Math.max(0.0001, b.w * v), Math.max(0.0001, BAR_H * v), Math.max(0.0001, depth * v))
        o.updateMatrix()
        bars.current.setMatrixAt(i, o.matrix)
      }
      bars.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group ref={root} dispose={null}>
      <group ref={shake}>
        {/* Sheet: unrolls downward from the top edge. */}
        <group ref={sheet}>
          <group position-y={-TOP}>
            <mesh geometry={parts.body} material={mats.body} position-y={BY} />
            <lineSegments geometry={parts.rimLines} material={mats.rimMat} />
            <lineSegments geometry={parts.gridLines} material={mats.gridMat} />
            <instancedMesh ref={tiles} args={[parts.tile, mats.tileMat, COLS * ROWS]} />
            <instancedMesh ref={dots} args={[parts.dot, mats.dotMat, COLS * ROWS]} />
            <lineSegments geometry={parts.todayLines} material={mats.todayMat} />
            <mesh
              geometry={parts.todayFill}
              material={mats.todayFill}
              position={[cellCenter(FIRST + TODAY - 1)[0], cellCenter(FIRST + TODAY - 1)[1], FACE + 0.02]}
            />
            <instancedMesh
              ref={(m) => {
                bars.current = m
                if (m && !m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(parts.colors, 3)
              }}
              args={[parts.bar, mats.barMat, parts.list.length]}
              frustumCulled={false}
            />
            <points geometry={parts.sparks} material={mats.sparkMat} frustumCulled={false} />
            {RING_X.map((x) => (
              <mesh
                key={x}
                geometry={parts.hole}
                material={mats.holeMat}
                position={[x, HOLE_Y, -FACE - 0.003]}
                rotation-y={Math.PI}
              />
            ))}
          </group>
        </group>
        {/* Header plate with ring holes. */}
        <group position-y={HEAD_Y}>
          <group ref={header}>
            <group position-y={-HEAD_Y}>
              <mesh geometry={parts.headerGeo} material={mats.headerPlate} position={[0, HEAD_Y, FACE + 0.015]} />
              <lineSegments geometry={parts.headLines} material={mats.headMat} />
              {RING_X.map((x) => (
                <mesh key={x} geometry={parts.hole} material={mats.holeMat} position={[x, HOLE_Y, FACE + 0.032]} />
              ))}
              {RING_X.map((x) => (
                <mesh key={x} geometry={parts.grommet} material={mats.grommetMat} position={[x, HOLE_Y, FACE + 0.034]} />
              ))}
            </group>
          </group>
        </group>
        {/* Binder rings: loop through the holes and over the top edge. */}
        {RING_X.map((x, i) => (
          <group key={x} position={[x, HOLE_Y + RING_R - 0.005, 0]}>
            <group
              ref={(g) => {
                if (g) ringsRef.current[i] = g
              }}
            >
              <mesh geometry={parts.ring} material={mats.ringMat} rotation-y={Math.PI / 2} />
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}
