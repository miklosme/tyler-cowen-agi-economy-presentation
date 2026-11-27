/**
 * DnaHelix — "Live long enough."
 *
 * A tall double helix in dark satin with gold filament linework. Several base-pair rungs are
 * broken: alarm-crimson, snapped in the middle with pointed shards and a red wound glow,
 * flickering. An ice-cyan repair ring sweeps up the helix; as it passes a broken rung the halves
 * snap together, flash white at the join and cool to ember gold with a spark burst. When the
 * sweep finishes, an ember pulse climbs the fully gold helix and gold motes lift off. Then a few
 * rungs quietly re-break and the next sweep begins, so the idle loop runs forever.
 *
 * Build-in: the gold filaments print the strands upward with glowing draw heads, the satin tube
 * follows, rungs seat as the front passes them, damaged rungs crack red after they land, and the
 * repair ring fades in at the base.
 *
 * Variants: "repair" (default loop) and "healed" (all gold; the ring keeps scanning).
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'DNA helix · repair wave',
  distance: 6.2,
  elevation: 4,
  azimuth: 18,
  variants: ['repair', 'healed'],
}

// ---------------------------------------------------------------- geometry constants
const HALF_H = 1.2 // backbone spans y ∈ [-1.2, 1.2]
const R = 0.5 // helix radius
const N = 20 // base pairs
const TURNS = 2.1
const GROOVE = Math.PI * 0.78 // phase offset of strand B: major / minor groove
const K = (TURNS * Math.PI * 2) / (HALF_H * 2) // radians per unit height
const RUNG_Y0 = -1.0
const RUNG_Y1 = 1.0
const TUBE_R = 0.054
const BEAD_R = 0.058
const RUNG_R = 0.016
const FIL_R = 0.0068
const RING_R = R + 0.12

// ---------------------------------------------------------------- loop timing (seconds)
const T_TRAVEL = 5.4 // wave sweeps bottom → top
const T_HOLD = 2.5 // fully gold rest + victory pulse
const T_BREAK = 1.9 // a few rungs re-break, staggered
const T_LOOP = T_TRAVEL + T_HOLD + T_BREAK + 0.7
const WAVE_Y0 = -1.24
const WAVE_Y1 = 1.24
const WAVE_PARK = -1.12 // where the ring waits during the build-in
const JOIN = 0.22 // seconds for broken halves to snap together

// chosen so the breaks face (or directly back) the camera at the hero angle
const INITIAL_BROKEN = [1, 6, 10, 12, 16, 18]

// ---------------------------------------------------------------- build-in pacing
const DRAW_END = 0.86 // progress at which the strands finish printing
const LEAD = 0.015 // filament leads the satin tube by this fraction of height
const lineFront = (p: number) => clamp01(p / DRAW_END)
/** Progress at which the satin tube's draw front reaches height fraction f. */
const frontP = (f: number) => DRAW_END * Math.min(1, f + LEAD)

function strandPoint(y: number, phase: number, r = R, out = new THREE.Vector3()) {
  const a = y * K + phase
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r)
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeOutBack = (x: number) => {
  const c1 = 2.2
  const c3 = c1 + 1
  const t = clamp01(x) - 1
  return 1 + c3 * t * t * t + c1 * t * t
}
const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x))

function waveY(tau: number) {
  return WAVE_Y0 + (WAVE_Y1 - WAVE_Y0) * easeInOutSine(tau / T_TRAVEL)
}
/** Inverse of waveY: loop time at which the ring reaches height y. */
function tauAt(y: number) {
  const f = clamp01((y - WAVE_Y0) / (WAVE_Y1 - WAVE_Y0))
  return (Math.acos(1 - 2 * f) / Math.PI) * T_TRAVEL
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- shaders
/** Shared depth cue: 1 on the near side of the helix axis, dimmer on the far side. */
const depthVert = /* glsl */ `
  float axisDepth(vec4 mv) {
    return mv.z - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  }
`

const filamentVert = /* glsl */ `
  ${depthVert}
  varying float vY;
  varying float vDepth;
  void main() {
    vY = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = axisDepth(mv);
    gl_Position = projectionMatrix * mv;
  }
`
const filamentFrag = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uIce;
  uniform float uWaveY;
  uniform float uWave;
  uniform float uPulseY;
  uniform float uPulse;
  varying float vY;
  varying float vDepth;
  void main() {
    float d = (vY - uWaveY) / 0.11;
    float w = exp(-d * d) * uWave;
    float pd = (vY - uPulseY) / 0.3;
    float pl = exp(-pd * pd) * uPulse;
    float depthK = mix(0.38, 1.0, smoothstep(-0.5, 0.45, vDepth));
    vec3 c = uGold * depthK * (1.0 + pl * 1.6) + uIce * w * 0.9;
    gl_FragColor = vec4(c, 1.0);
  }
`

/** Additive fresnel rim on the satin tubes so the rear arcs still read as a second strand. */
const rimVert = /* glsl */ `
  ${depthVert}
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vDepth = axisDepth(mv);
    vY = position.y;
    gl_Position = projectionMatrix * mv;
  }
`
const rimFrag = /* glsl */ `
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform float uPulseY;
  uniform float uPulse;
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  varying float vY;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    f = pow(f, 2.4);
    float depthK = mix(0.55, 1.0, smoothstep(-0.5, 0.45, vDepth));
    float pd = (vY - uPulseY) / 0.3;
    float pl = exp(-pd * pd) * uPulse;
    vec3 c = mix(uCool, uWarm, 0.5 + 0.5 * smoothstep(-0.3, 0.3, vN.x)) * f * depthK * (1.0 + pl * 1.5);
    gl_FragColor = vec4(c, 1.0);
  }
`

/** Rungs + shards: instanced, per-instance color, cylindrical shading and depth cue. */
const rungVert = /* glsl */ `
  ${depthVert}
  varying vec3 vColor;
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  void main() {
    vec4 lp = instanceMatrix * vec4(position, 1.0);
    vec3 n = mat3(instanceMatrix) * normal;
    vec4 mv = modelViewMatrix * lp;
    vN = normalize(normalMatrix * n);
    vV = -mv.xyz;
    vDepth = axisDepth(mv);
    vColor = instanceColor;
    gl_Position = projectionMatrix * mv;
  }
`
const rungFrag = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float shade = 0.42 + 0.58 * pow(facing, 0.8);
    float depthK = mix(0.4, 1.0, smoothstep(-0.5, 0.45, vDepth));
    gl_FragColor = vec4(vColor * shade * depthK, 1.0);
  }
`

const sparkVert = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (6.0 / -mv.z);
  }
`
const sparkFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d);
    a = a * a * (0.6 + 0.4 * a) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`

const moteVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    vec3 p = position;
    float rise = mod(p.y + 1.4 + uTime * (0.05 + aSeed * 0.07), 2.8) - 1.4;
    float sw = uTime * (0.15 + aSeed * 0.2) + aSeed * 30.0;
    p.y = rise;
    p.x += sin(sw) * 0.06;
    p.z += cos(sw * 1.3) * 0.06;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float edge = smoothstep(1.4, 1.0, abs(rise));
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed) + aSeed * 17.0);
    vAlpha = edge * uOpacity * tw * 0.8;
    vWarm = step(0.38, fract(aSeed * 7.13));
    gl_PointSize = (3.0 + aSeed * 5.0) * uPixelRatio * (6.0 / -mv.z);
  }
`
const moteFrag = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uIce;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= vAlpha;
    vec3 c = mix(uIce, uGold, vWarm);
    gl_FragColor = vec4(c * a, a);
  }
`

/** Horizontal glow disc of the repair wave: a gaussian ring plus a faint inner scan sheet. */
const discVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const discFrag = /* glsl */ `
  uniform vec3 uIce;
  uniform float uOpacity;
  uniform float uRing;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float d = (r - uRing) / 0.05;
    float ring = exp(-d * d);
    float halo = exp(-pow((r - uRing) / 0.2, 2.0)) * 0.2;
    float fill = smoothstep(uRing, 0.0, r) * 0.08;
    float a = (ring + halo + fill) * uOpacity;
    gl_FragColor = vec4(uIce * a, a);
  }
`

/** Vertical light sheath trailing below the ring, brightest at its silhouette edges. */
const sheathVert = /* glsl */ `
  varying float vV;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vV = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`
const sheathFrag = /* glsl */ `
  uniform vec3 uIce;
  uniform float uOpacity;
  varying float vV;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    // vV = 1 at the ring, 0 at the bottom of the trail
    float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
    float a = (pow(vV, 2.0) * 0.34 + exp(-pow((1.0 - vV) / 0.05, 2.0)) * 0.3) * (0.3 + 0.7 * edge);
    a *= uOpacity;
    gl_FragColor = vec4(uIce * a, a);
  }
`

// ---------------------------------------------------------------- rung state
type RungState = {
  y: number
  pA: THREE.Vector3
  pB: THREE.Vector3
  mid: THREE.Vector3
  mode: number
  t0: number
  seed: number
  emberClock: number
  burst: boolean
  initial: boolean
}

const OK = 0
const BROKEN = 1
const HEALING = 2
const BREAKING = 3

const SPARKS = 480
const GLOWS = N + 2 // wound glows at each rung gap + two draw heads

export default function DnaHelix({ progress = 1, variant }: ModelProps) {
  const healedVariant = variant === 'healed'
  const spin = useRef<THREE.Group>(null)
  const rise = useRef<THREE.Group>(null)
  const waveRef = useRef<THREE.Group>(null)
  const ticksRef = useRef<THREE.Mesh>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress

  // ------------------------------------------------------------ static geometry
  const built = useMemo(() => {
    const makeStrand = (phase: number) => {
      const pts: THREE.Vector3[] = []
      const fil: THREE.Vector3[] = []
      const S = 220
      for (let i = 0; i <= S; i++) {
        const y = -HALF_H + (2 * HALF_H * i) / S
        pts.push(strandPoint(y, phase))
        // filament rides the outside of the tube and dives into the end caps
        const taper = Math.sin((Math.PI / 2) * clamp01((HALF_H - Math.abs(y)) / 0.12))
        const p = strandPoint(y, phase, R + TUBE_R * 1.06 * taper)
        p.y += TUBE_R * 0.3 * taper
        fil.push(p)
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 360, TUBE_R, 16, false)
      const line = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fil), 360, FIL_R, 5, false)
      // tangent at each end (pointing outward) for the terminal jewels
      const tan = (y: number, sign: number) => {
        const a = y * K + phase
        return new THREE.Vector3(-R * K * Math.sin(a), 1, R * K * Math.cos(a)).normalize().multiplyScalar(sign)
      }
      const ends = [
        { p: strandPoint(-HALF_H, phase), t: tan(-HALF_H, -1), top: false },
        { p: strandPoint(HALF_H, phase), t: tan(HALF_H, 1), top: true },
      ]
      return { tube, line, ends }
    }
    const A = makeStrand(0)
    const B = makeStrand(GROOVE)

    const rungGeo = new THREE.CylinderGeometry(RUNG_R, RUNG_R, 1, 12, 1, false)
    rungGeo.translate(0, 0.5, 0)
    const beadGeo = new THREE.SphereGeometry(BEAD_R, 18, 12)
    const shardGeo = new THREE.ConeGeometry(RUNG_R * 1.25, 0.075, 6, 1)
    shardGeo.translate(0, 0.0375, 0)
    const capGeo = new THREE.SphereGeometry(TUBE_R * 1.22, 16, 12)
    const jewelGeo = new THREE.SphereGeometry(0.026, 14, 10)

    const rungs: RungState[] = []
    for (let i = 0; i < N; i++) {
      const y = RUNG_Y0 + ((RUNG_Y1 - RUNG_Y0) * i) / (N - 1)
      const pA = strandPoint(y, 0)
      const pB = strandPoint(y, GROOVE)
      rungs.push({
        y,
        pA,
        pB,
        mid: pA.clone().add(pB).multiplyScalar(0.5),
        mode: OK,
        t0: -10,
        seed: Math.random(),
        emberClock: Math.random(),
        burst: true,
        initial: false,
      })
    }

    // drifting motes: a close aura, not background dust
    const MOTES = 150
    const mp = new Float32Array(MOTES * 3)
    const ms = new Float32Array(MOTES)
    for (let i = 0; i < MOTES; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.35 + Math.pow(Math.random(), 0.8) * 0.5
      mp[i * 3] = Math.cos(a) * r
      mp[i * 3 + 1] = (Math.random() * 2 - 1) * 1.4
      mp[i * 3 + 2] = Math.sin(a) * r
      ms[i] = Math.random()
    }
    const motes = new THREE.BufferGeometry()
    motes.setAttribute('position', new THREE.BufferAttribute(mp, 3))
    motes.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1))

    const pointCloud = (count: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage))
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage))
      return g
    }
    const sparks = pointCloud(SPARKS)
    const glows = pointCloud(GLOWS)
    const pool = {
      vel: new Float32Array(SPARKS * 3),
      life: new Float32Array(SPARKS),
      max: new Float32Array(SPARKS).fill(1),
      size0: new Float32Array(SPARKS),
      drag: new Float32Array(SPARKS),
      next: 0,
    }

    const sheath = new THREE.CylinderGeometry(RING_R, RING_R, 0.36, 64, 1, true)
    sheath.translate(0, -0.18, 0)
    const disc = new THREE.CircleGeometry(1.0, 96)
    const ring = new THREE.TorusGeometry(RING_R, 0.009, 8, 160)
    // reticle ticks riding the ring
    const tickParts: THREE.BufferGeometry[] = []
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const long = k % 2 === 0
      const b = new THREE.BoxGeometry(0.008, long ? 0.075 : 0.04, 0.008)
      b.translate(Math.cos(a) * (RING_R + 0.035), 0, Math.sin(a) * (RING_R + 0.035))
      tickParts.push(b)
    }
    const ticks = mergeGeometries(tickParts)!

    return { A, B, rungGeo, beadGeo, shardGeo, capGeo, jewelGeo, rungs, motes, sparks, glows, pool, sheath, disc, ring, ticks }
  }, [])

  // ------------------------------------------------------------ materials
  const mats = useMemo(() => {
    const satin = new THREE.MeshStandardMaterial({
      color: '#1a2238',
      metalness: 0.68,
      roughness: 0.34,
      envMapIntensity: 1.8,
    })
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    const filament = new THREE.ShaderMaterial({
      uniforms: {
        uGold: { value: glow(palette.ember, 1.9) },
        uIce: { value: glow(palette.ice, 2.0) },
        uWaveY: { value: -10 },
        uWave: { value: 0 },
        uPulseY: { value: -10 },
        uPulse: { value: 0 },
      },
      vertexShader: filamentVert,
      fragmentShader: filamentFrag,
    })
    const rim = new THREE.ShaderMaterial({
      uniforms: {
        uWarm: { value: glow(palette.ember, 0.42) },
        uCool: { value: glow(palette.ice, 0.22) },
        uPulseY: { value: -10 },
        uPulse: { value: 0 },
      },
      vertexShader: rimVert,
      fragmentShader: rimFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const rung = new THREE.ShaderMaterial({ vertexShader: rungVert, fragmentShader: rungFrag })
    const jewel = new THREE.MeshBasicMaterial({ color: glow(palette.ember, 2.2), toneMapped: false })
    const points = (extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: pixelRatio } },
        vertexShader: sparkVert,
        fragmentShader: sparkFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        ...extra,
      })
    const spark = points()
    const glowPts = points()
    const mote = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uGold: { value: glow(palette.ember, 1.4) },
        uIce: { value: glow(palette.ice, 1.3) },
      },
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const disc = new THREE.ShaderMaterial({
      uniforms: { uIce: { value: glow(palette.ice, 1.3) }, uOpacity: { value: 0 }, uRing: { value: RING_R } },
      vertexShader: discVert,
      fragmentShader: discFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const sheath = new THREE.ShaderMaterial({
      uniforms: { uIce: { value: glow(palette.ice, 1.1) }, uOpacity: { value: 0 } },
      vertexShader: sheathVert,
      fragmentShader: sheathFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.MeshBasicMaterial({
      color: glow(palette.ice, 1.7),
      toneMapped: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const tick = new THREE.MeshBasicMaterial({
      color: glow(palette.ice, 1.5),
      toneMapped: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    return { satin, filament, rim, rung, jewel, spark, glowPts, mote, disc, sheath, ring, tick }
  }, [])

  // ------------------------------------------------------------ scene objects built imperatively
  const objs = useMemo(() => {
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, color: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, count)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      if (color) {
        // allocate instanceColor before the first compile so the shader gets USE_INSTANCING_COLOR
        for (let i = 0; i < count; i++) m.setColorAt(i, new THREE.Color(0, 0, 0))
        m.instanceColor!.setUsage(THREE.DynamicDrawUsage)
      }
      m.frustumCulled = false
      return m
    }
    return {
      rungs: mk(built.rungGeo, mats.rung, N * 2, true),
      shards: mk(built.shardGeo, mats.rung, N * 2, true),
      beads: mk(built.beadGeo, mats.satin, N * 2, false),
      filA: new THREE.Mesh(built.A.line, mats.filament),
      filB: new THREE.Mesh(built.B.line, mats.filament),
      rimA: new THREE.Mesh(built.A.tube, mats.rim),
      rimB: new THREE.Mesh(built.B.tube, mats.rim),
    }
  }, [built, mats])

  // ------------------------------------------------------------ simulation state
  const sim = useRef({
    started: false,
    tau: 0,
    time: 0,
    lastTau: 0,
    rng: mulberry32(7),
  })

  // initial disease pattern
  useLayoutEffect(() => {
    const s = sim.current
    for (const r of built.rungs) {
      r.mode = OK
      r.initial = false
    }
    if (!healedVariant)
      for (const i of INITIAL_BROKEN) {
        built.rungs[i].mode = BROKEN
        built.rungs[i].initial = true
      }
    if (progressRef.current >= 0.999) {
      // Mounted already assembled (harness, or a slide revisit): start mid-sweep, just before
      // the ring reaches a broken rung, so the frame shows healed gold below, damage above and
      // a heal about to fire.
      s.started = true
      const target = built.rungs.find((r) => r.mode === BROKEN && r.y > -0.45)
      s.tau = target ? tauAt(target.y - 0.2) : 1.6
      const wy = waveY(s.tau)
      for (const r of built.rungs) if (r.mode === BROKEN && r.y < wy) r.mode = OK
    }
  }, [built, healedVariant])

  // ------------------------------------------------------------ scratch objects
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      q3: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      tip: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      s: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      c: new THREE.Color(),
      c2: new THREE.Color(),
      red: new THREE.Color('#ff2418').lerp(new THREE.Color(palette.alarm), 0.5),
      gold: glow(palette.ember, 1),
      goldDeep: glow(palette.emberDeep, 1),
      ice: glow(palette.ice, 1),
      white: new THREE.Color('#fff4e0'),
      headCol: new THREE.Color('#fff8ec').lerp(new THREE.Color(palette.ice), 0.35),
    }),
    [],
  )

  function spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: THREE.Color,
    drag = 2.5,
  ) {
    const P = built.pool
    const i = P.next
    P.next = (P.next + 1) % SPARKS
    const pos = built.sparks.attributes.position.array as Float32Array
    const col = built.sparks.attributes.aColor.array as Float32Array
    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    P.vel[i * 3] = vx
    P.vel[i * 3 + 1] = vy
    P.vel[i * 3 + 2] = vz
    P.life[i] = life
    P.max[i] = life
    P.size0[i] = size
    P.drag[i] = drag
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
  }

  function burst(r: RungState) {
    const m = r.mid
    // seam flash
    spawn(m.x, m.y, m.z, 0, 0, 0, 0.35, 60, tmp.c.copy(tmp.white).multiplyScalar(1.8), 0)
    spawn(m.x, m.y, m.z, 0, 0, 0, 1.0, 26, tmp.c.copy(tmp.gold).multiplyScalar(1.5), 0)
    for (let k = 0; k < 26; k++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const sp = 0.7 + Math.random() * 1.2
      const warm = Math.random() < 0.72
      const c = tmp.c.copy(warm ? tmp.gold : tmp.ice).multiplyScalar(2.0)
      spawn(m.x, m.y, m.z, s * Math.cos(t) * sp, u * sp * 0.7 + 0.15, s * Math.sin(t) * sp, 0.6 + Math.random() * 0.7, 7 + Math.random() * 6, c, 1.8)
    }
  }

  // ------------------------------------------------------------ frame loop
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const p = progressRef.current
    const s = sim.current
    s.time += dt
    const now = s.time

    // build-in transforms
    const pb = easeOutCubic(p / 0.85)
    if (rise.current) rise.current.position.y = (1 - pb) * -0.14
    if (spin.current) spin.current.rotation.y += dt * 0.22

    // strand draw-on (bottom → top): the gold filament prints, the satin tube follows
    const lineT = lineFront(p)
    const drawT = Math.max(0, lineT - LEAD * (1 - clamp01((lineT - 0.9) / 0.1)))
    for (const st of [built.A, built.B]) {
      const idx = st.tube.index!.count
      const ring = 16 * 6
      st.tube.setDrawRange(0, Math.floor((idx * drawT) / ring) * ring)
      const lidx = st.line.index!.count
      const lring = 5 * 6
      st.line.setDrawRange(0, Math.floor((lidx * lineT) / lring) * lring)
    }

    // loop clock
    if (!s.started && p >= 0.98) {
      s.started = true
      s.tau = tauAt(WAVE_PARK) // continue from where the ring waited during the build
      s.lastTau = s.tau
    }
    if (s.started) {
      s.tau += dt
      if (s.tau >= T_LOOP) s.tau -= T_LOOP
    }
    const tau = s.tau
    const traveling = s.started && tau < T_TRAVEL
    const wy = s.started ? (traveling ? waveY(tau) : -10) : WAVE_PARK
    const waveVis = s.started
      ? clamp01(tau / 0.5) *
        clamp01((T_TRAVEL - tau) / 0.6) *
        clamp01((p - 0.85) / 0.15) *
        clamp01((HALF_H - 0.05 - wy) / 0.2)
      : clamp01((p - 0.7) / 0.2)

    // victory beat: once the sweep completes, an ember pulse climbs the healed helix
    const restT = tau - T_TRAVEL
    const rest = s.started && restT > 0 && restT < 1.9 ? Math.sin((Math.PI * restT) / 1.9) : 0
    const restY = -1.45 + 2.9 * clamp01(restT / 1.7)
    if (s.started && !healedVariant && s.lastTau < T_TRAVEL && tau >= T_TRAVEL) {
      for (let k = 0; k < 60; k++) {
        const r = built.rungs[Math.floor(Math.random() * N)]
        const a = Math.random()
        spawn(
          r.pA.x + (r.pB.x - r.pA.x) * a,
          r.y + (Math.random() - 0.5) * 0.1,
          r.pA.z + (r.pB.z - r.pA.z) * a,
          (Math.random() - 0.5) * 0.08,
          0.1 + Math.random() * 0.15,
          (Math.random() - 0.5) * 0.08,
          3 + Math.random() * 2,
          6 + Math.random() * 4,
          tmp.c.copy(tmp.gold).multiplyScalar(1.5),
          0.15,
        )
      }
    }

    // re-break a few rungs after the rest
    const breakStart = T_TRAVEL + T_HOLD
    if (!healedVariant && s.started && s.lastTau < breakStart && tau >= breakStart) {
      const pick = new Set<number>()
      const count = 4 + Math.floor(s.rng() * 2)
      while (pick.size < count) pick.add(Math.floor(s.rng() * N))
      const order = [...pick].sort(() => s.rng() - 0.5)
      order.forEach((i, k) => {
        const r = built.rungs[i]
        r.mode = BREAKING
        r.t0 = now + k * (T_BREAK / count)
      })
    }
    s.lastTau = tau

    // wave → heal
    if (traveling) {
      for (const r of built.rungs) {
        if ((r.mode === BROKEN || r.mode === BREAKING) && wy >= r.y - 0.02 && now >= r.t0) {
          r.mode = HEALING
          r.t0 = now
          r.burst = false
        }
      }
    }

    // rungs, shards, beads, wound glows
    const rm = objs.rungs
    const shm = objs.shards
    const bm = objs.beads
    const gpos = built.glows.attributes.position.array as Float32Array
    const gcol = built.glows.attributes.aColor.array as Float32Array
    const gsize = built.glows.attributes.aSize.array as Float32Array
    const galpha = built.glows.attributes.aAlpha.array as Float32Array
    const { m, q, q2, q3, v, tip, dir, axis, s: sc, up, c, c2 } = tmp
    for (let i = 0; i < N; i++) {
      const r = built.rungs[i]
      // build-in: seat each rung once the satin front has passed it
      const st = frontP((r.y + HALF_H) / (2 * HALF_H)) + 0.01
      const grow = easeOutCubic((p - st) / 0.12)
      const beadS = easeOutBack((p - st + 0.02) / 0.12)
      // damaged rungs land healthy, then crack once seated
      const crack = s.started || !r.initial ? 1 : easeOutCubic((p - st - 0.11) / 0.05)

      // damage amount bf ∈ [0,1] (overshoots slightly while healing)
      let bf = 0
      let flash = 0
      if (r.mode === BROKEN) bf = crack
      else if (r.mode === HEALING) {
        const el = now - r.t0
        bf = 1 - easeOutBack(el / JOIN)
        // flash peaks when the halves meet, then cools white → gold quickly
        flash = el < JOIN ? 0.2 * (el / JOIN) : Math.exp(-(el - JOIN) * 7)
        if (!r.burst && el >= JOIN * 0.85) {
          r.burst = true
          burst(r)
        }
        if (el > 2.5) r.mode = OK
      } else if (r.mode === BREAKING) {
        if (now >= r.t0) {
          const x = (now - r.t0) / 0.55
          bf = easeOutCubic(x)
          if (x >= 1) r.mode = BROKEN
          if (x > 0 && x - dt / 0.55 <= 0) {
            for (let k = 0; k < 6; k++)
              spawn(r.mid.x, r.mid.y, r.mid.z, (Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.5, 0.8, 5, tmp.c.copy(tmp.red).multiplyScalar(1.8), 2)
          }
        }
      }
      const dmg = clamp01(bf)

      // flicker for diseased rungs
      const fl =
        0.75 +
        0.25 * Math.sin(now * (9 + r.seed * 7) + r.seed * 50) * Math.sin(now * (2.3 + r.seed * 3) + r.seed * 9)
      const stutter = Math.sin(now * 31 + r.seed * 100) > 0.93 ? 0.65 : 1

      // wave highlight on passing rungs
      const wd = (r.y - wy) / 0.05
      const scan = Math.exp(-wd * wd) * waveVis

      // color
      const breath = 0.94 + 0.06 * Math.sin(now * 1.4 + r.y * 2.2)
      const band = Math.exp(-Math.pow((r.y - restY) / 0.3, 2))
      c.copy(tmp.gold)
        .lerp(tmp.goldDeep, i % 2 ? 0.36 : 0.16)
        .multiplyScalar(1.2 * breath * (1 + rest * 1.1 * band))
      c.lerp(c2.copy(tmp.red).multiplyScalar(2.2 * fl * stutter), dmg)
      if (flash > 0) {
        c.r += tmp.white.r * flash * 3
        c.g += tmp.white.g * flash * 3
        c.b += tmp.white.b * flash * 3
      }
      c.r += tmp.ice.r * scan * 0.6
      c.g += tmp.ice.g * scan * 0.6
      c.b += tmp.ice.b * scan * 0.6
      const peak = Math.max(c.r, c.g, c.b)
      if (peak > 2.8) c.multiplyScalar(2.8 / peak)

      // ember drift from broken gaps
      if (dmg > 0.9 && p > 0.95) {
        r.emberClock -= dt
        if (r.emberClock <= 0) {
          r.emberClock = 0.4 + Math.random() * 0.6
          spawn(
            r.mid.x + (Math.random() - 0.5) * 0.1,
            r.mid.y,
            r.mid.z + (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.06,
            0.12 + Math.random() * 0.1,
            (Math.random() - 0.5) * 0.06,
            1.2 + Math.random() * 0.6,
            4 + Math.random() * 2,
            tmp.c2.copy(tmp.red).multiplyScalar(1.6),
            0.4,
          )
        }
      }

      // wound glow at the gap
      gpos[i * 3] = r.mid.x
      gpos[i * 3 + 1] = r.mid.y
      gpos[i * 3 + 2] = r.mid.z
      gcol[i * 3] = tmp.red.r * 1.3
      gcol[i * 3 + 1] = tmp.red.g * 1.3
      gcol[i * 3 + 2] = tmp.red.b * 1.3
      gsize[i] = 34
      galpha[i] = dmg * grow * fl * stutter * 0.55

      // two halves
      for (let h = 0; h < 2; h++) {
        const from = h === 0 ? r.pA : r.pB
        dir.copy(r.mid).sub(from)
        const full = dir.length()
        dir.multiplyScalar(1 / full)
        // snapped: a gap at the join, halves bent slightly apart, pointed shards facing the gap
        const gap = 0.3 * dmg
        const len = Math.max(0.0001, (full - gap * 0.5) * Math.min(1, grow * 1.8))
        axis.crossVectors(dir, up).normalize()
        const tilt = (h === 0 ? 1 : -1) * 0.12 * bf + (dmg > 0.5 ? Math.sin(now * 23 + r.seed * 40 + h) * 0.01 : 0)
        q2.setFromAxisAngle(axis, tilt)
        v.copy(dir).applyQuaternion(q2)
        q.setFromUnitVectors(up, v)
        const th = Math.max(0.0001, (1 + dmg * 0.2) * grow)
        sc.set(th, len, th)
        m.compose(from, q, sc)
        rm.setMatrixAt(i * 2 + h, m)
        // base-pair two-tone: strand B's half runs a touch paler
        if (h === 1 && dmg < 1) {
          c2.copy(tmp.white).multiplyScalar(Math.max(c.r, c.g, c.b) * 0.92)
          c2.lerpColors(c, c2, 0.06 * (1 - dmg))
          rm.setColorAt(i * 2 + h, c2)
        } else rm.setColorAt(i * 2 + h, c)

        // shard: a pointed continuation of the half, aimed at the missing join
        tip.copy(v).multiplyScalar(len).add(from)
        q3.setFromAxisAngle(up, now * 1.3 + r.seed * 9 + h * 2)
        q3.premultiply(q)
        sc.setScalar(Math.max(0.0001, dmg * grow))
        m.compose(tip, q3, sc)
        shm.setMatrixAt(i * 2 + h, m)
        c2.copy(c).multiplyScalar(1.2)
        shm.setColorAt(i * 2 + h, c2)

        // satin knuckle at the backbone junction
        q.identity()
        sc.setScalar(Math.max(0.0001, beadS))
        m.compose(from, q, sc)
        bm.setMatrixAt(i * 2 + h, m)
      }
    }
    rm.instanceMatrix.needsUpdate = true
    rm.instanceColor!.needsUpdate = true
    shm.instanceMatrix.needsUpdate = true
    shm.instanceColor!.needsUpdate = true
    bm.instanceMatrix.needsUpdate = true

    // draw heads: glowing beads at the filament front while the strands print
    const headA = 1 - clamp01((lineT - 0.93) / 0.07)
    for (let h = 0; h < 2; h++) {
      const y = -HALF_H + 2 * HALF_H * lineT
      strandPoint(y, h === 0 ? 0 : GROOVE, R + TUBE_R * 0.6, v)
      const j = N + h
      gpos[j * 3] = v.x
      gpos[j * 3 + 1] = v.y
      gpos[j * 3 + 2] = v.z
      gcol[j * 3] = tmp.headCol.r * 2.2
      gcol[j * 3 + 1] = tmp.headCol.g * 2.2
      gcol[j * 3 + 2] = tmp.headCol.b * 2.2
      gsize[j] = 30
      galpha[j] = p > 0.002 ? headA : 0
    }
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) built.glows.attributes[k].needsUpdate = true

    // filament + rim uniforms
    mats.filament.uniforms.uWaveY.value = wy
    mats.filament.uniforms.uWave.value = waveVis
    mats.filament.uniforms.uPulseY.value = restY
    mats.filament.uniforms.uPulse.value = rest
    mats.rim.uniforms.uPulseY.value = restY
    mats.rim.uniforms.uPulse.value = rest

    // repair wave
    if (waveRef.current) {
      waveRef.current.position.y = wy
      waveRef.current.visible = waveVis > 0.001
      const pulse = 0.85 + 0.15 * Math.sin(now * 6)
      mats.ring.opacity = waveVis * pulse
      mats.tick.opacity = waveVis * 0.9
      mats.disc.uniforms.uOpacity.value = waveVis * pulse
      mats.sheath.uniforms.uOpacity.value = s.started ? waveVis * clamp01((wy - WAVE_Y0) / 0.4) : 0
    }
    if (ticksRef.current) ticksRef.current.rotation.y -= dt * 0.35

    // motes
    mats.mote.uniforms.uTime.value = state.clock.elapsedTime
    mats.mote.uniforms.uOpacity.value = clamp01((p - 0.5) / 0.5)

    // sparks
    const P = built.pool
    const pos = built.sparks.attributes.position.array as Float32Array
    const size = built.sparks.attributes.aSize.array as Float32Array
    const alpha = built.sparks.attributes.aAlpha.array as Float32Array
    for (let i = 0; i < SPARKS; i++) {
      if (P.life[i] <= 0) {
        alpha[i] = 0
        continue
      }
      P.life[i] -= dt
      const k = Math.exp(-P.drag[i] * dt)
      P.vel[i * 3] *= k
      P.vel[i * 3 + 1] *= k
      P.vel[i * 3 + 2] *= k
      pos[i * 3] += P.vel[i * 3] * dt
      pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt
      const lf = clamp01(P.life[i] / P.max[i])
      alpha[i] = lf * (lf < 0.85 ? 1 : (1 - lf) / 0.15) // soft attack, linear decay
      size[i] = P.size0[i] * (0.55 + 0.45 * lf)
    }
    for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) built.sparks.attributes[k].needsUpdate = true
  })

  const visible = progress > 0.001
  const capS = (top: boolean) => Math.max(0.0001, easeOutBack((progress - (top ? frontP(1) - 0.02 : 0.0)) / 0.1))
  const ends = [...built.A.ends, ...built.B.ends]

  return (
    <group visible={visible}>
      <group ref={rise}>
        <group ref={spin} rotation-y={0.6}>
          {/* backbones: satin tube, fresnel rim, gold filament */}
          <mesh geometry={built.A.tube} material={mats.satin} />
          <mesh geometry={built.B.tube} material={mats.satin} />
          <primitive object={objs.rimA} />
          <primitive object={objs.rimB} />
          <primitive object={objs.filA} />
          <primitive object={objs.filB} />
          {/* end caps with gold terminal jewels */}
          {ends.map((e, i) => (
            <group key={i} position={e.p} scale={capS(e.top)}>
              <mesh geometry={built.capGeo} material={mats.satin} />
              <mesh geometry={built.jewelGeo} material={mats.jewel} position={e.t.clone().multiplyScalar(TUBE_R * 1.15)} />
            </group>
          ))}
          {/* base pairs */}
          <primitive object={objs.rungs} />
          <primitive object={objs.shards} />
          <primitive object={objs.beads} />
          <points geometry={built.glows} material={mats.glowPts} frustumCulled={false} />
          <points geometry={built.sparks} material={mats.spark} frustumCulled={false} />
        </group>
      </group>

      {/* repair wave (does not spin with the helix) */}
      <group ref={waveRef} visible={false}>
        <mesh geometry={built.ring} material={mats.ring} rotation-x={Math.PI / 2} />
        <mesh ref={ticksRef} geometry={built.ticks} material={mats.tick} />
        <mesh geometry={built.disc} material={mats.disc} rotation-x={-Math.PI / 2} />
        <mesh geometry={built.sheath} material={mats.sheath} />
      </group>

      <points geometry={built.motes} material={mats.mote} frustumCulled={false} />
    </group>
  )
}
