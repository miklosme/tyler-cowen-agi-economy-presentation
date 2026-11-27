/**
 * Shared kit for the three "job engine" emblems (LabFlask, DataScanner, PowerCompute).
 * One pedestal, one body material, one line weight, one glass and one sprite shader, so the
 * three read as a family when they stand side by side on the slide.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { glow, palette } from '../../theme'

// ---------------------------------------------------------------- timing

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Normalised sub-range of progress: 0 before a, 1 after b. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
export const outCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Shared build timeline, so all three emblems assemble with the same rhythm. */
export const T = {
  pedestal: [0.0, 0.32] as const,
  body: [0.12, 0.58] as const,
  lines: [0.3, 0.82] as const,
  focal: [0.5, 0.95] as const,
  life: [0.72, 1.0] as const,
}

// ---------------------------------------------------------------- layout

/** Top surface of the pedestal. Every emblem stands on this plane. */
export const DECK_Y = -0.95
export const PEDESTAL_R = 1.0
/** Same hero framing for all three, so they line up as columns. */
export const FAMILY_FRAME = { distance: 6.4, elevation: 14 }

// ---------------------------------------------------------------- materials

export const LINE_W = 1.8 // css px, the family line weight
export const ICE = palette.ice
export const EMBER = palette.ember

/** Dark satin body. Transparent so the build-in can fade it; depthWrite stays on. */
export function makeBody(color = '#151a2c', metalness = 0.72, roughness = 0.32) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent: true, opacity: 1 })
}

// ---------------------------------------------------------------- glowing lines

/** Build a segment list (pairs of points) from a polyline. */
export function polyToSegments(pts: THREE.Vector3[], closed = false): number[] {
  const out: number[] = []
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    out.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  return out
}

/**
 * Merge several segment lists so they draw on in parallel: each list advances at the same
 * relative rate when the merged list is drawn with `draw` 0..1.
 */
export function interleave(lists: number[][]): number[] {
  const items: { t: number; s: number[] }[] = []
  for (const l of lists) {
    const n = l.length / 6
    for (let k = 0; k < n; k++) items.push({ t: (k + 0.5) / n, s: l.slice(k * 6, k * 6 + 6) })
  }
  items.sort((a, b) => a.t - b.t)
  return items.flatMap((i) => i.s)
}

export function circlePoints(r: number, y: number, n = 96, a0 = 0, a1 = Math.PI * 2): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  return pts
}

export type GlowLinesHandle = { mat: LineMaterial; geo: LineSegmentsGeometry; count: number }

/**
 * Thin glowing lines (screen-space width). `draw` 0..1 draws the segments on in order, which
 * is the family's line build-in. Geometry and material are created once.
 */
export function GlowLines({
  segments,
  color,
  boost = 4,
  width = LINE_W,
  opacity = 1,
  draw = 1,
  renderOrder = 2,
  handle,
  depthTest = true,
}: {
  segments: number[]
  color: string
  boost?: number
  width?: number
  opacity?: number
  draw?: number
  renderOrder?: number
  handle?: React.MutableRefObject<GlowLinesHandle | null>
  depthTest?: boolean
}) {
  const obj = useMemo(() => {
    const geo = new LineSegmentsGeometry()
    geo.setPositions(segments)
    const mat = new LineMaterial({
      color: 0xffffff,
      linewidth: width,
      transparent: true,
      depthWrite: false,
      depthTest,
    })
    mat.toneMapped = false
    mat.color.copy(glow(color, boost))
    const line = new LineSegments2(geo, mat)
    line.renderOrder = renderOrder
    line.frustumCulled = false
    return { line, geo, mat, count: segments.length / 6 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (handle) handle.current = { mat: obj.mat, geo: obj.geo, count: obj.count }
  useLayoutEffect(() => {
    const n = Math.round(obj.count * clamp01(draw))
    obj.geo.instanceCount = n
    obj.line.visible = n > 0 && opacity > 0.001
    obj.mat.opacity = opacity
  }, [draw, opacity, obj])
  useLayoutEffect(() => {
    obj.mat.color.copy(glow(color, boost))
  }, [color, boost, obj])
  return <primitive object={obj.line} />
}

// ---------------------------------------------------------------- fresnel glass

const glassVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vNv;
  varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vNv = normalize(normalMatrix * normal);
    vY = position.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const glassFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uWarm;
  uniform float uOpacity;
  uniform float uPower;
  uniform float uBase;
  uniform float uStreak;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vNv;
  varying float vY;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float f = pow(1.0 - abs(dot(n, normalize(vV))), uPower);
    vec3 nv = normalize(vNv);
    // two fake reflection streaks: a cool one on the left, a warm one on the right
    float s1 = exp(-pow((nv.x + 0.58) / 0.07, 2.0));
    float s2 = exp(-pow((nv.x - 0.74) / 0.032, 2.0));
    vec3 col = uColor * (uBase + f) + (uColor * s1 + uWarm * s2 * 0.4) * uStreak;
    float a = clamp(uBase + f + (s1 + s2 * 0.6) * uStreak, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`

/** Fresnel-rim fake glass. Additive, no depth writes, no transmission. */
export function makeGlass({
  color = ICE,
  boost = 1.6,
  power = 2.6,
  base = 0.03,
  streak = 0.55,
  side = THREE.FrontSide as THREE.Side,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: glow(color, boost) },
      uWarm: { value: glow(EMBER, boost) },
      uOpacity: { value: 1 },
      uPower: { value: power },
      uBase: { value: base },
      uStreak: { value: streak },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
    toneMapped: false,
  })
}

// ---------------------------------------------------------------- sprites

const spriteVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHue;
  uniform float uHeight;
  varying float vAlpha;
  varying float vHue;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(aSize * uHeight * projectionMatrix[1][1] * 0.5 / -mv.z, 0.0);
    vAlpha = aAlpha;
    vHue = aHue;
  }
`
const spriteFrag = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSquare;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vHue;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uSquare > 0.5) {
      vec2 q = abs(c);
      float m = max(q.x, q.y);
      a = 1.0 - smoothstep(0.36, 0.5, m);
    } else {
      float d = length(c);
      a = exp(-d * d * 18.0) * (1.0 - smoothstep(0.42, 0.5, d));
    }
    vec3 col = mix(uColorA, uColorB, vHue);
    gl_FragColor = vec4(col, a * vAlpha * uOpacity);
  }
`

/**
 * A pool of additive sprites whose attributes are written on the CPU each frame.
 * Returns the geometry arrays so the caller can animate them.
 */
export function useSprites(count: number, colorA: THREE.Color, colorB: THREE.Color, square = false, additive = true) {
  const gl = useThree((s) => s.gl)
  const res = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const alpha = new Float32Array(count)
    const hue = new Float32Array(count)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aHue', new THREE.BufferAttribute(hue, 1).setUsage(THREE.DynamicDrawUsage))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHeight: { value: 1080 },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uSquare: { value: square ? 1 : 0 },
        uOpacity: { value: 1 },
      },
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 4
    return { pos, size, alpha, hue, geo, mat, points }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame(() => {
    const v = new THREE.Vector4()
    gl.getCurrentViewport(v)
    res.mat.uniforms.uHeight.value = gl.domElement.height || v.w || 1080
  })
  const flush = () => {
    const a = res.geo.attributes
    a.position.needsUpdate = true
    a.aSize.needsUpdate = true
    a.aAlpha.needsUpdate = true
    a.aHue.needsUpdate = true
  }
  return { ...res, flush }
}

// ---------------------------------------------------------------- pedestal

/**
 * The family plinth: a low chamfered satin disc with a recessed top, an ember rim line and a
 * ring of instrument ticks. It rises first and its rim draws on.
 */
export function Pedestal({ progress }: { progress: number }) {
  const geo = useMemo(() => {
    const y0 = DECK_Y
    const prof = [
      [0.0, -1.12],
      [0.9, -1.12],
      [0.965, -1.105],
      [1.0, -1.07],
      [1.0, y0 - 0.03],
      [0.985, y0 - 0.005],
      [0.96, y0],
      [0.86, y0],
      [0.845, y0 - 0.012],
      [0.0, y0 - 0.012],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(prof, 128)
  }, [])
  const mat = useMemo(() => makeBody('#11151f', 0.75, 0.42), [])
  const rim = useMemo(() => polyToSegments(circlePoints(0.972, DECK_Y + 0.002, 160, Math.PI * 0.5, Math.PI * 2.5)), [])
  const inner = useMemo(() => polyToSegments(circlePoints(0.852, DECK_Y - 0.008, 128, Math.PI * 0.5, Math.PI * 2.5)), [])
  const ticks = useMemo(() => {
    const out: number[] = []
    const n = 60
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.5 + (i / n) * Math.PI * 2
      const major = i % 5 === 0
      const r0 = 0.875
      const r1 = major ? 0.935 : 0.905
      out.push(Math.cos(a) * r0, DECK_Y + 0.002, Math.sin(a) * r0, Math.cos(a) * r1, DECK_Y + 0.002, Math.sin(a) * r1)
    }
    return out
  }, [])
  const g = useRef<THREE.Group>(null)
  const pr = outExpo(seg(progress, T.pedestal[0], T.pedestal[1]))
  mat.opacity = pr
  const rimDraw = inOutCubic(seg(progress, 0.06, 0.5))
  const tickDraw = seg(progress, 0.2, 0.62)
  return (
    <group ref={g} position-y={(1 - pr) * -0.35} visible={progress > 0.001}>
      <mesh geometry={geo} material={mat} renderOrder={0} />
      <GlowLines segments={rim} color={EMBER} boost={2.8} draw={rimDraw} renderOrder={0.5} />
      <GlowLines segments={inner} color={ICE} boost={1.4} width={1.2} opacity={0.6} draw={rimDraw} renderOrder={0.5} />
      <GlowLines segments={ticks} color={EMBER} boost={1.8} width={1.2} opacity={0.75} draw={tickDraw} renderOrder={0.5} />
    </group>
  )
}
