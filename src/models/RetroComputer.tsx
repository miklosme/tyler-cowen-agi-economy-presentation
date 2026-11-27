/**
 * RetroComputer: a 1995 desktop PC in the luminous-instrument language.
 *
 * Desktop case (drive bays, turbo/HDD LEDs), a chunky CRT with a deep rear bell and a curved
 * screen, and a keyboard. The CRT is the focal light: amber phosphor showing a spreadsheet grid
 * and a stepped line chart that climbs, with scanlines, a rolling refresh band and flicker.
 * Build-in: case rises, monitor settles onto it, keyboard slides in, keys pop on, then the CRT
 * powers on (a hot horizontal line that opens into the picture).
 * Variants: "default" (amber phosphor), "green" (green phosphor), "bare" (no floor grid).
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  LineBuilder,
  easeOutCubic,
  hash,
  makeGridMaterial,
  makeLineMaterial,
  roundedRect,
  satin,
  satinShader,
  seg,
} from './retrocomputer-parts/shared'

export const meta: ModelMeta = {
  title: 'Retro computer (1995)',
  distance: 5.0,
  elevation: 15,
  azimuth: 42,
  variants: ['default', 'green'],
}

// ---- Layout (pre-scale units; the whole model is scaled by S) ------------------------------
const S = 1.22
const KSLOPE = Math.atan2(0.058, 0.5)
const X_AXIS = new THREE.Vector3(1, 0, 0)
const FLOOR = -0.72
// Case
const CW = 1.5
const CH = 0.3
const CD = 1.12
const CZ = -0.2 // case centre z
const CY = FLOOR + CH / 2
// Monitor
const MW = 1.2
const MH = 1.0
const MD = 0.22 // bezel depth
const MZ = 0.16 // bezel centre z
const MY = FLOOR + CH + 0.06 + MH / 2 // bezel centre y
const SW = 0.9 // screen size
const SH = 0.68
const SY = 0.045 // screen centre offset in bezel
const BELL = 0.62
// Keyboard
const KW = 1.42
const KD = 0.5
const KZ = 0.78

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const screenFragment = /* glsl */ `
  uniform vec3 uPhos;
  uniform float uTime;
  uniform float uPower;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;

  float h1(float n) { return fract(sin(n * 78.233) * 43758.5453); }
  float aaLine(float d, float w) { float f = fwidth(d) * 0.75; return 1.0 - smoothstep(w - f, w + f, d); }
  float box(vec2 p, vec2 a, vec2 b) {
    vec2 f = fwidth(p) * 0.75;
    vec2 s = smoothstep(a - f, a + f, p) * (1.0 - smoothstep(b - f, b + f, p));
    return s.x * s.y;
  }

  // Stepped growth curve: value at x (0..1) for 9 steps.
  float stepVal(float i) { return 0.1 + i * 0.08 + (h1(i + 3.0) - 0.5) * 0.04 + step(5.5, i) * 0.07; }

  vec3 content(vec2 uv, float t) {
    vec3 c = vec3(0.0);
    float lw = 0.003;
    // Menu bar.
    float menu = box(uv, vec2(0.04, 0.905), vec2(0.96, 0.955));
    float gaps = step(0.5, fract(uv.x * 9.0 + 0.2)) * step(0.3, h1(floor(uv.x * 9.0 + 0.2)));
    c += menu * (0.14 + 0.16 * gaps);

    // Spreadsheet: 6 columns x 6 rows.
    vec2 g0 = vec2(0.04, 0.66);
    vec2 g1 = vec2(0.96, 0.865);
    vec2 gp = (uv - g0) / (g1 - g0);
    float inG = box(uv, g0, g1);
    float colW = 1.0 / 3.0;
    float rowH = 1.0 / 3.0;
    float cx = fract(gp.x / colW);
    float cy = fract(gp.y / rowH);
    float ci = floor(gp.x / colW);
    float ri = floor(gp.y / rowH);
    float gridV = aaLine(abs(cx) * colW * (g1.x - g0.x), lw);
    float gridH = aaLine(abs(cy) * rowH * (g1.y - g0.y), lw);
    c += inG * max(gridV, gridH) * 0.4;
    // Header row and row-number column.
    float header = step(2.0, ri) + step(ci, 0.0);
    c += inG * min(header, 1.0) * 0.09;
    // Numbers: right-aligned dash bars per cell.
    float cellSeed = ci * 7.0 + ri * 13.0;
    float len = 0.35 + 0.5 * h1(cellSeed);
    float digits = step(1.0 - len - 0.08, cx) * step(cx, 0.9) * step(0.4, cy) * step(cy, 0.6);
    float ticks = 1.0;
    float isData = (1.0 - min(header, 1.0));
    c += inG * digits * ticks * (isData * 0.42 + (1.0 - isData) * 0.32);
    // Active cell: cursor walks down column 4, blinking.
    float actRow = mod(floor(t / 1.3), 2.0) + 1.0;
    float isActive = step(abs(ci - 2.0), 0.1) * step(abs(ri - (2.0 - actRow)), 0.1);
    float blink = 0.55 + 0.45 * step(0.5, fract(t * 1.6));
    c += inG * isActive * blink * 0.45;

    // Chart.
    vec2 a0 = vec2(0.09, 0.08);
    vec2 a1 = vec2(0.95, 0.6);
    vec2 cp = (uv - a0) / (a1 - a0);
    float inC = box(uv, a0 - vec2(0.01), a1 + vec2(0.0, 0.01));
    // Axes and faint gridlines.
    float axis = aaLine(abs(uv.x - a0.x), lw * 1.3) * step(a0.y, uv.y) * step(uv.y, a1.y)
               + aaLine(abs(uv.y - a0.y), lw * 1.3) * step(a0.x, uv.x) * step(uv.x, a1.x);
    c += axis * 0.6;
    float hg = aaLine(abs(fract(cp.y * 4.0 + 0.5) - 0.5) / 4.0 * (a1.y - a0.y), lw * 0.6) * step(0.05, cp.y);
    float dash = step(0.5, fract(cp.x * 40.0));
    c += inC * hg * dash * 0.22 * step(0.0, cp.x) * step(cp.x, 1.0);
    // Stepped line, drawn on in a loop.
    float cyc = mod(t + 6.0, 9.0);
    float drawn = clamp(cyc / 3.4, 0.0, 1.0);
    float fadeOut = 1.0 - smoothstep(8.5, 9.0, cyc);
    float n = 9.0;
    float xi = clamp(floor(cp.x * n), 0.0, n - 1.0);
    float v = stepVal(xi);
    float vPrev = stepVal(max(xi - 1.0, 0.0));
    float yv = a0.y + v * (a1.y - a0.y) / 1.0;
    float yp = a0.y + vPrev * (a1.y - a0.y) / 1.0;
    float within = step(0.0, cp.x) * step(cp.x, drawn);
    float horiz = aaLine(abs(uv.y - yv), lw * 4.6);
    float xEdge = a0.x + xi / n * (a1.x - a0.x);
    float vert = aaLine(abs(uv.x - xEdge) * uAspect, lw * 6.0) * step(min(yv, yp) - lw * 4.6, uv.y) * step(uv.y, max(yv, yp) + lw * 4.6) * step(0.5, xi);
    float lineM = max(horiz, vert) * within;
    // Fill under the curve.
    float fill = step(a0.y, uv.y) * step(uv.y, yv) * within * 0.12 * (0.6 + 0.4 * (uv.y - a0.y) / max(yv - a0.y, 0.001));
    // Bright head where the pen is.
    float headX = a0.x + drawn * (a1.x - a0.x);
    float headI = clamp(floor(drawn * n - 0.0001), 0.0, n - 1.0);
    float headY = a0.y + stepVal(headI) * (a1.y - a0.y);
    vec2 hd = (uv - vec2(headX, headY)) * vec2(uAspect, 1.0);
    float head = (exp(-dot(hd, hd) * 5000.0) + exp(-dot(hd, hd) * 900.0) * 0.35) * (0.75 + 0.25 * sin(t * 4.0));
    c += (lineM * 1.35 + fill + head * 2.0) * fadeOut;
    return c;
  }

  void main() {
    vec2 q = vUv - 0.5;
    // Barrel distortion of the picture (CRT curvature).
    vec2 qd = q * (1.0 + 0.07 * dot(q * vec2(1.0, 1.0), q));
    vec2 uv = qd + 0.5;
    // Rounded-corner tube mask.
    vec2 r = abs(qd * vec2(uAspect, 1.0)) - (vec2(0.5 * uAspect, 0.5) - 0.06);
    float sd = length(max(r, 0.0)) - 0.06;
    float mask = 1.0 - smoothstep(-0.004, 0.0, sd);

    float t = uTime;
    // Power-on: a hot horizontal line that opens into the full picture.
    float pw = uPower;
    float hs = smoothstep(0.0, 0.35, pw);
    float vs = mix(0.008, 1.0, smoothstep(0.32, 0.8, pw));
    float yy = (uv.y - 0.5) / vs + 0.5;
    float inV = step(abs(uv.y - 0.5), vs * 0.5);
    float inH = step(abs(uv.x - 0.5), hs * 0.5);
    float boost = 1.0 + 1.6 * (1.0 - smoothstep(0.3, 0.95, pw));

    vec3 pic = content(vec2(uv.x, yy), t);
    // Phosphor base glow + vignette.
    float vig = 1.0 - dot(q, q) * 1.5;
    float base = 0.012 * vig;
    float scan = 0.8 + 0.2 * sin(uv.y * 3.14159 * 2.0 * 52.0);
    float rz = (fract(uv.y - t * 0.11) - 0.5) * 9.0;
    float roll = 0.07 * exp(-rz * rz);
    float flick = 0.965 + 0.035 * sin(t * 59.0) * sin(t * 7.3);
    float lum = (pic.r + base + roll) * scan * flick;
    vec3 col = uPhos * lum * 1.45 * max(vig, 0.0) * boost;
    col *= inV * inH * mask * step(0.001, pw);

    // Glass: faint fresnel rim and a soft window reflection, visible even when off.
    float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
    float refl = (1.0 - smoothstep(0.0, 0.18, abs(q.x + q.y * 0.6 + 0.22))) * (1.0 - smoothstep(0.1, 0.5, length(q - vec2(-0.2, 0.25)))) * 0.04;
    vec3 glass = vec3(0.02, 0.025, 0.04) + vec3(0.5, 0.7, 1.0) * (fres * 0.18 + refl) ;
    gl_FragColor = vec4(col + glass * mask + vec3(0.004, 0.005, 0.01) * (1.0 - mask), 1.0);
  }
`

/** Maps unit-box coordinates to the CRT's tapering rear bulb (front z=+0.5 full size). */
function bellMap(x: number, y: number, z: number): [number, number, number] {
  const t = 0.5 - z // 0 front .. 1 back
  const u = Math.min(1, Math.max(0, (t - 0.12) / 0.7))
  const k = u * u * (3 - 2 * u) // straight housing, curved taper, then a short neck
  const sx = 1 - 0.5 * k
  const sy = 1 - 0.5 * k
  return [x * sx, y * sy - 0.1 * k, z]
}

/** The CRT's rear bell: a rounded box pinched into a bulb. */
function bellGeometry() {
  const g = new RoundedBoxGeometry(1, 1, 1, 4, 0.1)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = bellMap(p.getX(i), p.getY(i), p.getZ(i))
    p.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}

/** Keyboard wedge: back taller than front. */
function wedgeGeometry() {
  const g = new THREE.BoxGeometry(KW, 1, KD)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const z = p.getZ(i)
    const top = z < 0 ? 0.1 : 0.042
    p.setY(i, y > 0 ? top : 0)
  }
  g.computeVertexNormals()
  return g
}

type Key = { x: number; z: number; w: number; d: number; order: number }

function keyLayout(): Key[] {
  const keys: Key[] = []
  const u = 0.066
  const gap = 0.008
  const x0 = -KW / 2 + 0.06
  const z0 = -KD / 2 + 0.06
  // Function row.
  for (let i = 0; i < 13; i++) {
    const grp = i === 0 ? 0 : Math.floor((i - 1) / 4) + 1
    keys.push({ x: x0 + i * u + grp * 0.03 + u / 2, z: z0, w: u - gap, d: u * 0.8 - gap, order: i })
  }
  // Main block rows: widths in units for the left/right specials.
  const rows: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.5, 1.25, 1.25, 6.5, 1.25, 1.25, 1.0, 1.0],
  ]
  rows.forEach((r, ri) => {
    let x = x0
    const z = z0 + 0.1 + ri * u
    r.forEach((w, i) => {
      keys.push({ x: x + (w * u) / 2, z, w: w * u - gap, d: u - gap, order: i + ri })
      x += w * u
    })
  })
  // Numpad.
  const nx = x0 + 15.6 * u + 0.05
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      keys.push({ x: nx + c * u + u / 2, z: z0 + 0.1 + r * u, w: u - gap, d: u - gap, order: 15 + c + r })
    }
  }
  return keys
}

export default function RetroComputer({ progress = 1, accent, variant }: ModelProps) {
  const prog = useRef(progress)
  prog.current = progress
  const caseRef = useRef<THREE.Group>(null)
  const monRef = useRef<THREE.Group>(null)
  const kbRef = useRef<THREE.Group>(null)

  const phosHex = accent ?? (variant === 'green' ? palette.jade : palette.ember)

  const B = useMemo(() => {
    const body = satinShader(false, new THREE.Color(0.013, 0.015, 0.025), { sheen: 0.9, warm: 0.7 })
    const bellMat = satinShader(false, new THREE.Color(0.012, 0.014, 0.024), { sheen: 0.85, warm: 0.55 })
    const bodyDark = satin('#0d1020', 0.6, 0.46)
    const deckMat = satinShader(false, new THREE.Color(0.01, 0.011, 0.02), { sheen: 0.8, warm: 0.6 })
    const keyMat = satinShader(true, new THREE.Color(0.02, 0.023, 0.04), { sheen: 1.1, warm: 0.5 })
    const lineCol = glow(palette.ice, 2.6)
    const caseLines = makeLineMaterial(lineCol.clone(), 0.95)
    const monLines = makeLineMaterial(lineCol.clone(), 0.95)
    const kbLines = makeLineMaterial(glow(palette.ice, 1.5), 0.75)
    const detailLines = makeLineMaterial(glow(palette.ice, 1.15), 0.8)
    const gridMat = makeGridMaterial(glow(palette.ice, 0.6), 0.25 / S, 1.8, 1.5)

    const screenMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhos: { value: new THREE.Color(phosHex) },
        uTime: { value: 0 },
        uPower: { value: 0 },
        uAspect: { value: SW / SH },
      },
      vertexShader: screenVertex,
      fragmentShader: screenFragment,
    })
    const ledPower = new THREE.MeshBasicMaterial({ color: glow(palette.jade, 2), toneMapped: false })
    const ledHdd = new THREE.MeshBasicMaterial({ color: glow(palette.ember, 2), toneMapped: false })
    const ledMon = new THREE.MeshBasicMaterial({ color: glow(palette.jade, 2), toneMapped: false })
    const slotMat = new THREE.MeshBasicMaterial({ color: '#020309' })

    // Geometries.
    const caseGeo = new RoundedBoxGeometry(CW, CH, CD, 3, 0.03)
    const bezelGeo = new RoundedBoxGeometry(MW, MH, MD, 4, 0.06)
    const bellGeo = bellGeometry()
    const standGeo = new THREE.CylinderGeometry(0.21, 0.25, 0.06, 40)
    const screenGeo = new THREE.PlaneGeometry(SW, SH, 32, 24)
    {
      const p = screenGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / (SW / 2)
        const y = p.getY(i) / (SH / 2)
        p.setZ(i, 0.035 * (1 - 0.5 * (x * x + y * y)))
      }
      screenGeo.computeVertexNormals()
    }
    const recessGeo = new RoundedBoxGeometry(SW + 0.07, SH + 0.07, 0.04, 3, 0.04)
    const wedgeGeo = wedgeGeometry()

    // Case linework: front rounded outline, top silhouette, drive bays, feet line.
    const fz = CZ + CD / 2 + 0.001
    const cl = new LineBuilder()
    cl.poly(roundedRect(CW - 0.004, CH - 0.004, 0.03, (x, y) => [x, CY + y, fz]), 0.0, 0.45, true)
    cl.poly(
      [
        [-CW / 2 + 0.001, CY + CH / 2 - 0.02, fz - 0.02],
        [-CW / 2 + 0.001, CY + CH / 2 - 0.02, CZ - CD / 2 + 0.03],
      ],
      0.2,
      0.5,
    )
    cl.poly(
      [
        [CW / 2 - 0.001, CY + CH / 2 - 0.02, fz - 0.02],
        [CW / 2 - 0.001, CY + CH / 2 - 0.02, CZ - CD / 2 + 0.03],
      ],
      0.2,
      0.5,
    )
    cl.poly(
      [
        [-CW / 2 + 0.03, CY + CH / 2 + 0.001, CZ - CD / 2 + 0.003],
        [CW / 2 - 0.03, CY + CH / 2 + 0.001, CZ - CD / 2 + 0.003],
      ],
      0.35,
      0.6,
    )
    // Drive bays (right half of the front).
    const dl = new LineBuilder() // case details
    const bl = new LineBuilder() // monitor details: bell
    const ml = new LineBuilder() // monitor outline + stand ring
    const bay = (cx: number, cy: number, w: number, h: number, t0: number) => {
      dl.poly(roundedRect(w, h, 0.008, (x, y) => [cx + x, cy + y, fz + 0.001], 2), t0, t0 + 0.25, true)
    }
    bay(0.36, CY + 0.065, 0.5, 0.085, 0.4)
    bay(0.36, CY - 0.045, 0.5, 0.085, 0.45)
    bay(-0.12, CY + 0.02, 0.3, 0.055, 0.5)
    dl.poly(roundedRect(0.034, 0.012, 0.004, (x, y) => [-0.035 + x, CY + 0.002 + y, fz + 0.002], 1), 0.55, 0.7, true)
    // Badge panel + vent slots on the left.
    for (let i = 0; i < 6; i++) {
      const x = -0.64 + i * 0.035
      dl.seg([x, CY - 0.08, fz + 0.001], [x, CY + 0.04, fz + 0.001], 0.55 + i * 0.03, 0.62 + i * 0.03)
    }
    // Power button ring.
    dl.poly(roundedRect(0.075, 0.075, 0.012, (x, y) => [-0.335 + x, CY - 0.04 + y, fz + 0.026], 2), 0.6, 0.8, true)
    // Lower side and back edges so the case keeps its footprint from any angle.
    for (const sx of [-1, 1]) {
      cl.seg([sx * (CW / 2 - 0.001), CY - CH / 2 + 0.02, fz - 0.02], [sx * (CW / 2 - 0.001), CY - CH / 2 + 0.02, CZ - CD / 2 + 0.03], 0.25, 0.55)
      cl.seg([sx * (CW / 2 - 0.001), CY - CH / 2 + 0.03, CZ - CD / 2 + 0.001], [sx * (CW / 2 - 0.001), CY + CH / 2 - 0.03, CZ - CD / 2 + 0.001], 0.5, 0.6)
    }
    cl.seg([-CW / 2 + 0.03, CY - CH / 2 + 0.02, CZ - CD / 2 - 0.001], [CW / 2 - 0.03, CY - CH / 2 + 0.02, CZ - CD / 2 - 0.001], 0.5, 0.65)
    // Stand foot ring.
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * Math.PI * 2
      const a1 = ((i + 1) / 40) * Math.PI * 2
      ml.seg([Math.cos(a0) * 0.252, CY + CH / 2 + 0.002, MZ - 0.25 + Math.sin(a0) * 0.252], [Math.cos(a1) * 0.252, CY + CH / 2 + 0.002, MZ - 0.25 + Math.sin(a1) * 0.252], 0.7, 0.8)
    }
    const caseLineGeo = cl.build()

    // Monitor linework: bezel outline, screen opening, bell silhouette.
    const bz = MZ + MD / 2 + 0.001
    ml.poly(roundedRect(MW - 0.006, MH - 0.006, 0.06, (x, y) => [x, MY + y, bz]), 0.0, 0.4, true)
    {
      // Bell silhouette: the top and side ridges follow the same taper as the body.
      const bw = MW * 0.96
      const bh = MH * 0.94
      const z0 = MZ - MD / 2
      const yC = MY - 0.02
      const toWorld = (x: number, y: number, z: number): [number, number, number] => {
        const [bx, by, bzz] = bellMap(x, y, z)
        return [bx * bw, yC + by * bh, z0 - BELL / 2 + 0.002 + bzz * BELL]
      }
      const ridge = (x: number, y: number, t0: number) => {
        const pts: [number, number, number][] = []
        for (let i = 0; i <= 12; i++) pts.push(toWorld(x, y, 0.4 - (0.8 * i) / 12))
        bl.poly(pts, t0, t0 + 0.3)
      }
      // Corner ridges sit on the rounded edge's 45-degree line; the rear loop is where the back rounds over.
      const e = 0.4 + 0.1 * Math.SQRT1_2 + 0.004
      ridge(-e, e, 0.3)
      ridge(e, e, 0.33)
      bl.poly(roundedRect(1.008, 1.008, 0.1, (x, y) => toWorld(x, y, -0.4)), 0.6, 0.8, true)
      // Vent slots on the bell's top.
      for (let i = 0; i < 7; i++) {
        const x = (-0.3 + i * 0.1) * 0.9
        const pts: [number, number, number][] = []
        for (let k = 0; k <= 4; k++) {
          const p = toWorld(x, 0.5, 0.18 - k * 0.1)
          pts.push([p[0], p[1] + 0.006, p[2]])
        }
        bl.poly(pts, 0.65 + i * 0.02, 0.75 + i * 0.02)
      }
    }
    const monLineGeo = ml.build()
    const detailGeo = dl.build()
    const bellLineGeo = bl.build()

    // Keyboard: outline on top + instanced caps.
    const kl = new LineBuilder()
    {
      const yb = 0.101
      const yf = 0.043
      const pts: [number, number, number][] = [
        [-KW / 2, yb, -KD / 2],
        [KW / 2, yb, -KD / 2],
        [KW / 2, yf, KD / 2],
        [-KW / 2, yf, KD / 2],
      ]
      kl.poly(pts, 0.0, 0.6, true)
      kl.seg([-KW / 2, 0.003, KD / 2 + 0.001], [KW / 2, 0.003, KD / 2 + 0.001], 0.3, 0.7)
    }
    const kbLineGeo = kl.build()
    const keys = keyLayout()
    const capGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.12)
    const caps = new THREE.InstancedMesh(capGeo, keyMat, keys.length)
    caps.frustumCulled = false

    return {
      body,
      bellMat,
      bodyDark,
      deckMat,
      caseLines,
      monLines,
      kbLines,
      detailLines,
      gridMat,
      screenMat,
      ledPower,
      ledHdd,
      ledMon,
      slotMat,
      caseGeo,
      bezelGeo,
      bellGeo,
      standGeo,
      screenGeo,
      recessGeo,
      wedgeGeo,
      caseLineGeo,
      monLineGeo,
      detailGeo,
      bellLineGeo,
      kbLineGeo,
      keys,
      caps,
      state: { t: 0, press: new Float32Array(keys.length), nextPress: 0 },
    }
  }, [phosHex])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const p = prog.current
    B.state.t += dt
    const t = B.state.t

    // Case rises.
    const cK = easeOutCubic(seg(p, 0.0, 0.32))
    if (caseRef.current) {
      caseRef.current.position.y = -(1 - cK) * 0.35
      caseRef.current.scale.setScalar(Math.max(0.0001, 0.85 + 0.15 * cK))
      caseRef.current.visible = cK > 0.001
    }
    B.caseLines.uniforms.uReveal.value = seg(p, 0.02, 0.45)
    B.gridMat.uniforms.uReveal.value = easeOutCubic(seg(p, 0.0, 0.45))

    // Monitor settles from above.
    const mK = easeOutCubic(seg(p, 0.32, 0.66))
    if (monRef.current) {
      monRef.current.position.y = (1 - mK) * 0.3
      monRef.current.visible = mK > 0.001
      monRef.current.scale.setScalar(Math.max(0.0001, 0.9 + 0.1 * mK))
    }
    B.monLines.uniforms.uReveal.value = seg(p, 0.28, 0.62)
    B.detailLines.uniforms.uReveal.value = seg(p, 0.2, 0.85)

    // Keyboard slides in from the front.
    const kK = easeOutCubic(seg(p, 0.42, 0.78))
    if (kbRef.current) {
      kbRef.current.position.z = KZ + (1 - kK) * 0.5
      kbRef.current.visible = kK > 0.001
    }
    B.kbLines.uniforms.uReveal.value = seg(p, 0.45, 0.85)

    // Keys pop on left to right; idle: occasional key presses.
    const st = B.state
    if (p >= 1 && t > st.nextPress) {
      const i = Math.floor(hash(t * 3.1) * B.keys.length)
      st.press[i] = 1
      st.nextPress = t + 0.09 + hash(t * 1.7) * 0.32
    }
    const { m, q, p: pv, s } = tmp
    B.keys.forEach((k, i) => {
      const kk = easeOutCubic(seg(p, 0.48 + (k.x / KW + 0.5) * 0.18, 0.58 + (k.x / KW + 0.5) * 0.18))
      st.press[i] = Math.max(0, st.press[i] - dt * 7)
      const zN = (k.z + KD / 2) / KD
      const top = 0.1 + (0.042 - 0.1) * zN
      const kh = 0.028
      pv.set(k.x, top + (kh / 2) * kk - st.press[i] * 0.012, k.z)
      s.set(k.w * Math.max(kk, 0.0001), kh * Math.max(kk, 0.0001), k.d * Math.max(kk, 0.0001))
      q.setFromAxisAngle(X_AXIS, KSLOPE)
      m.compose(pv, q, s)
      B.caps.setMatrixAt(i, m)
    })
    B.caps.instanceMatrix.needsUpdate = true

    // CRT.
    const pw = seg(p, 0.62, 0.94)
    B.screenMat.uniforms.uPower.value = pw
    B.screenMat.uniforms.uTime.value = t
    const hdd = hash(Math.floor(t * 9)) > 0.55 ? 1 : 0.15
    B.ledHdd.color.copy(glow(palette.ember, 0.4 + 1.8 * hdd * pw))
    B.ledPower.color.copy(glow(palette.jade, 0.3 + 1.6 * cK))
    B.ledMon.color.copy(glow(palette.jade, 0.04 + 1.6 * pw))
  })

  const fz = CZ + CD / 2
  const bz = MZ + MD / 2

  return (
    <group scale={S} position={[0, 0.06, -0.14]}>
      {variant !== 'bare' && (
        <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR - 0.002, 0.15]} material={B.gridMat} renderOrder={-1}>
          <planeGeometry args={[3.6, 3.0]} />
        </mesh>
      )}

      {/* Desktop case */}
      <group ref={caseRef}>
        <mesh geometry={B.caseGeo} material={B.body} position={[0, CY, CZ]} />
        <lineSegments geometry={B.caseLineGeo} material={B.caseLines} />
        <lineSegments geometry={B.detailGeo} material={B.detailLines} />
        {/* Floppy slot + drive slots */}
        <mesh position={[-0.12, CY + 0.02, fz + 0.002]} material={B.slotMat}>
          <planeGeometry args={[0.22, 0.012]} />
        </mesh>
        <mesh position={[0.36, CY + 0.065, fz + 0.002]} material={B.slotMat}>
          <planeGeometry args={[0.4, 0.012]} />
        </mesh>
        {/* LEDs: power + HDD */}
        <mesh position={[-0.36, CY + 0.07, fz + 0.003]} material={B.ledPower}>
          <circleGeometry args={[0.011, 16]} />
        </mesh>
        <mesh position={[-0.31, CY + 0.07, fz + 0.003]} material={B.ledHdd}>
          <circleGeometry args={[0.011, 16]} />
        </mesh>
        {/* Power button */}
        <mesh position={[-0.335, CY - 0.04, fz + 0.012]} material={B.bodyDark}>
          <boxGeometry args={[0.07, 0.07, 0.025]} />
        </mesh>
      </group>

      {/* Monitor */}
      <group ref={monRef}>
        <mesh geometry={B.standGeo} material={B.bodyDark} position={[0, FLOOR + CH + 0.03, MZ - 0.25]} />
        <mesh geometry={B.bezelGeo} material={B.body} position={[0, MY, MZ]} />
        <mesh
          geometry={B.bellGeo}
          material={B.bellMat}
          position={[0, MY - 0.02, MZ - MD / 2 - BELL / 2 + 0.002]}
          scale={[MW * 0.96, MH * 0.94, BELL]}
        />
        <mesh geometry={B.recessGeo} material={B.bodyDark} position={[0, MY + SY, bz - 0.012]} />
        <mesh geometry={B.screenGeo} material={B.screenMat} position={[0, MY + SY, bz + 0.004]} />
        <lineSegments geometry={B.monLineGeo} material={B.monLines} />
        <lineSegments geometry={B.bellLineGeo} material={B.detailLines} />
        <mesh position={[MW / 2 - 0.1, MY - MH / 2 + 0.055, bz + 0.002]} material={B.ledMon}>
          <circleGeometry args={[0.01, 16]} />
        </mesh>
      </group>

      {/* Keyboard */}
      <group ref={kbRef} position={[0, FLOOR, KZ]}>
        <group rotation-x={0}>
          <mesh geometry={B.wedgeGeo} material={B.deckMat} />
          <primitive object={B.caps} />
          <lineSegments geometry={B.kbLineGeo} material={B.kbLines} />
        </group>
      </group>
    </group>
  )
}

