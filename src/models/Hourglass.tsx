/**
 * Hourglass — "The human bottleneck".
 *
 * A tall satin-dark hourglass with gold-outlined plates and posts and fake fresnel glass.
 * Top bulb: a churning, overflowing vortex of ice-cyan particles (AI capability).
 * Neck: a jammed, white-hot knot of jostling particles (the human / institutional bottleneck).
 * Bottom bulb: an irregular trickle that cools to ember gold and builds a small, modest pile
 * (realized productivity).
 *
 * All particle motion runs in vertex shaders from static seeds; progress only drives
 * transforms, uniforms and line instance counts.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'Hourglass — the human bottleneck',
  distance: 6.1,
  elevation: -7,
  azimuth: 22,
}

// ---------------------------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------------------------
const H = 1.0 // half height of the glass (neck at 0, caps at ±H)
const PROF_N = 64
const PLATE_IN = 1.035 // inner face of the plates
const PLATE_T = 0.1
const POST_R = 0.745
const POST_LEN = PLATE_IN * 2
const POST_AZ = (meta.azimuth! * Math.PI) / 180
const POST_ANGLES = [0, 1, 2, 3].map((i) => POST_AZ + Math.PI / 4 + (i * Math.PI) / 2)

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const seg = (p: number, a: number, b: number) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1)

/** Glass radius as a function of t = |y| / H, as a lookup table (shared with the shaders). */
function buildProfile(): number[] {
  const ctrl = [
    [0.0, 0.05],
    [0.035, 0.058],
    [0.1, 0.13],
    [0.22, 0.28],
    [0.38, 0.425],
    [0.56, 0.485],
    [0.74, 0.458],
    [0.88, 0.375],
    [0.965, 0.295],
    [1.0, 0.272],
  ].map(([t, r]) => new THREE.Vector2(r, t))
  const curve = new THREE.SplineCurve(ctrl)
  const pts = curve.getPoints(600)
  const table: number[] = []
  for (let i = 0; i < PROF_N; i++) {
    const t = i / (PROF_N - 1)
    let j = 0
    while (j < pts.length - 2 && pts[j + 1].y < t) j++
    const a = pts[j]
    const b = pts[j + 1]
    const f = THREE.MathUtils.clamp((t - a.y) / Math.max(1e-6, b.y - a.y), 0, 1)
    table.push(a.x + (b.x - a.x) * f)
  }
  return table
}

function profAt(table: number[], t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * (PROF_N - 1)
  const i = Math.floor(x)
  const f = x - i
  return table[i] + (table[Math.min(i + 1, PROF_N - 1)] - table[i]) * f
}

// ---------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------
const glassVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vY = position.y;
    gl_Position = projectionMatrix * mv;
  }
`
const glassFragment = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uRim;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    if (!gl_FrontFacing) n = -n;
    float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 3.6);
    vec3 col = uRim * rim * 0.6;
    // faint body tint so the glass reads as a volume, not just an outline
    col += uCool * 0.006;
    if (gl_FrontFacing) {
      // window reflections: a cool key streak on the left, a warm sliver on the right
      float sL = pow(1.0 - smoothstep(0.0, 0.1, abs(n.x + 0.5)), 2.0) * smoothstep(-0.2, 0.5, n.y + 0.6);
      float sL2 = (1.0 - smoothstep(0.0, 0.03, abs(n.x + 0.3))) * 0.5;
      float sR = pow(1.0 - smoothstep(0.0, 0.09, abs(n.x - 0.62)), 2.0);
      // streaks fade near the neck so the knot owns that region
      float neck = smoothstep(0.08, 0.3, abs(vY));
      // the lower bulb reflects warm-neutral, shorter and dimmer, so nothing reads as content
      float upper = step(0.0, vY);
      vec3 key = mix(vec3(0.95, 0.82, 0.68), uCool, upper);
      float lower = mix(0.55 * smoothstep(-0.72, -0.55, vY), 1.0, upper);
      col += key * (sL * 0.2 + sL2 * 0.12 * upper) * neck * lower;
      col += uWarm * sR * 0.15 * neck * lower * (1.0 - upper);
    } else {
      col *= 0.4;
    }
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }
`

const profChunk = /* glsl */ `
  uniform float uProf[${PROF_N}];
  uniform float uH;
  uniform float uTime;
  uniform float uViewH;
  float prof(float t) {
    float x = clamp(t, 0.0, 1.0) * ${(PROF_N - 1).toFixed(1)};
    int i = int(floor(x));
    float f = x - float(i);
    return mix(uProf[i], uProf[min(i + 1, ${PROF_N - 1})], f);
  }
  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  void setSize(vec4 mv, float size) {
    gl_PointSize = size * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z;
  }
`

const pointFragment = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 6.0) * (1.0 - d * d);
    gl_FragColor = vec4(vCol * core * vA, 1.0);
  }
`

// Top bulb: churning vortex of AI capability.
const swirlVertex = /* glsl */ `
  ${profChunk}
  attribute vec4 aSeed;
  attribute float aTrail;
  uniform float uFill;
  uniform float uSize;
  uniform vec3 uIce;
  uniform vec3 uHot;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
    float time = uTime - aTrail * 0.17;
    // ~40% of the mass is packed into the funnel: it presses down on the neck
    float e = fract(a * 53.7 + c * 11.3);
    float hb = e < 0.3 ? 0.045 + 0.36 * pow(a, 0.9) : 0.3 + 0.69 * pow(a, 0.7);
    float ph = d * 6.2831 + time * (0.45 + 0.7 * b);
    float rf = sqrt(b) * 0.84 + 0.1 * cos(ph);
    float h = hb + 0.05 * sin(ph) * (0.35 + hb);
    h = clamp(h, 0.03, 0.985);
    rf = clamp(rf, 0.0, 0.96);
    float R = prof(h) * 0.9;
    float spin = (0.45 + 1.9 * pow(1.0 - h, 2.0)) * (0.55 + 0.5 / (rf + 0.3));
    // pour-in: everything whips around faster while the bulb fills
    float pour = 1.0 - uFill;
    // half the particles ride three rigid spiral arms so the vortex reads even in a still
    float armed = step(0.55, d);
    float arm = floor(c * 3.0);
    float armAng = arm * 2.0944 + h * (3.4 + 2.2 * h) + 0.4 * sin(time * 0.7 + arm * 2.1 + h * 3.0)
      + (fract(c * 3.0) - 0.5) * 1.05 + time * 1.15;
    rf = mix(rf, 0.2 + 0.76 * sqrt(b), armed);
    float freeAng = c * 6.2831 + time * spin * 0.75;
    float ang = mix(freeAng, armAng, armed) + pour * pour * 9.0 * (1.2 - h);
    vec3 p = vec3(cos(ang) * rf * R, h * uH, sin(ang) * rf * R);
    // fill level rises from the neck to the cap (slightly overfilled at 1)
    float level = uFill * 1.06;
    float vis = 1.0 - smoothstep(level - 0.08, level, hb);
    // particles above the level are still falling in from the cap
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float hot = 1.0 - smoothstep(0.03, 0.15, h);
    float tw = 0.65 + 0.35 * sin(uTime * (2.0 + 3.0 * d) + a * 50.0);
    vCol = mix(uIce * (0.8 + 0.5 * fract(c * 17.0)), uHot, hot * hot);
    float trail = 1.0 - aTrail;
    // thin the additive energy where the cross-section narrows (the knot takes over there)
    float thin = mix(0.1, 0.85, smoothstep(0.05, 0.32, h));
    float upperB = smoothstep(0.4, 0.75, h);
    float surface = smoothstep(0.9, 0.97, hb);
    float free = mix(0.84, 1.0, armed);
    vA = vis * tw * 1.05 * mix(0.6, 1.0, thin) * trail * trail * free * (1.0 + 0.1 * upperB + 0.1 * surface);
    setSize(mv, uSize * (0.6 + 0.8 * fract(a * 37.13)) * mix(1.0, 0.75, hot) * (1.0 + 0.25 * upperB) * (0.55 + 0.45 * trail));
  }
`

// Neck: the jammed, white-hot knot.
const knotVertex = /* glsl */ `
  ${profChunk}
  attribute vec4 aSeed;
  uniform float uOn;
  uniform float uSize;
  uniform vec3 uHot;
  uniform vec3 uIce;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
    float t = pow(a, 0.8);
    float y = -0.025 + 0.33 * t;
    float R = prof(abs(y) / uH) * 0.9;
    float ang = c * 6.2831 + uTime * (1.4 + 2.2 * d) * (1.0 - 0.5 * t);
    float rf = pow(b, 0.35);
    // jostling: fast, small, incoherent shoves
    vec3 j = vec3(
      sin(uTime * 17.0 + c * 91.0) + 0.6 * sin(uTime * 29.0 + d * 13.0),
      sin(uTime * 13.0 + d * 57.0) + 0.5 * sin(uTime * 23.0 + a * 71.0),
      cos(uTime * 19.0 + a * 33.0) + 0.6 * cos(uTime * 31.0 + b * 17.0)
    ) * (0.004 + 0.014 * t);
    vec3 p = vec3(cos(ang) * rf * R, y, sin(ang) * rf * R) + j;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.6 + 0.4 * sin(uTime * (7.0 + 9.0 * d) + b * 40.0);
    vCol = mix(uHot * mix(1.3, 1.0, smoothstep(0.0, 0.3, t)), uIce * 1.25, smoothstep(0.3, 0.75, t));
    // per-particle energy falls where the cross-section is narrowest, so the pinch glows
    // without blowing out; the clot above it stays legible as particles
    vA = uOn * (0.55 + 0.45 * tw) * mix(1.0, 0.55, smoothstep(0.3, 1.0, t));
    setSize(mv, uSize * (0.6 + 0.8 * fract(b * 23.7)));
  }
`

// The few that squeeze through: an irregular, dotted trickle that cools to ember.
const trickleVertex = /* glsl */ `
  ${profChunk}
  attribute vec4 aSeed;
  uniform float uOn;
  uniform float uSize;
  uniform float uDrop;
  uniform vec3 uHot;
  uniform vec3 uEmber;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
    float period = 2.2 + 1.6 * a;
    float s = uTime / period + b;
    float cyc = floor(s);
    float f = fract(s);
    float fall = 0.95 / period;
    float tau = f / fall;
    float gate = step(0.36, hash11(cyc * 7.31 + c * 113.0));
    float y = -0.03 - uDrop * tau * tau;
    vec2 off = vec2(cos(d * 6.2831), sin(d * 6.2831)) * (0.004 + 0.022 * tau * c);
    vec3 p = vec3(off.x, y, off.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float alive = step(tau, 1.0) * gate;
    vCol = mix(uHot, uEmber, smoothstep(0.02, 0.3, tau * tau));
    vA = uOn * alive * (1.0 - 0.2 * tau) * (1.0 - smoothstep(0.95, 1.0, tau));
    setSize(mv, uSize * (0.9 + 0.6 * c));
  }
`

// Realized productivity: a small, modest ember mound.
const pileVertex = /* glsl */ `
  ${profChunk}
  attribute vec4 aSeed;
  uniform float uGrow;
  uniform float uSize;
  uniform float uBase;
  uniform float uHeight;
  uniform vec3 uEmber;
  uniform vec3 uDeep;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
    float hgt = uHeight * (0.25 + 0.75 * uGrow);
    float Rm = 0.23;
    float rr = sqrt(b);
    float surf = hgt * (1.0 - rr) + 0.01;
    float y = uBase + surf * pow(c, 0.35);
    float ang = a * 6.2831 + uTime * 0.03;
    float R = min(Rm * rr, prof(abs(y) / uH) * 0.88);
    vec3 p = vec3(cos(ang) * R, y, sin(ang) * R);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float top = pow(c, 3.0);
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + 2.5 * d) + a * 60.0);
    vCol = mix(uDeep, uEmber, 0.6 + 0.4 * top);
    float vis = step(d, uGrow);
    vA = vis * (0.45 + 0.55 * tw) * (0.45 + 0.55 * top);
    setSize(mv, uSize * (0.6 + 0.7 * fract(d * 31.0)));
  }
`

// Build-in pour from the cap, and at rest a few motes shed off the overfull shoulder.
const pourVertex = /* glsl */ `
  ${profChunk}
  attribute vec4 aSeed;
  uniform float uPour;
  uniform float uLevel;
  uniform float uSpill;
  uniform float uSize;
  uniform vec3 uIce;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
    vec3 p;
    float sz = 1.0;
    if (d < 0.55) {
      float s = fract(uTime * 1.4 + a);
      float top = 0.98 * uH;
      float y = top - s * s * (top - uLevel);
      float ang = c * 6.2831 + uTime * 4.0;
      float r = 0.022 + 0.048 * b * (0.4 + s);
      p = vec3(cos(ang) * r, y, sin(ang) * r);
      vA = uPour * step(uLevel, y) * 0.85 * smoothstep(0.0, 0.25, s);
      vCol = uIce * 1.05;
    } else {
      // overflow: five rivulets brim over the cap lip and slide down the outer shoulder
      float lane = floor(c * 5.0);
      float s = fract(uTime * (0.12 + 0.05 * hash11(lane * 3.1)) + a);
      float h = 0.965 - 0.2 * s;
      float ang = lane * 1.2566 + 0.7 + (fract(c * 5.0) - 0.5) * 0.09 + uTime * 0.05;
      float r = prof(h) * uH + 0.012 + 0.006 * b;
      p = vec3(cos(ang) * r, h * uH, sin(ang) * r);
      vA = uSpill * smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.55, 1.0, s));
      vCol = uIce * 1.25;
      sz = 1.2;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    setSize(mv, sz * uSize * (0.7 + 0.6 * fract(d * 13.0)));
  }
`

const spriteVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const spriteFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c * vec2(1.0, 0.8)) * 2.0;
    float g = (exp(-d * d * 10.0) + 0.3 * exp(-d * d * 3.0)) * (1.0 - smoothstep(0.6, 1.0, d));
    gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  }
`

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function seeds(n: number, salt: number, trail = 1) {
  const arr = new Float32Array(n * 4)
  let s = salt * 9301 + 49297
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  for (let i = 0; i < n * 4; i++) arr[i] = rnd()
  const all = new Float32Array(n * trail * 4)
  const tr = new Float32Array(n * trail)
  for (let k = 0; k < trail; k++) {
    all.set(arr, k * n * 4)
    tr.fill(k / trail, k * n, (k + 1) * n)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * trail * 3), 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(all, 4))
  g.setAttribute('aTrail', new THREE.BufferAttribute(tr, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2)
  return g
}

/** Several circles (y, r) as line segments, interleaved so they all draw on together. */
type Ring = [y: number, r: number, k?: number]

function circlesGeometry(rings: Ring[], color: THREE.Color, segs = 128) {
  const pos: number[] = []
  const col: number[] = []
  const order: number[] = []
  for (let k = 0; k < segs / 2; k++) order.push(k, segs - 1 - k)
  for (const k of order) {
    const a0 = (k / segs) * Math.PI * 2 + POST_AZ
    const a1 = ((k + 1) / segs) * Math.PI * 2 + POST_AZ
    for (const [y, r, w = 1] of rings) {
      pos.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r)
      col.push(color.r * w, color.g * w, color.b * w, color.r * w, color.g * w, color.b * w)
    }
  }
  const g = new LineSegmentsGeometry()
  g.setPositions(pos)
  g.setColors(col)
  return { geometry: g, count: segs * rings.length }
}

function makeLine(rings: Ring[], color: THREE.Color, width: number) {
  const { geometry, count } = circlesGeometry(rings, color)
  const material = new LineMaterial({ linewidth: width, transparent: true, depthWrite: false, vertexColors: true })
  material.toneMapped = false
  const line = new LineSegments2(geometry, material)
  line.frustumCulled = false
  return { line, count, material }
}

/** Satin body material with a fresnel rim of gold, so silhouettes read as gold outlines. */
function rimMaterial(base: string, rim: THREE.Color, power: number, metal = 0.85, rough = 0.32) {
  const m = new THREE.MeshStandardMaterial({ color: base, metalness: metal, roughness: rough })
  const uRim = { value: rim }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uRim
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), ${power.toFixed(1)});
        totalEmissiveRadiance += uRimColor * rimF;`,
      )
  }
  m.customProgramCacheKey = () => `hg-rim-${power}`
  m.userData.rim = rim
  m.userData.rimBase = rim.clone()
  return m
}

function latheFrom(points: [number, number][], segs = 96) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs)
}

// ---------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------
export default function Hourglass({ progress = 1, accent }: ModelProps) {
  const prog = useRef(progress)
  prog.current = progress
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)

  const root = useRef<THREE.Group>(null)
  const bottomPlate = useRef<THREE.Group>(null)
  const topPlate = useRef<THREE.Group>(null)
  const posts = useRef<THREE.Group>(null)
  const sprite = useRef<THREE.Mesh>(null)
  const pileGlow = useRef<THREE.Mesh>(null)
  const massGlow = useRef<THREE.Mesh>(null)

  const built = useMemo(() => {
    const table = buildProfile()
    const gold = glow(accent ?? palette.ember, 3.0)

    // --- glass -------------------------------------------------------------------------------
    const prof: THREE.Vector2[] = []
    const NP = 140
    for (let i = 0; i <= NP; i++) {
      const y = -H + (2 * H * i) / NP
      prof.push(new THREE.Vector2(profAt(table, Math.abs(y) / H), y))
    }
    const glassGeo = new THREE.LatheGeometry(prof, 72)
    const glassUniforms = {
      uOpacity: { value: 0 },
      uRim: { value: new THREE.Color('#bfe9ff').multiplyScalar(1.05) },
      uCool: { value: new THREE.Color(palette.ice).multiplyScalar(1.4) },
      uWarm: { value: new THREE.Color(palette.ember).multiplyScalar(1.3) },
    }
    const glassMat = new THREE.ShaderMaterial({
      uniforms: glassUniforms,
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    // --- frame -------------------------------------------------------------------------------
    const plateGeo = latheFrom([
      [0.0, 0.0],
      [0.76, 0.0],
      [0.8, 0.008],
      [0.825, 0.03],
      [0.825, 0.058],
      [0.8, 0.07],
      [0.71, 0.074],
      [0.69, 0.1],
      [0.0, 0.1],
    ])
    const collarGeo = latheFrom([
      [0.26, -0.065],
      [0.31, -0.065],
      [0.325, -0.04],
      [0.325, -0.01],
      [0.31, 0.0],
      [0.26, 0.0],
    ], 72)
    const finialGeo = latheFrom([
      [0.0, 0.0],
      [0.2, 0.0],
      [0.19, 0.02],
      [0.12, 0.04],
      [0.05, 0.065],
      [0.0, 0.07],
    ], 48)

    const postPts: [number, number][] = []
    const NPost = 90
    const bump = (y: number, c: number, w: number) => Math.exp(-(((y - c) / w) ** 2))
    for (let i = 0; i <= NPost; i++) {
      const y = (POST_LEN * i) / NPost
      const r =
        0.018 +
        0.026 * bump(y, 0.03, 0.03) +
        0.026 * bump(y, POST_LEN - 0.03, 0.03) +
        0.012 * bump(y, 0.11, 0.02) +
        0.012 * bump(y, POST_LEN - 0.11, 0.02) +
        0.016 * bump(y, POST_LEN / 2, 0.035) +
        0.006 * bump(y, POST_LEN / 2, 0.25)
      postPts.push([r, y])
    }
    const postGeo = latheFrom(postPts, 18)

    const plateMat = rimMaterial('#121828', glow(palette.ember, 0.12), 4.0, 0.88, 0.34)
    const plateMatTop = rimMaterial('#121828', glow(palette.ember, 0.12), 4.0, 0.88, 0.34)
    for (const m of [plateMat, plateMatTop]) m.transparent = true
    const postMats = [0, 1, 2, 3].map(() => rimMaterial('#121828', glow(palette.ember, 1.25), 3.0, 0.8, 0.32))

    // --- linework ----------------------------------------------------------------------------
    const bottomLines = makeLine(
      [
        [-PLATE_IN - PLATE_T + 0.03, 0.828, 0.25],
        [-PLATE_IN - PLATE_T + 0.058, 0.828, 1],
        [-PLATE_IN, 0.692, 0.25],
        [-PLATE_IN + 0.04, 0.33, 0.45],
      ],
      gold,
      1.4,
    )
    const topLines = makeLine(
      [
        [PLATE_IN + PLATE_T - 0.03, 0.828, 0.25],
        [PLATE_IN + PLATE_T - 0.058, 0.828, 0.65],
        [PLATE_IN, 0.692, 0.25],
        [PLATE_IN - 0.04, 0.33, 0.35],
        [PLATE_IN + PLATE_T + 0.002, 0.692, 0.3],
        [PLATE_IN + PLATE_T + 0.002, 0.2, 0.3],
      ],
      gold,
      1.4,
    )
    const glassLines = makeLine(
      [
        [0.0, profAt(table, 0) + 0.006],
        [0.955 * H, profAt(table, 0.955) + 0.004],
        [-0.955 * H, profAt(table, 0.955) + 0.004],
      ],
      new THREE.Color(palette.ice).multiplyScalar(1.6),
      1.0,
    )
    // mid-post rings echo the neck
    const postRingGeo = (() => {
      const pos: number[] = []
      const segs = 24
      for (let p = 0; p < 4; p++) {
        const th = POST_AZ + Math.PI / 4 + (p * Math.PI) / 2
        const cx = Math.sin(th) * POST_R
        const cz = Math.cos(th) * POST_R
        for (const [yy, rr] of [
          [0, 0.036],
          [-PLATE_IN + 0.11, 0.032],
          [PLATE_IN - 0.11, 0.032],
        ]) {
          for (let k = 0; k < segs; k++) {
            const a0 = (k / segs) * Math.PI * 2
            const a1 = ((k + 1) / segs) * Math.PI * 2
            pos.push(cx + Math.sin(a0) * rr, yy, cz + Math.cos(a0) * rr, cx + Math.sin(a1) * rr, yy, cz + Math.cos(a1) * rr)
          }
        }
      }
      const g = new LineSegmentsGeometry()
      g.setPositions(pos)
      return g
    })()
    const postRingMat = new LineMaterial({ linewidth: 1.2, transparent: true, depthWrite: false })
    postRingMat.color = gold.clone().multiplyScalar(0.55)
    postRingMat.toneMapped = false
    const postRings = new LineSegments2(postRingGeo, postRingMat)
    postRings.frustumCulled = false

    // --- particles ---------------------------------------------------------------------------
    const common = () => ({
      uProf: { value: table },
      uH: { value: H },
      uTime: { value: 0 },
      uViewH: { value: 1080 },
    })
    // Dense clusters use MAX blending: overlaps never sum past the hottest particle, so the
    // knot glows white-hot without blowing out into grain artifacts.
    const pointMat = (vertexShader: string, uniforms: Record<string, THREE.IUniform>, max = false) => {
      const m = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader: pointFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      if (max) {
        m.blending = THREE.CustomBlending
        m.blendEquation = THREE.MaxEquation
        m.blendSrc = THREE.OneFactor
        m.blendDst = THREE.OneFactor
      }
      return m
    }
    const hot = new THREE.Color('#ffe9d2').multiplyScalar(1.4)
    const ice = new THREE.Color(palette.ice).multiplyScalar(1.25)
    const ember = glow(palette.ember, 2.6)

    const swirlU = { ...common(), uFill: { value: 0 }, uSize: { value: 0.026 }, uIce: { value: ice }, uHot: { value: hot } }
    const knotU = { ...common(), uOn: { value: 0 }, uSize: { value: 0.024 }, uHot: { value: hot }, uIce: { value: ice } }
    const trickleU = {
      ...common(),
      uOn: { value: 0 },
      uSize: { value: 0.037 },
      uDrop: { value: 0.76 },
      uHot: { value: hot },
      uEmber: { value: ember },
    }
    const pileU = {
      ...common(),
      uGrow: { value: 0 },
      uSize: { value: 0.03 },
      uBase: { value: -H + 0.02 },
      uHeight: { value: 0.24 },
      uEmber: { value: ember },
      uDeep: { value: glow(palette.emberDeep, 1.6) },
    }

    const swirl = { geo: seeds(6800, 1, 3), mat: pointMat(swirlVertex, swirlU, true), u: swirlU }
    const knot = { geo: seeds(2600, 2), mat: pointMat(knotVertex, knotU, true), u: knotU }
    const trickle = { geo: seeds(150, 3), mat: pointMat(trickleVertex, trickleU, true), u: trickleU }
    const pile = { geo: seeds(1000, 4), mat: pointMat(pileVertex, pileU, true), u: pileU }
    const pourU = {
      ...common(),
      uPour: { value: 0 },
      uLevel: { value: 0 },
      uSpill: { value: 0 },
      uSize: { value: 0.028 },
      uIce: { value: ice },
    }
    const pour = { geo: seeds(560, 5), mat: pointMat(pourVertex, pourU, true), u: pourU }

    const knotGlowU = { uColor: { value: new THREE.Color('#fff1dc') }, uIntensity: { value: 0 } }
    const knotGlowMat = new THREE.ShaderMaterial({
      uniforms: knotGlowU,
      vertexShader: spriteVertex,
      fragmentShader: spriteFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pileGlowU = { uColor: { value: new THREE.Color(palette.ember) }, uIntensity: { value: 0 } }
    const massGlowU = { uColor: { value: new THREE.Color(palette.ice) }, uIntensity: { value: 0 } }
    const massGlowMat = new THREE.ShaderMaterial({
      uniforms: massGlowU,
      vertexShader: spriteVertex,
      fragmentShader: spriteFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pileGlowMat = new THREE.ShaderMaterial({
      uniforms: pileGlowU,
      vertexShader: spriteVertex,
      fragmentShader: spriteFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const planeGeo = new THREE.PlaneGeometry(1, 1)

    return {
      glassGeo,
      glassMat,
      glassUniforms,
      plateGeo,
      collarGeo,
      finialGeo,
      postGeo,
      plateMat,
      plateMatTop,
      postMats,
      bottomLines,
      topLines,
      glassLines,
      postRings,
      postRingMat,
      swirl,
      knot,
      trickle,
      pile,
      pour,
      knotGlowMat,
      knotGlowU,
      pileGlowMat,
      pileGlowU,
      massGlowMat,
      massGlowU,
      planeGeo,
    }
  }, [accent])

  useEffect(() => {
    return () => {
      const b = built
      ;[b.glassGeo, b.plateGeo, b.collarGeo, b.finialGeo, b.postGeo, b.planeGeo].forEach((g) => g.dispose())
      ;[b.glassMat, b.plateMat, b.plateMatTop, b.knotGlowMat, b.pileGlowMat, b.massGlowMat, b.postRingMat, ...b.postMats].forEach((m) => m.dispose())
      ;[b.bottomLines, b.topLines, b.glassLines].forEach((l) => {
        l.line.geometry.dispose()
        l.material.dispose()
      })
      b.postRings.geometry.dispose()
      ;[b.swirl, b.knot, b.trickle, b.pile, b.pour].forEach((s) => {
        s.geo.dispose()
        s.mat.dispose()
      })
    }
  }, [built])

  const viewH = size.height * viewport.dpr
  const postAngles = POST_ANGLES

  useFrame((state, dt) => {
    const p = prog.current
    const t = state.clock.elapsedTime
    const b = built

    // --- build-in schedule ---
    const pBase = easeOutExpo(seg(p, 0.0, 0.22))
    const pBaseLine = easeInOut(seg(p, 0.02, 0.3))
    const pPosts = easeOutCubic(seg(p, 0.1, 0.38))
    const pTop = easeOutExpo(seg(p, 0.22, 0.44))
    const pTopLine = easeInOut(seg(p, 0.22, 0.46))
    const pGlass = easeOutCubic(seg(p, 0.36, 0.62))
    const pGlassLine = easeInOut(seg(p, 0.42, 0.66))
    const xFill = seg(p, 0.48, 0.95)
    const pFill = xFill * (1.25 - 0.25 * xFill)
    const pKnot = easeOutCubic(seg(p, 0.78, 1.0))
    const pPile = easeOutCubic(seg(p, 0.84, 1.0))

    if (bottomPlate.current) {
      bottomPlate.current.visible = pBase > 0.001
      bottomPlate.current.position.y = -0.18 * (1 - pBase)
      bottomPlate.current.scale.setScalar(0.85 + 0.15 * pBase)
    }
    if (topPlate.current) {
      topPlate.current.visible = pTop > 0.001
      topPlate.current.position.y = 0.22 * (1 - pTop)
      topPlate.current.scale.setScalar(0.85 + 0.15 * pTop)
    }
    if (posts.current) {
      posts.current.visible = pPosts > 0.001
      posts.current.scale.set(1, Math.max(pPosts, 0.0001), 1)
    }
    b.bottomLines.line.geometry.instanceCount = Math.floor(b.bottomLines.count * pBaseLine)
    b.topLines.line.geometry.instanceCount = Math.floor(b.topLines.count * pTopLine)
    b.glassLines.line.geometry.instanceCount = Math.floor(b.glassLines.count * pGlassLine)
    b.glassLines.material.opacity = 0.55 * pGlass
    b.postRingMat.opacity = pPosts * pPosts
    b.glassUniforms.uOpacity.value = pGlass
    b.plateMat.opacity = easeInOut(seg(p, 0.03, 0.09))
    b.plateMatTop.opacity = easeInOut(seg(p, 0.24, 0.3))
    b.plateMat.transparent = b.plateMat.opacity < 1
    b.plateMatTop.transparent = b.plateMatTop.opacity < 1

    for (const m of [b.bottomLines.material, b.topLines.material, b.glassLines.material, b.postRingMat]) {
      m.resolution.set(size.width, size.height)
    }

    // --- particles ---
    for (const s of [b.swirl, b.knot, b.trickle, b.pile, b.pour]) {
      s.u.uTime.value = t
      s.u.uViewH.value = viewH
    }
    b.swirl.u.uFill.value = pFill
    b.knot.u.uOn.value = Math.max(pKnot, 0.6 * smoothClamp(pFill, 0.15, 0.35)) * Math.min(1, pFill * 3)
    b.trickle.u.uOn.value = pKnot
    b.pile.u.uGrow.value = pPile
    b.pour.u.uPour.value = smoothClamp(xFill, 0.0, 0.06) * (1 - smoothClamp(xFill, 0.8, 1.0))
    b.pour.u.uLevel.value = Math.min(pFill * 1.06, 0.98) * H
    b.pour.u.uSpill.value = smoothClamp(p, 0.9, 1.0)

    // the knot throbs irregularly, like pressure building against a door
    const throb = 0.75 + 0.18 * Math.sin(t * 2.3) + 0.1 * Math.sin(t * 5.7 + 1.3) + 0.07 * Math.sin(t * 11.1)
    b.knotGlowU.uIntensity.value = 0.6 * b.knot.u.uOn.value * throb
    b.massGlowU.uIntensity.value = 0.2 * b.swirl.u.uFill.value
    b.pileGlowU.uIntensity.value = 0.25 * pPile * (0.9 + 0.1 * Math.sin(t * 1.7))

    // billboards
    const cam = state.camera
    if (sprite.current) sprite.current.quaternion.copy(cam.quaternion)
    if (pileGlow.current) pileGlow.current.quaternion.copy(cam.quaternion)
    if (massGlow.current) massGlow.current.quaternion.copy(cam.quaternion)

    // posts behind the glass (relative to the camera) recede so the silhouette reads as two clean lines
    const yaw = root.current ? root.current.rotation.y : 0
    const cx = cam.position.x
    const cz = cam.position.z
    const cl = Math.hypot(cx, cz) || 1
    postAngles.forEach((a, i) => {
      const f = (Math.sin(a + yaw) * cx + Math.cos(a + yaw) * cz) / cl
      const k = 0.28 + 0.72 * THREE.MathUtils.smoothstep(f, -0.3, 0.3)
      const m = b.postMats[i]
      ;(m.userData.rim as THREE.Color).copy(m.userData.rimBase as THREE.Color).multiplyScalar(k)
    })

    // idle: a slow, stately yaw
    if (root.current) {
      root.current.rotation.y = 0.07 * Math.sin(t * 0.22)
    }
    void dt
  })


  return (
    <group ref={root}>
      {/* bottom plate */}
      <group ref={bottomPlate}>
        <mesh geometry={built.plateGeo} material={built.plateMat} position-y={-PLATE_IN - PLATE_T} />
        <mesh geometry={built.collarGeo} material={built.plateMat} position-y={-PLATE_IN} rotation-x={Math.PI} />
        <primitive object={built.bottomLines.line} renderOrder={3} />
      </group>

      {/* posts */}
      <group ref={posts} position-y={-PLATE_IN}>
        {postAngles.map((a, i) => (
          <mesh
            key={i}
            geometry={built.postGeo}
            material={built.postMats[i]}
            position={[Math.sin(a) * POST_R, 0, Math.cos(a) * POST_R]}
          />
        ))}
        <group position-y={PLATE_IN}>
          <primitive object={built.postRings} renderOrder={3} />
        </group>
      </group>

      {/* top plate */}
      <group ref={topPlate}>
        <mesh geometry={built.plateGeo} material={built.plateMatTop} position-y={PLATE_IN + PLATE_T} rotation-x={Math.PI} />
        <mesh geometry={built.collarGeo} material={built.plateMatTop} position-y={PLATE_IN} />
        <mesh geometry={built.finialGeo} material={built.plateMatTop} position-y={PLATE_IN + PLATE_T} />
        <primitive object={built.topLines.line} renderOrder={3} />
      </group>

      {/* glass */}
      <mesh geometry={built.glassGeo} material={built.glassMat} renderOrder={2} />
      <primitive object={built.glassLines.line} renderOrder={3} />

      {/* contents */}
      <points geometry={built.swirl.geo} material={built.swirl.mat} renderOrder={4} frustumCulled={false} />
      <points geometry={built.knot.geo} material={built.knot.mat} renderOrder={5} frustumCulled={false} />
      <points geometry={built.trickle.geo} material={built.trickle.mat} renderOrder={5} frustumCulled={false} />
      <points geometry={built.pile.geo} material={built.pile.mat} renderOrder={5} frustumCulled={false} />
      <points geometry={built.pour.geo} material={built.pour.mat} renderOrder={4} frustumCulled={false} />
      <mesh ref={massGlow} geometry={built.planeGeo} material={built.massGlowMat} position-y={0.56} scale={[0.95, 0.85, 1]} renderOrder={3} />
      <mesh ref={sprite} geometry={built.planeGeo} material={built.knotGlowMat} position-y={0.03} scale={0.6} renderOrder={6} />
      <mesh ref={pileGlow} geometry={built.planeGeo} material={built.pileGlowMat} position-y={-H + 0.08} scale={[1.0, 0.6, 1]} renderOrder={6} />
    </group>
  )
}

function smoothClamp(x: number, a: number, b: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
