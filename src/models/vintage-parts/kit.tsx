/**
 * Shared kit for the four "vintage invention" icons (VintageCar, Biplane, TubeRadio,
 * CrtTelevision). One body material, one line weight, one build-in choreography and one hover,
 * so the four read as a single museum family on the 1905–1955 slide.
 *
 * Build-in grammar (same for all four): every part rises into place on an expo-out curve while
 * its ember linework draws on left-to-right (the direction of the slide's timeline), then the
 * satin body fills in behind the lines, and finally the focal light ignites.
 */
import { createContext, useContext, useMemo, type ReactNode, type Ref } from 'react'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { glow, palette } from '../../theme'

// ---------------------------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------------------------
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)))
export const easeInOut = (t: number) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
/** Local 0..1 of a window [start, start + len] of global progress. */
export const win = (p: number, start: number, len: number) => clamp01((p - start) / len)

// ---------------------------------------------------------------------------------------------
// Family tokens
// ---------------------------------------------------------------------------------------------
export const FAMILY = {
  body: '#161c33',
  dark: '#0a0d18',
  trim: '#2a3254',
  line: glow(palette.ember, 2.4),
  lineSoft: glow(palette.ember, 1.4),
  lineWidth: 2.0,
  lineWidthSoft: 1.25,
  /** Warm phosphor / filament white used by every focal light. */
  focal: '#ffd08a',
  /** Shared hero framing: one camera works for the whole row. */
  azimuth: 24,
  elevation: 9,
  distance: 6.4,
}

export type MatKey = 'body' | 'dark' | 'trim' | 'fabric' | 'canvas'

function makeMaterial(key: MatKey) {
  const base = {
    body: { color: FAMILY.body, metalness: 0.78, roughness: 0.3 },
    dark: { color: FAMILY.dark, metalness: 0.55, roughness: 0.42 },
    trim: { color: FAMILY.trim, metalness: 0.92, roughness: 0.22 },
    // doped fabric / lacquered wood: same tone, less mirror, so big flat panels stay dark
    fabric: { color: FAMILY.body, metalness: 0.45, roughness: 0.56 },
    // doped aircraft canvas: darker and rougher still, so large flat wings stay obsidian
    canvas: { color: '#0e1222', metalness: 0.25, roughness: 0.64 },
  }[key]
  return new THREE.MeshStandardMaterial({
    ...base,
    transparent: true,
    opacity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------------------------------------
// Line helpers. Segments are flat arrays [ax, ay, az, bx, by, bz, ...].
// ---------------------------------------------------------------------------------------------
export type Seg = number[]
export type V3 = [number, number, number]

export function matrixOf(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1) {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s)
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc)
}

export function edgesOf(geo: THREE.BufferGeometry, m: THREE.Matrix4, threshold = 28): Seg {
  const e = new THREE.EdgesGeometry(geo, threshold)
  e.applyMatrix4(m)
  const out = Array.from(e.attributes.position.array as Float32Array)
  e.dispose()
  return out
}

/** Polyline (optionally closed) -> segments. */
export function polySeg(pts: V3[], closed = false): Seg {
  const out: Seg = []
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    out.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
  return out
}

/** Circle in a plane: axis 'x' | 'y' | 'z' is the normal. */
export function circlePts(c: V3, r: number, axis: 'x' | 'y' | 'z', n = 48, a0 = 0, a1 = Math.PI * 2): V3[] {
  const pts: V3[] = []
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6
  const count = full ? n : n + 1
  for (let i = 0; i < count; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    const u = Math.cos(a) * r
    const v = Math.sin(a) * r
    if (axis === 'z') pts.push([c[0] + u, c[1] + v, c[2]])
    else if (axis === 'x') pts.push([c[0], c[1] + v, c[2] + u])
    else pts.push([c[0] + u, c[1], c[2] + v])
  }
  return pts
}
export function circleSeg(c: V3, r: number, axis: 'x' | 'y' | 'z', n = 48, a0 = 0, a1 = Math.PI * 2): Seg {
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6
  return polySeg(circlePts(c, r, axis, n, a0, a1), full)
}

export function transformSeg(seg: Seg, m: THREE.Matrix4): Seg {
  const v = new THREE.Vector3()
  const out: Seg = new Array(seg.length)
  for (let i = 0; i < seg.length; i += 3) {
    v.set(seg[i], seg[i + 1], seg[i + 2]).applyMatrix4(m)
    out[i] = v.x
    out[i + 1] = v.y
    out[i + 2] = v.z
  }
  return out
}

/** Split segments longer than maxLen so a left-to-right draw-on sweeps instead of popping long edges in. */
export function subdivideSeg(seg: Seg, maxLen: number): Seg {
  const out: Seg = []
  for (let i = 0; i < seg.length; i += 6) {
    const [ax, ay, az, bx, by, bz] = seg.slice(i, i + 6)
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / maxLen))
    for (let k = 0; k < n; k++) {
      const t0 = k / n
      const t1 = (k + 1) / n
      out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1)
    }
  }
  return out
}

/** Split each polyline segment list into n pieces and interleave them so several strokes draw together. */
export function interleave(strokes: [V3, V3][], n = 10): Seg {
  const out: Seg = []
  for (let i = 0; i < n; i++)
    for (const [a, b] of strokes) {
      const t0 = i / n
      const t1 = (i + 1) / n
      out.push(
        a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0,
        a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1,
      )
    }
  return out
}

/** Sort segments so a drawRange sweep reads left-to-right (slightly bottom-up). */
export function sortSweep(seg: Seg): Float32Array {
  const n = seg.length / 6
  const idx = Array.from({ length: n }, (_, i) => i)
  const key = (i: number) => {
    const o = i * 6
    return (seg[o] + seg[o + 3]) * 0.5 + (seg[o + 1] + seg[o + 4]) * 0.15
  }
  const keys = idx.map(key)
  idx.sort((a, b) => keys[a] - keys[b])
  const out = new Float32Array(seg.length)
  idx.forEach((src, dst) => {
    for (let k = 0; k < 6; k++) out[dst * 6 + k] = seg[src * 6 + k]
  })
  return out
}

export function makeLines(seg: Seg, soft = false, sort = true) {
  const g = new LineSegmentsGeometry()
  g.setPositions(sort ? sortSweep(seg) : new Float32Array(seg))
  const m = new LineMaterial({
    linewidth: soft ? FAMILY.lineWidthSoft : FAMILY.lineWidth,
    transparent: true,
    depthWrite: false,
  })
  m.color.copy(soft ? FAMILY.lineSoft : FAMILY.line)
  m.toneMapped = false
  const l = new LineSegments2(g, m)
  l.userData.count = seg.length / 6
  l.renderOrder = 2
  return l
}

export function setLineDraw(l: LineSegments2, t: number, opacity = 1) {
  const n = l.userData.count as number
  l.geometry.instanceCount = Math.floor(n * clamp01(t))
  ;(l.material as LineMaterial).opacity = opacity
  l.visible = t > 0 && opacity > 0.001
}

// ---------------------------------------------------------------------------------------------
// Parts: a group of meshes + their linework that build in together.
// ---------------------------------------------------------------------------------------------
export type Piece = {
  geo: THREE.BufferGeometry
  p?: V3
  r?: V3
  s?: V3 | number
  m?: MatKey
  /** Edge threshold in degrees, or false for no auto edges (curved parts get hand lines). */
  edge?: number | false
}

const FILL_DEFAULT: [number, number] = [0.22, 0.7]

type PartCtx = { t: number }
const Ctx = createContext<PartCtx>({ t: 1 })
export const usePart = () => useContext(Ctx)

export function Part({
  pieces = [],
  lines,
  soft,
  progress,
  start,
  len = 0.42,
  rise = 0.32,
  position,
  rotation,
  innerRef,
  sortLines = true,
  subdivide,
  fill = FILL_DEFAULT,
  children,
}: {
  pieces?: Piece[]
  lines?: Seg
  soft?: Seg
  progress: number
  start: number
  len?: number
  rise?: number
  position?: V3
  rotation?: V3
  innerRef?: Ref<THREE.Group>
  /** false keeps the given segment order (e.g. interleaved so symmetric parts grow together). */
  sortLines?: boolean
  /** Opt-in: split long edges to this length so the draw-on is a true sweep. */
  subdivide?: number
  /** Opt-in: when the satin body fills in, as [delay, duration] of the part's local t. */
  fill?: [number, number]
  children?: ReactNode
}) {
  const built = useMemo(() => {
    const mats: Record<MatKey, THREE.MeshStandardMaterial> = {
      body: makeMaterial('body'),
      dark: makeMaterial('dark'),
      trim: makeMaterial('trim'),
      fabric: makeMaterial('fabric'),
      canvas: makeMaterial('canvas'),
    }
    const edgeSeg: Seg = []
    for (const pc of pieces) {
      if (pc.edge === false) continue
      edgeSeg.push(...edgesOf(pc.geo, matrixOf(pc.p, pc.r, pc.s), pc.edge ?? 28))
    }
    if (lines) edgeSeg.push(...lines)
    const mainSeg = subdivide ? subdivideSeg(edgeSeg, subdivide) : edgeSeg
    const softSeg = soft && subdivide ? subdivideSeg(soft, subdivide) : soft
    const main = mainSeg.length ? makeLines(mainSeg, false, sortLines) : null
    const detail = softSeg && softSeg.length ? makeLines(softSeg, true) : null
    return { mats, main, detail }
    // pieces/lines/soft are memoized by the caller
  }, [pieces, lines, soft, sortLines, subdivide])

  const t = win(progress, start, len)
  const e = easeOutExpo(t)
  // Lines lead, the satin body fills in behind them.
  if (built.main) setLineDraw(built.main, easeOutCubic(t * 1.35))
  if (built.detail) setLineDraw(built.detail, easeOutCubic((t - 0.2) * 1.4))
  const op = easeInOut((t - fill[0]) / fill[1])
  for (const k of ['body', 'dark', 'trim', 'fabric', 'canvas'] as MatKey[]) {
    built.mats[k].opacity = op
    built.mats[k].depthWrite = op > 0.5
  }
  const visible = t > 0

  return (
    <group position={position} rotation={rotation} visible={visible}>
      <group position-y={-(1 - e) * rise} scale={0.94 + 0.06 * e}>
        <group ref={innerRef}>
          {pieces.map((pc, i) => (
            <mesh
              key={i}
              geometry={pc.geo}
              material={built.mats[pc.m ?? 'body']}
              position={pc.p}
              rotation={pc.r}
              scale={pc.s}
            />
          ))}
          {built.main && <primitive object={built.main} />}
          {built.detail && <primitive object={built.detail} />}
          <Ctx.Provider value={{ t }}>{children}</Ctx.Provider>
        </group>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
export function box(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d)
}

/** Box spanning explicit bounds; returns a piece centered correctly. */
export function boxPiece(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: MatKey = 'body', edge: number | false = 28): Piece {
  return { geo: box(x1 - x0, y1 - y0, z1 - z0), p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], m, edge }
}

/** Offset a 2D polyline into a closed band of given thickness (along its left normal). */
export function bandShape(pts: THREE.Vector2[], thickness: number) {
  const n = pts.length
  const inner: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    const tx = b.x - a.x
    const ty = b.y - a.y
    const l = Math.hypot(tx, ty) || 1
    // right-hand normal (downwards for a left-to-right curve)
    inner.push(new THREE.Vector2(pts[i].x + (ty / l) * thickness, pts[i].y - (tx / l) * thickness))
  }
  const s = new THREE.Shape()
  s.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < n; i++) s.lineTo(pts[i].x, pts[i].y)
  for (let i = n - 1; i >= 0; i--) s.lineTo(inner[i].x, inner[i].y)
  s.closePath()
  return s
}

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape()
  roundedRectPath(s, w, h, r, cx, cy)
  return s
}
export function roundedRectPath(s: THREE.Path, w: number, h: number, r: number, cx = 0, cy = 0) {
  const x = cx - w / 2
  const y = cy - h / 2
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

/** Outline of a THREE.Shape/Path as segments at depth z (xy plane). */
export function shapeOutline(path: THREE.Path, z: number, divisions = 64, m?: THREE.Matrix4): Seg {
  const pts = path.getSpacedPoints(divisions).map((p) => [p.x, p.y, z] as V3)
  const seg = polySeg(pts, false)
  return m ? transformSeg(seg, m) : seg
}

// ---------------------------------------------------------------------------------------------
// Fake glass: fresnel rim + slow sheen band. No transmission.
// ---------------------------------------------------------------------------------------------
const glassVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`
const glassFrag = /* glsl */ `
  uniform vec3 uTint; uniform vec3 uRim; uniform float uOpacity; uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
    float fres = pow(f, 2.2);
    float band = vW.x * 0.8 + vW.y * 1.2 - uTime * 0.18;
    float sheen = (1.0 - smoothstep(0.0, 0.08, abs(fract(band * 0.55) - 0.5) - 0.06));
    vec3 col = uTint * 0.5 + uRim * (fres * 0.7 + sheen * 0.25);
    float a = (0.08 + fres * 0.35 + sheen * 0.1) * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`
export function makeGlass(rim = '#d9c9a8') {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color('#1b2340') },
      uRim: { value: new THREE.Color(rim) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------------------------------------
// Drift motes: soft round additive sprites travelling start -> start + dir and fading.
// ---------------------------------------------------------------------------------------------
const moteVert = /* glsl */ `
  attribute vec3 aDir; attribute vec2 aSeed;
  uniform float uTime; uniform float uSize; uniform float uPixelRatio;
  varying float vA;
  void main() {
    float ph = fract(uTime * (0.18 + aSeed.y * 0.22) + aSeed.x);
    vec3 p = position + aDir * ph;
    vA = sin(3.14159 * ph);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) * uPixelRatio * (10.0 / -mv.z);
  }
`
const moteFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.0, 0.5, d));
    gl_FragColor = vec4(uColor, a * a * vA * uOpacity);
  }
`
export function makeMotes(starts: V3[], dirs: V3[], size = 2.2, color = FAMILY.focal, boost = 2.2) {
  const n = starts.length
  const pos = new Float32Array(n * 3)
  const dir = new Float32Array(n * 3)
  const seed = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    pos.set(starts[i], i * 3)
    dir.set(dirs[i], i * 3)
    seed[i * 2] = Math.random()
    seed[i * 2 + 1] = Math.random()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2))
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: glow(color, boost) },
      uOpacity: { value: 0 },
    },
    vertexShader: moteVert,
    fragmentShader: moteFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(g, m)
  pts.frustumCulled = false
  pts.renderOrder = 3
  return pts
}

/** Shared idle hover: slow bob and a whisper of yaw, phase-shifted per model. */
export function hover(g: THREE.Object3D | null, time: number, phase: number, amp = 1) {
  if (!g) return
  g.position.y = Math.sin(time * 0.85 + phase) * 0.035 * amp
  g.rotation.y = Math.sin(time * 0.37 + phase * 1.7) * 0.035 * amp
}
