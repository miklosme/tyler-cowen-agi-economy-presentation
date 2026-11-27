/**
 * InventoryShelf: humble '90s software counting the real world, one barcode at a time.
 *
 * A three-deck steel rack holding six plain cartons, each with one barcode label. A corded
 * handheld scanner gun hovers in front of the rack. Every 2.4 s it turns to the next label and
 * fires a thin red laser fan; the scan line lands exactly across the label, the label flashes
 * ice cyan, and a single ember "+1" rises from it and fades. Only one label is ever being read
 * and only one "+1" is ever in the air. Everything else stays calm.
 * Build-in: grid and rack linework draw on while the uprights rise and the decks slide in,
 * the cartons settle onto the decks one by one (all landed by ~0.7), the scanner scales in with
 * its cord, then the laser powers on.
 * Variants: "default", "bare" (no floor grid).
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  LineBuilder,
  easeInOutCubic,
  easeOutCubic,
  makeGridMaterial,
  makeLineMaterial,
  satinShader,
  seg,
} from './retrocomputer-parts/shared'

export const meta: ModelMeta = {
  title: 'Inventory shelf + barcode scan',
  distance: 5.9,
  elevation: 12,
  azimuth: -18,
  variants: ['default', 'bare'],
}

// ---- Layout -------------------------------------------------------------------------------
const FLOOR = -1.0
const RX0 = -1.02
const RX1 = 0.58
const ZF = 0.26
const ZB = -0.26
const YT = 0.96
const POST = 0.06
const DECKS = [-0.86, -0.18, 0.5]
const LIP = 0.075 // front beam height
const FRONT = 0.22 // carton front plane
const LW = 0.34 // label size
const LH = 0.17

type Carton = { x: number; deck: number; w: number; h: number; d: number; pat: number; lx: number; ly: number }

// x is the carton centre; lx/ly are the label centre relative to the carton's front-face centre/base.
const CARTONS: Carton[] = [
  { x: -0.58, deck: 0, w: 0.68, h: 0.5, d: 0.46, pat: 0, lx: 0.11, ly: 0.2 },
  { x: 0.15, deck: 0, w: 0.64, h: 0.42, d: 0.44, pat: 1, lx: 0.1, ly: 0.17 },
  { x: -0.64, deck: 1, w: 0.56, h: 0.42, d: 0.42, pat: 2, lx: 0.06, ly: 0.17 },
  { x: 0.1, deck: 1, w: 0.76, h: 0.52, d: 0.46, pat: 0, lx: 0.14, ly: 0.21 },
  { x: -0.54, deck: 2, w: 0.62, h: 0.4, d: 0.42, pat: 1, lx: 0.1, ly: 0.16 },
  { x: 0.15, deck: 2, w: 0.5, h: 0.32, d: 0.38, pat: 2, lx: -0.04, ly: 0.145 },
]
const labelPos = (c: Carton) => new THREE.Vector3(c.x + c.lx, DECKS[c.deck] + c.ly, FRONT + 0.002)

// Barcodes: three fixed, balanced patterns. 1 = one bar module; runs are at most 3 modules,
// so the thinnest bar is one module (1/24 of the code width) and nothing turns to mush.
const PATTERNS = ['101101110010110011101101', '101110011011010011011101', '101100111010110111001101']
const MAX_BARS = 12
function barIntervals(p: string) {
  const out: number[] = []
  let i = 0
  while (i < p.length) {
    if (p[i] === '1') {
      let j = i
      while (j < p.length && p[j] === '1') j++
      out.push(i / p.length, j / p.length)
      i = j
    } else i++
  }
  while (out.length < MAX_BARS * 2) out.push(2, 2)
  return out.slice(0, MAX_BARS * 2)
}

// Scanner gun: hovers right-front of the rack, pivot at the head centre; nose is local +z.
const GUN = new THREE.Vector3(1.0, -0.02, 0.66)
const GUN_S = 1.18
const WIN_LOCAL = new THREE.Vector3(0, 0.0, 0.198)
const BUTT_LOCAL = new THREE.Vector3(0, -0.336, -0.185)
const CORD_END = new THREE.Vector3(RX1 + 0.085, FLOOR + 0.115, ZF)
const CORD_N = 260

// Build windows (progress) for each deck sliding out from the left post.
const deckWin = (i: number): [number, number] => [0.06 + i * 0.09, 0.16 + i * 0.09]
const POST_WIN: [number, number] = [0.02, 0.26] // uprights grow (and draw) upward
// Each carton slides onto its deck only after that deck has landed.
const cartonWin = (i: number): [number, number] => {
  const a = deckWin(CARTONS[i].deck)[1] + 0.02 + (i % 2) * 0.05
  return [a, a + 0.14]
}

// Read cycle (seconds): turn to the label, laser on, read, hold, laser off.
const SEQ = [5, 3, 1, 0, 2, 4] // carton indices in reading order: every label gets its turn
const PERIOD = 2.4
const TURN = 0.42
const ON0 = 0.42
const ON1 = 0.56
const READ = 0.62
const OFF0 = 1.9
const OFF1 = 2.05
const MOTE_LIFE = 1.6
const T0 = 0.28 // start phase so a fresh read is in the air shortly after mount

// ---- Shaders ------------------------------------------------------------------------------
const uvVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const labelFragment = /* glsl */ `
  uniform vec2 uBars[${MAX_BARS}];
  uniform vec3 uPaper;
  uniform vec3 uHot;
  uniform float uLit;
  uniform float uFlash;
  uniform float uAlpha;
  varying vec2 vUv;
  float band(float x, float a, float b, float aw) {
    return smoothstep(a - aw, a + aw, x) - smoothstep(b - aw, b + aw, x);
  }
  void main() {
    vec2 uv = vUv;
    // Code area: x 0.1..0.9, y 0.26..0.84.
    float cx = (uv.x - 0.1) / 0.8;
    float aw = fwidth(cx) * 0.6;
    float bars = 0.0;
    for (int i = 0; i < ${MAX_BARS}; i++) {
      bars += band(cx, uBars[i].x, uBars[i].y, aw);
    }
    float ay = fwidth(uv.y) * 0.6;
    bars *= band(uv.y, 0.26, 0.84, ay);
    // A short human-readable digit row under the bars, as small dashes.
    float dx = fract(uv.x * 9.0);
    float digits = band(uv.y, 0.11, 0.18, ay) * band(dx, 0.2, 0.75, fwidth(uv.x * 9.0) * 0.6) * band(uv.x, 0.12, 0.88, aw);
    float ink = clamp(bars + digits * 0.8, 0.0, 1.0);
    vec2 e = min(uv, 1.0 - uv) * vec2(${(LW / LH).toFixed(3)}, 1.0);
    float edge = min(e.x, e.y);
    float rim = 1.0 - smoothstep(0.022, 0.038, edge);
    // At rest: a dark sticker whose bars glow faintly, data waiting to be read.
    vec3 idle = mix(vec3(0.012, 0.014, 0.022), uPaper, ink) + uPaper * rim * 0.35;
    // Being read: the sticker turns mid cyan (never white) with dark bars, and a thin rim blooms.
    float hot = clamp(uLit + uFlash * 0.8, 0.0, 1.4);
    vec3 lit = mix(uHot * (0.2 + 0.05 * hot + 0.25 * uFlash), vec3(0.004, 0.006, 0.012), ink) + uHot * rim * 1.5 * hot;
    vec3 c = mix(idle, lit, smoothstep(0.0, 0.5, hot));
    gl_FragColor = vec4(c, uAlpha);
  }
`

const fanVertex = /* glsl */ `
  attribute vec2 aUv;
  varying vec2 vF;
  void main() {
    vF = aUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fanFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOn;
  uniform float uTime;
  varying vec2 vF;
  void main() {
    float u = vF.x;                                   // 0 at the aperture, 1 at the label
    float v = clamp(vF.y / max(u, 1e-4), 0.0, 1.0);   // undo the triangle's convergence
    float x = abs(v - 0.5) * 2.0;
    float sheet = (1.0 - x * x) * 0.075 + exp(-x * x * 60.0) * 0.08;
    float edge = smoothstep(0.9, 0.985, x) * (1.0 - smoothstep(0.985, 1.0, x)) * 0.27;
    float a = (sheet + edge) * (0.45 + 0.8 * (1.0 - u));
    a *= 1.0 - 0.45 * smoothstep(0.9, 1.0, u);       // the scan line, not the fan, owns the label
    a *= 0.9 + 0.1 * sin(uTime * 90.0 + u * 40.0);
    gl_FragColor = vec4(uColor * a * uOn, 1.0);
  }
`

const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOn;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float across = exp(-q.y * q.y * 18.0);
    float along = 1.0 - smoothstep(0.7, 1.0, abs(q.x));
    gl_FragColor = vec4(uColor * across * along * uOn, 1.0);
  }
`

const coreFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOn;
  varying vec2 vUv;
  void main() {
    float ax = abs(vUv.x - 0.5) * 2.0;
    float along = 1.0 - smoothstep(0.88, 1.0, ax);
    float across = 1.0 - smoothstep(0.35, 1.0, abs(vUv.y - 0.5) * 2.0);
    float spot = 1.0 + 1.2 * exp(-ax * ax * 60.0);
    gl_FragColor = vec4(uColor * along * across * spot * uOn, 1.0);
  }
`

const spriteVertex = /* glsl */ `
  uniform float uViewH;
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = length(modelMatrix[0].xyz);
    gl_PointSize = uSize * s * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z;
  }
`
const emitFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    float a = exp(-d * 6.0) * 0.5 + exp(-d * 40.0) * 0.8;
    gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
  }
`

const plusOneFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * t);
  }
  void main() {
    vec2 p = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y); // y up
    float d = sdSeg(p, vec2(0.12, 0.5), vec2(0.44, 0.5));
    d = min(d, sdSeg(p, vec2(0.28, 0.34), vec2(0.28, 0.66)));
    d = min(d, sdSeg(p, vec2(0.67, 0.25), vec2(0.67, 0.76)));
    d = min(d, sdSeg(p, vec2(0.67, 0.76), vec2(0.555, 0.665)));
    d = min(d, sdSeg(p, vec2(0.56, 0.25), vec2(0.78, 0.25)));
    float stroke = 1.0 - smoothstep(0.03, 0.041, d);
    float halo = exp(-d * 15.0) * 0.1;
    gl_FragColor = vec4(uColor * (stroke + halo) * uAlpha, 1.0);
  }
`

/** The shared draw-on line, with a gentler draw head so leading ends never outshine settled lines. */
function softLine(color: THREE.Color, opacity: number) {
  const m = makeLineMaterial(color, opacity)
  m.fragmentShader = m.fragmentShader.replace('(1.0 + head * 2.0)', '(1.0 + head * 0.5)')
  return m
}

// ---- Geometry helpers ---------------------------------------------------------------------
function gunGeometry() {
  // Side profiles in (forward, up): a head that flares toward the scan window, a pistol grip raked
  // well back, and a separate narrow hooked trigger.
  const head: [number, number][] = [
    [-0.2, 0.035],
    [0.13, 0.08],
    [0.185, 0.105],
    [0.185, -0.1],
    [0.13, -0.09],
    [0.0, -0.068],
    [-0.205, -0.03],
  ]
  const grip: [number, number][] = [
    [-0.03, -0.02],
    [-0.05, -0.075],
    [-0.14, -0.31],
    [-0.165, -0.336],
    [-0.205, -0.336],
    [-0.225, -0.31],
    [-0.15, -0.02],
  ]
  // Visible grip outline: starts and ends where the grip meets the head's underside.
  const gripLine: [number, number][] = [[-0.0444, -0.0597], ...grip.slice(1, 6), [-0.155, -0.0393]]
  // Trigger sits forward of the grip with a clear gap so it reads at slide size.
  const trigger: [number, number][] = [
    [0.0, -0.055],
    [0.006, -0.1],
    [-0.008, -0.13],
    [-0.028, -0.123],
    [-0.019, -0.097],
    [-0.032, -0.06],
  ]
  const triggerLine: [number, number][] = [[0.003, -0.067], ...trigger.slice(1, 5), [-0.031, -0.065]]
  const BEV = 0.012
  const BS = 0.0035 // bevel bulge: small, so the cap outlines sit on the silhouette
  const lb = new LineBuilder()
  const ty = (y: number) => THREE.MathUtils.clamp((y + 0.34) / 0.45, 0, 1)
  const part = (pts: [number, number][], D: number, line: [number, number][] | null = null) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: BEV, bevelSize: BS, bevelSegments: 4 })
    g.translate(0, 0, -D / 2)
    g.rotateY(-Math.PI / 2) // shape x -> local +z (forward), extrusion -> local x
    g.computeVertexNormals()
    // Outline both flat side caps; drawn on from the grip upward.
    for (const x of [-(D / 2 + BEV + 0.0015), D / 2 + BEV + 0.0015]) {
      // Each segment draws at its own height, so the whole gun outlines bottom-up.
      const list = line ?? [...pts, pts[0]]
      for (let i = 0; i + 1 < list.length; i++) {
        const [z, y] = list[i]
        const [z2, y2] = list[i + 1]
        lb.seg([x, y, z], [x, y2, z2], ty(y), ty(y2))
      }
    }
    return g
  }
  const HD = 0.15
  const headGeo = part(head, HD)
  const gripGeo = part(grip, 0.095, gripLine)
  const triggerGeo = part(trigger, 0.034, triggerLine)
  const nose = 0.185 + BS
  // Bezel around the scan window.
  const bw = 0.068
  const bz = nose + 0.002
  const edges = lb.build()
  // Quiet tier: window bezel and cross edges that close the shell (nose crest, chin, crown, butt).
  const dl = new LineBuilder()
  dl.poly([[-bw, 0.086, bz], [bw, 0.086, bz], [bw, -0.081, bz], [-bw, -0.081, bz]], 0.8, 1.0, true)
  // Each cross edge starts on one cap corner, rides over the bevel and ends on the other, so the
  // corners close.
  const cross = (z: number, y: number, dz: number, dy: number, D: number, t0: number, t1: number) => {
    const xc = D / 2 + BEV + 0.0015
    const xi = D / 2
    const oz = z + dz * BS * 1.2
    const oy = y + dy * BS * 1.2
    dl.poly([[-xc, y, z], [-xi, oy, oz], [xi, oy, oz], [xc, y, z]], t0, t1)
  }
  cross(0.185, 0.105, 0.7, 0.7, HD, 0.8, 1.0)
  cross(0.185, -0.1, 0.7, -0.7, HD, 0.6, 0.8)
  cross(-0.2, 0.035, -0.7, 0.7, HD, 0.8, 1.0)
  cross(-0.185, -0.336, 0, -1, 0.095, 0.0, 0.2)
  const detail = dl.build()
  return { headGeo, gripGeo, triggerGeo, edges, detail, D: HD, nose }
}

function cartonLines(c: Carton) {
  // Front face plus the top edges: enough to read as a volume, nothing behind.
  const z = c.d / 2 + 0.005
  const x = c.w / 2 + 0.0005
  const y = c.h + 0.005
  const pos = [
    ...[-x, 0, z, x, 0, z, x, 0, z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, 0, z],
    ...[x, y, z, x, y, -z, x, y, -z, -x, y, -z, -x, y, -z, -x, y, z],
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

// ---- Component ----------------------------------------------------------------------------
export default function InventoryShelf({ progress = 1, accent, variant }: ModelProps) {
  const prog = useRef(progress)
  prog.current = progress
  const uprights = useRef<THREE.Group>(null)
  const gun = useRef<THREE.Group>(null)
  const scan = useRef<THREE.Group>(null)
  const jbox = useRef<THREE.Group>(null)
  const cartonRefs = useRef<(THREE.Group | null)[]>([])
  const clock = useRef(T0)

  const B = useMemo(() => {
    const laser = accent ? new THREE.Color(accent) : new THREE.Color(1.0, 0.1, 0.05)
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }

    // Materials
    const steel = satinShader(false, new THREE.Color(0.016, 0.019, 0.034), { sheen: 1.0, warm: 0.6 })
    const deckMat = satinShader(false, new THREE.Color(0.009, 0.01, 0.019), { sheen: 0.5, warm: 0.4 })
    const cards = CARTONS.map(() => {
      const m = satinShader(false, new THREE.Color(0.022, 0.017, 0.022), { sheen: 0.5, warm: 0.9 })
      m.uniforms.uAlpha = { value: 0 }
      m.fragmentShader = m.fragmentShader
        .replace('uniform float uWarm;', 'uniform float uWarm;\n  uniform float uAlpha;')
        .replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, uAlpha);')
      m.transparent = true
      return m
    })
    const gunMat = satinShader(false, new THREE.Color(0.015, 0.018, 0.032), { sheen: 0.85, warm: 0.7 })
    const frontLines = softLine(glow(palette.ice, 2.5), 0.95)
    const braceLines = softLine(glow(palette.ice, 1.0), 0.55)
    const backLines = softLine(glow(palette.ice, 1.0), 0.7)
    const gunLines = softLine(glow(palette.ice, 2.5), 0.95)
    const gunDetail = softLine(glow(palette.ice, 0.9), 0.8)
    const cartonLineMats = CARTONS.map(() => new THREE.LineBasicMaterial({ color: glow(palette.ember, 0.55), ...additive, opacity: 0 }))
    // Packing tape: a slightly lighter satin strip over the top and down the front flap.
    const tapeMats = CARTONS.map(() => {
      const m = satinShader(false, new THREE.Color(0.034, 0.025, 0.019), { sheen: 0.5, warm: 1.0 })
      m.uniforms.uAlpha = { value: 0 }
      m.fragmentShader = m.fragmentShader
        .replace('uniform float uWarm;', 'uniform float uWarm;\n  uniform float uAlpha;')
        .replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, uAlpha);')
      m.transparent = true
      return m
    })
    const cordMat = new THREE.LineBasicMaterial({ color: glow(palette.ice, 1.35), ...additive, opacity: 0.9 })
    const gridMat = makeGridMaterial(glow(palette.ice, 0.45), 0.25, 2.0, 1.5)
    const ledMat = new THREE.MeshBasicMaterial({ color: glow(palette.jade, 0.3), toneMapped: false })
    const windowMat = new THREE.MeshBasicMaterial({ color: laser.clone().multiplyScalar(0.55), toneMapped: false })
    const apertureMat = new THREE.MeshBasicMaterial({ color: laser.clone().multiplyScalar(6), ...additive, opacity: 0 })
    const fanMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: laser.clone().multiplyScalar(5) }, uOn: { value: 0 }, uTime: { value: 0 } },
      vertexShader: fanVertex,
      fragmentShader: fanFragment,
      side: THREE.DoubleSide,
      ...additive,
    })
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: laser.clone().multiplyScalar(7) }, uOn: { value: 0 } },
      vertexShader: uvVertex,
      fragmentShader: coreFragment,
      ...additive,
    })
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: laser.clone().multiplyScalar(1.6) }, uOn: { value: 0 } },
      vertexShader: uvVertex,
      fragmentShader: haloFragment,
      ...additive,
    })
    const plusMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(palette.ember, 2.0) }, uAlpha: { value: 0 }, uViewH: { value: 1080 }, uSize: { value: 0.3 } },
      vertexShader: spriteVertex,
      fragmentShader: plusOneFragment,
      ...additive,
    })
    const emitMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: laser.clone().multiplyScalar(3.5) }, uAlpha: { value: 0 }, uViewH: { value: 1080 }, uSize: { value: 0.11 } },
      vertexShader: spriteVertex,
      fragmentShader: emitFragment,
      ...additive,
    })
    const emitGeo = new THREE.BufferGeometry()
    emitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const labelMats = CARTONS.map(
      (c) =>
        new THREE.ShaderMaterial({
          uniforms: {
            uBars: { value: chunk(barIntervals(PATTERNS[c.pat])) },
            uPaper: { value: new THREE.Color(0.62, 0.7, 0.82).multiplyScalar(0.13) },
            uHot: { value: new THREE.Color(0.12, 0.72, 1.0) },
            uLit: { value: 0 },
            uFlash: { value: 0 },
            uAlpha: { value: 0 },
          },
          transparent: true,
          vertexShader: uvVertex,
          fragmentShader: labelFragment,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
        }),
    )

    // Rack linework. Front face silhouettes bright, back and bracing quiet.
    const fl = new LineBuilder()
    const bl = new LineBuilder()
    const br = new LineBuilder()
    const zf = ZF + POST / 2
    for (const [x, side] of [
      [RX0, -1],
      [RX1, 1],
    ] as const) {
      const xo = x + (side * POST) / 2
      fl.seg([xo, FLOOR, zf], [xo, YT, zf], POST_WIN[0] * 1.16, POST_WIN[1] * 1.16)
      bl.seg([xo, FLOOR, ZB - POST / 2], [xo, YT, ZB - POST / 2], POST_WIN[0] * 1.16, POST_WIN[1] * 1.16)
      bl.seg([xo, FLOOR, zf], [xo, FLOOR, ZB - POST / 2], 0.06, 0.12)
      bl.seg([xo, YT, zf], [xo, YT, ZB - POST / 2], POST_WIN[1] * 1.16, POST_WIN[1] * 1.16 + 0.04)
      // Side bracing zig-zag.
      const pts: [number, number, number][] = []
      const n = 6
      for (let i = 0; i <= n; i++) {
        const y = FLOOR + 0.1 + (i / n) * (YT - FLOOR - 0.2)
        pts.push([xo + side * 0.001, y, i % 2 === 0 ? ZF - 0.02 : ZB + 0.02])
      }
      br.poly(pts, POST_WIN[0] * 1.16 + 0.05, POST_WIN[1] * 1.16)
    }
    DECKS.forEach((y, i) => {
      const t0 = deckWin(i)[0] * 1.16
      const t1 = deckWin(i)[1] * 1.16
      const zl = ZF + 0.035
      fl.seg([RX0 - POST / 2, y, zl], [RX1 + POST / 2, y, zl], t0, t1)
      bl.seg([RX0 - POST / 2, y - LIP, zl], [RX1 + POST / 2, y - LIP, zl], t0, t1)
      bl.seg([RX0, y, ZB], [RX1, y, ZB], t0, t1)
    })
    // Cord junction box at the foot of the right upright.
    const jb = new LineBuilder()
    jb.poly([[-0.0275, 0, 0.0355], [0.0275, 0, 0.0355], [0.0275, 0.0705, 0.0355], [-0.0275, 0.0705, 0.0355]], 0, 1, true)
    jb.poly([[-0.0275, 0.0705, 0.0355], [-0.0275, 0.0705, -0.0355], [0.0275, 0.0705, -0.0355], [0.0275, 0.0705, 0.0355]], 0.5, 1)
    const jBoxGeo = jb.build()
    const jBoxLines = softLine(glow(palette.ice, 1.0), 0.7)
    const frontGeo = fl.build()
    const braceGeo = br.build()
    const backGeo = bl.build()

    const gunG = gunGeometry()
    const cartonLineGeos = CARTONS.map(cartonLines)

    // Fan: apex at the aperture, base on the scan line. Positions written each frame.
    const fanGeo = new THREE.BufferGeometry()
    fanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    fanGeo.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1]), 2))
    fanGeo.computeBoundingSphere()

    const cordGeo = new THREE.BufferGeometry()
    cordGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CORD_N * 3), 3))
    const plusGeo = new THREE.BufferGeometry()
    plusGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))

    return {
      steel,
      deckMat,
      cards,
      gunMat,
      frontLines,
      backLines,
      gunLines,
      gunDetail,
      cartonLineMats,
      tapeMats,
      cordMat,
      gridMat,
      windowMat,
      apertureMat,
      fanMat,
      coreMat,
      haloMat,
      plusMat,
      emitMat,
      emitGeo,
      labelMats,
      laser,
      ledMat,
      ember: new THREE.Color(palette.ember),
      jade: new THREE.Color(palette.jade),
      deckRefs: [] as (THREE.Group | null)[],
      frontGeo,
      jBoxGeo,
      jBoxLines,
      postGeo: new RoundedBoxGeometry(POST, YT - FLOOR, POST, 2, 0.008),
      // Unit box, scaled per carton: a slight bevel (~1 cm) so rims catch the satin sheen.
      cartonGeo: new RoundedBoxGeometry(1, 1, 1, 3, 0.022),
      braceGeo,
      braceLines,
      backGeo,
      gunG,
      cartonLineGeos,
      fanGeo,
      cordGeo,
      plusGeo,
      labels: CARTONS.map(labelPos),
    }
  }, [accent])

  const tmp = useMemo(
    () => ({
      aim: new THREE.Vector3(),
      gp: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      emit: new THREE.Vector3(),
      butt: new THREE.Vector3(),
      v: new THREE.Vector3(),
      n1: new THREE.Vector3(),
      n2: new THREE.Vector3(),
      tan: new THREE.Vector3(),
      buf: new THREE.Vector2(),
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
    }),
    [],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const p = prog.current
    // Until the laser powers up, park the read cycle just before the first label's laser-on, so the
    // first scan (and its "+1") always happens in view of the build, never mid-flight.
    if (p < 0.8) clock.current = ON0 - 0.02
    else clock.current += dt
    const t = clock.current

    // --- Build-in -------------------------------------------------------------------------
    // Rack line times run 0..~0.4 (= progress * 1.16); everything is drawn by p = 0.35.
    const reveal = p < 0.6 ? p * 1.16 : 1
    B.frontLines.uniforms.uReveal.value = reveal
    B.backLines.uniforms.uReveal.value = reveal
    B.braceLines.uniforms.uReveal.value = reveal
    B.gridMat.uniforms.uReveal.value = easeOutCubic(seg(p, 0.0, 0.45))
    const upK = seg(p, POST_WIN[0], POST_WIN[1]) // linear: the steel tracks its line's draw head
    if (uprights.current) {
      uprights.current.scale.set(1, Math.max(upK, 1e-4), 1)
      uprights.current.visible = upK > 1e-3
    }
    B.deckRefs.forEach((d, i) => {
      if (!d) return
      // Linear, so the steel stays glued to its edge line's draw head.
      const k = seg(p, deckWin(i)[0], deckWin(i)[1])
      d.scale.set(Math.max(k, 1e-4), 1, 1)
      d.visible = k > 1e-3
    })
    CARTONS.forEach((c, i) => {
      const g = cartonRefs.current[i]
      if (!g) return
      const [w0, w1] = cartonWin(i)
      const k = easeOutCubic(seg(p, w0, w1))
      const a = easeOutCubic(seg(k, 0, 0.25))
      g.visible = a > 1e-3
      // Stocked from the front: slides back onto the deck with a tiny settle, inside the bay.
      g.position.set(c.x, DECKS[c.deck] + (1 - k) * 0.03, FRONT - c.d / 2 + (1 - k) * 0.2)
      B.cards[i].uniforms.uAlpha.value = a
      B.cartonLineMats[i].opacity = 0.6 * a
      B.tapeMats[i].uniforms.uAlpha.value = a
      B.labelMats[i].uniforms.uAlpha.value = a
    })

    const gunK = easeOutCubic(seg(p, 0.56, 0.74))
    B.gunLines.uniforms.uReveal.value = seg(p, 0.56, 0.69)
    B.gunDetail.uniforms.uReveal.value = seg(p, 0.56, 0.69)
    B.jBoxLines.uniforms.uReveal.value = seg(p, 0.56, 0.64)
    if (jbox.current) {
      const jk = easeOutCubic(seg(p, 0.56, 0.64))
      jbox.current.scale.setScalar(Math.max(jk, 1e-4))
      jbox.current.visible = jk > 1e-3
    }
    // The laser ignites as the scanner settles; the first count is only released after it.
    const on = easeOutCubic(seg(p, 0.8, 0.92))
    const count = easeOutCubic(seg(p, 0.9, 1.0))

    // --- Read cycle (stateless in t) ------------------------------------------------------
    const cyc = Math.floor(t / PERIOD)
    const ph = t - cyc * PERIOD
    const cur = SEQ[cyc % SEQ.length]
    const prev = SEQ[(cyc + SEQ.length - 1) % SEQ.length]
    const { aim, gp, m, q, up, emit, butt } = tmp
    if (ph < TURN) aim.lerpVectors(B.labels[prev], B.labels[cur], easeInOutCubic(ph / TURN))
    else aim.copy(B.labels[cur])
    const beam = THREE.MathUtils.smoothstep(ph, ON0, ON1) * (1 - THREE.MathUtils.smoothstep(ph, OFF0, OFF1)) * on

    // Gun: hover, bob, aim.
    gp.set(GUN.x, GUN.y + Math.sin(t * 1.3) * 0.012 - (1 - gunK) * 0.25, GUN.z + Math.sin(t * 0.9) * 0.006)
    m.lookAt(aim, gp, up)
    q.setFromRotationMatrix(m)
    if (gun.current) {
      gun.current.position.copy(gp)
      gun.current.quaternion.copy(q)
      gun.current.scale.setScalar(Math.max(gunK, 1e-4) * GUN_S)
      gun.current.visible = gunK > 1e-3
      gun.current.updateMatrix()
      emit.copy(WIN_LOCAL).applyMatrix4(gun.current.matrix)
      butt.copy(BUTT_LOCAL).applyMatrix4(gun.current.matrix)
    }
    B.apertureMat.opacity = beam
    B.windowMat.color.copy(B.laser).multiplyScalar(0.07 * gunK + 0.12 * beam)

    // Fan + scan line, anchored to the exact label centre.
    const L = B.labels[cur]
    const half = LW * 0.5
    const fp = B.fanGeo.getAttribute('position') as THREE.BufferAttribute
    fp.setXYZ(0, emit.x, emit.y, emit.z)
    fp.setXYZ(1, L.x - half, L.y, L.z + 0.004)
    fp.setXYZ(2, L.x + half, L.y, L.z + 0.004)
    fp.needsUpdate = true
    B.fanGeo.computeBoundingSphere()
    B.fanMat.uniforms.uOn.value = beam * (1 - 0.3 * THREE.MathUtils.smoothstep(ph, READ + 0.05, READ + 0.4))
    ;(B.emitGeo.getAttribute('position') as THREE.BufferAttribute).setXYZ(0, emit.x, emit.y, emit.z)
    B.emitGeo.getAttribute('position').needsUpdate = true
    B.emitMat.uniforms.uAlpha.value = beam
    B.emitMat.uniforms.uViewH.value = state.gl.getDrawingBufferSize(tmp.buf).y
    B.fanMat.uniforms.uTime.value = t
    const flicker = 0.88 + 0.12 * Math.sin(t * 73.0)
    B.coreMat.uniforms.uOn.value = beam * flicker
    B.haloMat.uniforms.uOn.value = beam
    if (scan.current) {
      scan.current.position.copy(L)
      scan.current.visible = beam > 1e-3
    }

    // Labels: the one under the beam leads; earlier reads fade quickly.
    CARTONS.forEach((_, i) => {
      // Most recent read time of carton i.
      let since = 99
      for (let k = 0; k < SEQ.length + 1; k++) {
        const c = cyc - k
        if (c < 0) break
        if (SEQ[((c % SEQ.length) + SEQ.length) % SEQ.length] !== i) continue
        const rt = c * PERIOD + READ
        if (rt <= t) {
          since = t - rt
          break
        }
      }
      const active = i === cur ? beam : 0
      const flash = since < 99 ? Math.exp(-since * 6) : 0
      const after = since < 99 ? Math.exp(-since * 1.6) * 0.25 : 0
      const hold = active * (ph > READ ? 1 : 0.25)
      B.labelMats[i].uniforms.uLit.value = (Math.max(hold * 0.9, after) + 0.0) * on
      B.labelMats[i].uniforms.uFlash.value = flash * count
      B.cartonLineMats[i].color.copy(B.ember).multiplyScalar(0.55 + (Math.max(hold * 1.8, after * 3) + flash * 1.5) * on)
    })

    // The single "+1" from the latest read.
    const lastRead = Math.floor((t - READ) / PERIOD)
    const age = lastRead >= 0 ? (t - (lastRead * PERIOD + READ)) / MOTE_LIFE : 99
    const src = B.labels[SEQ[((lastRead % SEQ.length) + SEQ.length) % SEQ.length]]
    const pp = B.plusGeo.getAttribute('position') as THREE.BufferAttribute
    const rise = easeOutCubic(Math.min(age, 1))
    pp.setXYZ(0, src.x - 0.03, src.y + LH * 0.5 + 0.17 + rise * 0.2, src.z + 0.14)
    pp.needsUpdate = true
    const aIn = THREE.MathUtils.smoothstep(age, 0, 0.08)
    const aOut = 1 - THREE.MathUtils.smoothstep(age, 0.45, 0.9)
    B.plusMat.uniforms.uAlpha.value = age <= 1 ? aIn * aOut * count : 0
    B.ledMat.color.copy(B.jade).multiplyScalar(0.35 * gunK + (age <= 1 ? 3.2 * Math.exp(-age * MOTE_LIFE * 5) * count : 0))
    B.plusMat.uniforms.uViewH.value = state.gl.getDrawingBufferSize(tmp.buf).y

    // Coiled cord: butt -> drops -> floor -> rack post.
    const cv = tmp.curve.points
    cv[0].copy(butt)
    cv[1].set(butt.x + 0.02, butt.y - 0.24, butt.z - 0.02)
    cv[2].set((butt.x + CORD_END.x) / 2 + 0.12, FLOOR + 0.05, (butt.z + CORD_END.z) / 2 + 0.06)
    cv[3].copy(CORD_END)
    const cp = B.cordGeo.getAttribute('position') as THREE.BufferAttribute
    const { v, n1, n2, tan } = tmp
    // Points run from the floor anchor up to the gun, so the build draws the cord toward the gun.
    for (let i = 0; i < CORD_N; i++) {
      const u = 1 - i / (CORD_N - 1)
      tmp.curve.getPointAt(u, v)
      tmp.curve.getTangentAt(u, tan)
      n1.crossVectors(tan, up)
      if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0)
      n1.normalize()
      n2.crossVectors(tan, n1).normalize()
      const coil = THREE.MathUtils.smoothstep(u, 0.02, 0.08) * (1 - THREE.MathUtils.smoothstep(u, 0.5, 0.6))
      const a = u * Math.PI * 2 * 11
      const r = 0.028 * coil
      const y = v.y + (n1.y * Math.cos(a) + n2.y * Math.sin(a)) * r
      cp.setXYZ(i, v.x + (n1.x * Math.cos(a) + n2.x * Math.sin(a)) * r, Math.max(y, FLOOR + 0.006), v.z + (n1.z * Math.cos(a) + n2.z * Math.sin(a)) * r)
    }
    cp.needsUpdate = true
    B.cordGeo.setDrawRange(0, Math.floor(CORD_N * seg(p, 0.56, 0.68)))
    B.cordGeo.computeBoundingSphere()
  })

  const deckW = RX1 - RX0
  const deckD = ZF - ZB + POST
  const postH = YT - FLOOR

  return (
    <group>
      {variant !== 'bare' && (
        <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR - 0.002, 0.15]} material={B.gridMat} renderOrder={-1}>
          <planeGeometry args={[4.0, 3.0]} />
        </mesh>
      )}

      {/* Rack */}
      <group ref={uprights} position={[0, FLOOR, 0]}>
        {[RX0, RX1].flatMap((x) =>
          [ZF, ZB].map((z) => (
            <mesh key={`${x}${z}`} material={B.steel} position={[x, postH / 2, z]}>
              <primitive object={B.postGeo} attach="geometry" />
            </mesh>
          )),
        )}
      </group>
      {/* Cord anchor: a small junction box at the foot of the right upright, arriving with the cord. */}
      <group ref={jbox} position={[RX1 + 0.058, FLOOR + 0.08, ZF]}>
        <mesh material={B.steel} position={[0, 0.035, 0]}>
          <boxGeometry args={[0.055, 0.07, 0.07]} />
        </mesh>
        <lineSegments geometry={B.jBoxGeo} material={B.jBoxLines} />
      </group>
      <group position={[RX0, 0, 0]}>
        {DECKS.map((y, i) => (
          <group
            key={y}
            position={[0, y, 0]}
            ref={(el) => {
              B.deckRefs[i] = el
            }}
          >
            <mesh material={B.deckMat} position={[deckW / 2, -0.014, (ZF + ZB) / 2]}>
              <boxGeometry args={[deckW, 0.028, deckD]} />
            </mesh>
            <mesh material={B.steel} position={[deckW / 2, -LIP / 2, ZF + 0.0175]}>
              <boxGeometry args={[deckW + POST, LIP, 0.035]} />
            </mesh>
            <mesh material={B.steel} position={[deckW / 2, -LIP / 2, ZB]}>
              <boxGeometry args={[deckW, LIP, 0.03]} />
            </mesh>
          </group>
        ))}
      </group>
      <lineSegments geometry={B.frontGeo} material={B.frontLines} />
      <lineSegments geometry={B.braceGeo} material={B.braceLines} />
      <lineSegments geometry={B.backGeo} material={B.backLines} />

      {/* Cartons */}
      {CARTONS.map((c, i) => (
        <group
          key={i}
          ref={(el) => {
            cartonRefs.current[i] = el
          }}
        >
          <mesh material={B.cards[i]} position={[0, c.h / 2, 0]} scale={[c.w, c.h, c.d]}>
            <primitive object={B.cartonGeo} attach="geometry" />
          </mesh>
          <lineSegments geometry={B.cartonLineGeos[i]} material={B.cartonLineMats[i]} />
          <mesh material={B.tapeMats[i]} position={[0, c.h + 0.0015, 0]}>
            <boxGeometry args={[0.075, 0.003, c.d + 0.003]} />
          </mesh>
          <mesh material={B.tapeMats[i]} position={[0, c.h - Math.min(0.09, c.h * 0.22) / 2, c.d / 2 + 0.0015]}>
            <boxGeometry args={[0.075, Math.min(0.09, c.h * 0.22), 0.003]} />
          </mesh>
          <mesh material={B.labelMats[i]} position={[c.lx, c.ly, c.d / 2 + 0.002]}>
            <planeGeometry args={[LW, LH]} />
          </mesh>
        </group>
      ))}

      {/* Scanner gun */}
      <group ref={gun}>
        <mesh geometry={B.gunG.headGeo} material={B.gunMat} />
        <mesh geometry={B.gunG.gripGeo} material={B.gunMat} />
        <mesh geometry={B.gunG.triggerGeo} material={B.gunMat} />
        <lineSegments geometry={B.gunG.edges} material={B.gunLines} />
        <lineSegments geometry={B.gunG.detail} material={B.gunDetail} />
        <mesh position={[0, 0.0025, B.gunG.nose + 0.0015]} material={B.windowMat}>
          <planeGeometry args={[0.115, 0.15]} />
        </mesh>
        <mesh position={[0, WIN_LOCAL.y, B.gunG.nose + 0.003]} material={B.apertureMat}>
          <planeGeometry args={[0.095, 0.016]} />
        </mesh>
        <mesh position={[0.075 + 0.0125, 0.012, -0.15]} rotation-y={Math.PI / 2} material={B.ledMat}>
          <circleGeometry args={[0.012, 16]} />
        </mesh>
      </group>
      <line>
        <primitive object={B.cordGeo} attach="geometry" />
        <primitive object={B.cordMat} attach="material" />
      </line>

      {/* Laser */}
      <mesh geometry={B.fanGeo} material={B.fanMat} frustumCulled={false} renderOrder={2} />
      <group ref={scan}>
        <mesh material={B.haloMat} position={[0, 0, 0.005]} renderOrder={2}>
          <planeGeometry args={[LW * 1.1, 0.04]} />
        </mesh>
        <mesh material={B.coreMat} position={[0, 0, 0.006]} renderOrder={2}>
          <planeGeometry args={[LW * 1.05, 0.0075]} />
        </mesh>
      </group>
      <points geometry={B.emitGeo} material={B.emitMat} frustumCulled={false} renderOrder={3} />
      <points geometry={B.plusGeo} material={B.plusMat} frustumCulled={false} renderOrder={3} />
    </group>
  )
}

function chunk(a: number[]) {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < a.length; i += 2) out.push(new THREE.Vector2(a[i], a[i + 1]))
  return out
}
