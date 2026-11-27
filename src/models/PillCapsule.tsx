/**
 * PillCapsule: a jewel-like two-part drug capsule for "The world is sticky" slide.
 *
 * Left half: smoky-ice fake glass (fresnel rim + a long studio streak) holding a settled bed of
 * ember granules. The granules are drawn as tiny shaded beads with MAX blending, so at slide size
 * they fuse into ONE dense ember mass (hot in the middle, deeper amber at the ends) while up close
 * they still read as granular. A soft warm glow sits under the bed and spills onto the lower glass.
 * Right half: a near-black satin cap that gets its gold only from a crisp fresnel rim, the glowing
 * seam at its lip and one thin gold band. Long axis runs along X so the pill can crawl along the
 * slide's approval track.
 *
 * Build-in: the glass body slides in with its ice mouth ring, the granules pour in through the
 * open mouth, the cap approaches and hangs just short while the seam charges, then seats with a
 * flash. Idle: a gentle precession, slow ember flicker in the bed and a breathing seam.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = { title: 'Pill capsule', distance: 5.2, elevation: 12, azimuth: 18 }

const L = 1.08 // half length along the axis
const R = 0.4 // body radius
const RC = R + 0.024 // cap radius (cap overlaps the body)
const SEAM = -0.02 // lip of the cap, along the axis
const BODY_OPEN = 0.24 // open end of the glass body (hidden under the cap once seated)
const GRANULES = 3400
const BAND_Y = SEAM + 0.24 // the one thin gold band on the cap

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const cubicOut = (x: number) => 1 - Math.pow(1 - x, 3)
const smooth01 = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c) }

/** Lathe profile of a capsule half: hemisphere tip at `tip`, straight wall to `open`. */
function halfProfile(radius: number, tip: number, open: number, dir: 1 | -1) {
  const pts: THREE.Vector2[] = []
  const n = 24
  const domeBase = tip - dir * radius
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2)
    pts.push(new THREE.Vector2(Math.sin(a) * radius, domeBase + dir * Math.cos(a) * radius))
  }
  pts.push(new THREE.Vector2(radius, open))
  if (pts[0].y > pts[pts.length - 1].y) pts.reverse()
  return pts
}

// lathe space: y is the capsule axis, +x is world DOWN once the group is turned
const shellVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vL;
  varying float vAxis;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vL = normal;
    vAxis = position.y;
    gl_Position = projectionMatrix * mv;
  }
`

const glassFragment = /* glsl */ `
  uniform vec3 uRim;
  uniform vec3 uWarm;
  uniform float uOpacity;
  uniform float uBed;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vL;
  varying float vAxis;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = abs(dot(n, v));
    float fres = pow(max(1.0 - ndv, 0.0), 3.4);
    // a long ice studio streak along the upper wall that fades where the glass tucks under the cap
    float strip = exp(-pow((n.y - 0.6) / 0.11, 2.0)) * smoothstep(0.15, 0.6, ndv)
      * (1.0 - smoothstep(-0.12, -0.03, vAxis));
    // warm light from the ember bed spilling onto the lower glass (lathe +x is down)
    float lower = smoothstep(-0.5, 0.6, normalize(vL).x);
    float along = 1.0 - smoothstep(-0.12, 0.02, vAxis);
    float spill = lower * along * uBed;
    vec3 rim = mix(uRim, uWarm * 1.1, spill);
    vec3 col = rim * (0.08 + 1.7 * fres) + vec3(0.72, 0.87, 1.0) * strip * 0.42 + uWarm * spill * 0.42;
    float a = (0.07 + 0.75 * fres + 0.4 * strip + 0.4 * spill) * uOpacity;
    gl_FragColor = vec4(col * uOpacity, a);
  }
`

/** Near-black satin cap: a soft cool streak on top and a crisp gold fresnel rim; nothing else. */
const capFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uCool;
  uniform vec3 uGold;
  uniform float uOpacity;
  uniform float uRim;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vL;
  varying float vAxis;
  void main() {
    if (!gl_FrontFacing) { gl_FragColor = vec4(uBase * 0.25, uOpacity); return; }
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = max(dot(n, v), 0.0);
    float dif = max(dot(n, normalize(vec3(-0.35, 0.75, 0.55))), 0.0);
    vec3 col = uBase * (0.35 + 0.65 * dif);
    // broad satin streak along the upper wall, soft and long (no pinpoint highlight)
    float streak = exp(-pow((n.y - 0.52) / 0.2, 2.0)) * smoothstep(0.05, 0.5, ndv);
    col += uCool * streak;
    // crisp jewel rim
    float f = pow(max(1.0 - ndv, 0.0), 8.5);
    col += uGold * f * uRim;
    gl_FragColor = vec4(col, uOpacity);
  }
`

/** A torus band that draws on around its circumference (uDraw 0..1). */
const bandVertex = /* glsl */ `
  varying float vAng;
  void main() {
    vAng = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const bandFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDraw;
  uniform float uOpacity;
  varying float vAng;
  void main() {
    float t = (vAng + 3.14159265) / 6.2831853;
    if (t > uDraw) discard;
    gl_FragColor = vec4(uColor * uOpacity, uOpacity);
  }
`

const granuleVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aDelay;
  attribute float aSeed;
  uniform float uPour;
  uniform float uTime;
  uniform float uPx;
  uniform float uGain;
  varying vec3 vColor;
  void main() {
    float k = clamp((uPour - aDelay * 0.55) / 0.45, 0.0, 1.0);
    k = 1.0 - pow(1.0 - k, 3.0);
    vec3 p = position;
    // poured in through the open mouth: slide along the axis from the mouth and fall into the bed
    // in flight the beads gather into one stream that enters high in the open mouth and fans
    // down into the bed
    float fl = 1.0 - k;
    p = mix(p, vec3(-0.12 + 0.1 * aSeed, ${(BODY_OPEN + 0.02).toFixed(2)}, (aSeed - 0.5) * 0.06), fl);
    p.x += fl * (1.0 - fl) * 0.3; // falls in a soft arc
    // a barely-there settle in idle
    p.x += sin(uTime * (0.3 + aSeed * 0.4) + aSeed * 30.0) * 0.003;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float worldScale = length(modelViewMatrix[0].xyz);
    gl_PointSize = aSize * worldScale * step(0.001, k) * uPx / -mv.z;
    // slow ember flicker, like coals breathing
    float flick = 0.82 + 0.18 * sin(uTime * (0.5 + aSeed * 1.1) + aSeed * 57.0);
    // in flight every bead burns bright so the pour reads as a stream of embers
    vColor = mix(aColor, vec3(1.6, 0.42, 0.05), (1.0 - k) * 0.85) * flick * uGain;
  }
`
const granuleFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) discard;
    vec3 n = vec3(c.x, -c.y, sqrt(1.0 - d2));
    float lit = 0.68 + 0.32 * max(dot(n, normalize(vec3(-0.3, 0.55, 0.78))), 0.0);
    float edge = 1.0 - smoothstep(0.55, 1.0, d2);
    gl_FragColor = vec4(vColor * lit * (0.5 + 0.5 * edge), 1.0);
  }
`

export default function PillCapsule({ progress = 1, accent }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Group>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const flash = useRef({ armed: true, t: 0 })

  const warm = accent ?? palette.ember

  const parts = useMemo(() => {
    const bodyGeo = new THREE.LatheGeometry(halfProfile(R, -L, BODY_OPEN, -1), 96)
    const capGeo = new THREE.LatheGeometry(halfProfile(RC, L, SEAM, 1), 96)

    const capUniforms = {
      uBase: { value: new THREE.Color('#141a2e') },
      uCool: { value: new THREE.Color('#9fc4e8').multiplyScalar(0.16) },
      uGold: { value: glow(warm, 1.25) },
      uOpacity: { value: 1 },
      uRim: { value: 1 },
    }
    const capMat = new THREE.ShaderMaterial({
      uniforms: capUniforms,
      vertexShader: shellVertex,
      fragmentShader: capFragment,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    // the back wall of the glass: a smoky dark tint so the granules sit in something
    const tintMat = new THREE.MeshBasicMaterial({
      color: '#060a16',
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide,
      depthWrite: false,
    })
    const glassUniforms = {
      uRim: { value: glow(palette.ice, 2.4) },
      uWarm: { value: glow(warm, 1.6) },
      uOpacity: { value: 1 },
      uBed: { value: 0 },
    }
    const glassMat = new THREE.ShaderMaterial({
      uniforms: glassUniforms,
      vertexShader: shellVertex,
      fragmentShader: glassFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })

    // the one thin gold band on the cap, and the glowing seam at its lip
    const bandGeo = new THREE.CylinderGeometry(RC + 0.003, RC + 0.003, 0.013, 160, 1, true)
    const bandMat = new THREE.MeshBasicMaterial({ color: glow(warm, 0.95), toneMapped: false, transparent: true })
    const seamGeo = new THREE.TorusGeometry(RC + 0.002, 0.0055, 8, 200)
    const seamUniforms = { uColor: { value: glow(warm, 4) }, uDraw: { value: 0 }, uOpacity: { value: 1 } }
    const seamMat = new THREE.ShaderMaterial({
      uniforms: seamUniforms,
      vertexShader: bandVertex,
      fragmentShader: bandFragment,
      transparent: true,
      toneMapped: false,
    })
    // ice mouth ring of the open glass body: shown while the halves are apart
    const mouthGeo = new THREE.TorusGeometry(R + 0.002, 0.0045, 8, 160)
    const mouthUniforms = { uColor: { value: glow(palette.ice, 2.2) }, uDraw: { value: 0 }, uOpacity: { value: 1 } }
    const mouthMat = new THREE.ShaderMaterial({
      uniforms: mouthUniforms,
      vertexShader: bandVertex,
      fragmentShader: bandFragment,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })

    // --- the granule bed (lathe space: y = axis, +x = down) ---
    const inner = R - 0.04
    const domeBase = -L + R
    const yMin = -L + 0.05
    const yMax = SEAM - 0.02
    // a mounded surface that slumps down toward the mouth (an angle of repose, not a cliff)
    const level = (y: number, z: number) =>
      -0.035 + 0.025 * Math.sin(y * 6.0 + 1.3) + 0.015 * Math.cos(z * 9.0 + y * 3.0) + 0.16 * smooth01((y - (SEAM - 0.3)) / 0.28)
    const pos = new Float32Array(GRANULES * 3)
    const col = new Float32Array(GRANULES * 3)
    const size = new Float32Array(GRANULES)
    const delay = new Float32Array(GRANULES)
    const seed = new Float32Array(GRANULES)
    const cDeep = new THREE.Color(1.0, 0.13, 0.012) // linear: a deep coal orange
    const cGold = new THREE.Color(1.0, 0.26, 0.028)
    const cHot = new THREE.Color(1.0, 0.38, 0.06)
    const c = new THREE.Color()
    let i = 0
    while (i < GRANULES) {
      const y = yMin + Math.random() * (yMax - yMin)
      const x = Math.random() * inner
      const z = (Math.random() * 2 - 1) * inner
      const rr = y < domeBase ? Math.hypot(x, z, y - domeBase) : Math.hypot(x, z)
      if (rr > inner || x < level(y, z)) continue
      pos.set([x, y, z], i * 3)
      // hot in the middle of the bed, deeper amber toward the ends and the floor
      const mid = Math.exp(-(((y + L * 0.5) / 0.45) ** 2))
      const top = 1 - clamp01((x - level(y, z)) / 0.3)
      const r = Math.random()
      // floor, ends and walls burn deep red-amber; the core runs hot gold
      const wall = clamp01((Math.hypot(x, z) - inner * 0.55) / (inner * 0.45))
      const core = mid * (1 - wall) * (0.6 + 0.4 * top)
      if (r < 0.03 && core > 0.5) c.copy(cHot).multiplyScalar(1.7)
      else c.copy(cDeep).lerp(cGold, clamp01(0.1 + 0.8 * core + 0.2 * Math.random())).multiplyScalar(0.85 + 0.2 * Math.random() + 0.75 * core)
      col.set([c.r, c.g, c.b], i * 3)
      size[i] = 0.022 + Math.random() * 0.014
      delay[i] = clamp01((y - yMin) / (yMax - yMin)) * 0.25 + (1 - clamp01((x + 0.05) / inner)) * 0.75
      seed[i] = Math.random()
      i++
    }
    // delay is smallest on the floor (large x), so the bed fills from the floor up
    const granuleGeo = new THREE.BufferGeometry()
    granuleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    granuleGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    granuleGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    granuleGeo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    granuleGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    granuleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -L * 0.5, 0), 1.2)
    const granuleUniforms = { uPour: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1000 }, uGain: { value: 1 } }
    // MAX blending: overlapping beads fuse into one mass instead of blowing out to white
    const granuleMat = new THREE.ShaderMaterial({
      uniforms: granuleUniforms,
      vertexShader: granuleVertex,
      fragmentShader: granuleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      toneMapped: false,
    })

    // soft warm glow under the bed, billboarded and stretched along the screen x
    const coreUniforms = { uColor: { value: glow(palette.emberDeep, 2.1) }, uOpacity: { value: 0 } }
    const coreMat = new THREE.ShaderMaterial({
      uniforms: coreUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = length(modelViewMatrix[0].xyz);
          mv.xy += position.xy * s;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main() {
          vec2 c = (vUv - 0.5) * 2.0;
          float a = exp(-dot(c, c) * 3.2) * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })

    return {
      bodyGeo, capGeo, capMat, capUniforms, tintMat, glassMat, glassUniforms,
      bandGeo, bandMat, seamGeo, seamMat, seamUniforms, mouthGeo, mouthMat, mouthUniforms,
      granuleGeo, granuleMat, granuleUniforms, coreMat, coreUniforms,
    }
  }, [warm])

  useFrame((state, dt) => {
    const p = progressRef.current
    const t = state.clock.elapsedTime
    if (!root.current || !body.current || !cap.current) return

    root.current.visible = p > 0.001

    // --- build-in: body arrives, cap approaches and hangs short, then seats with a flash ---
    const bIn = cubicOut(seg(p, 0.0, 0.5))
    const cIn = cubicOut(seg(p, 0.15, 0.6))
    const seat = cubicOut(seg(p, 0.74, 0.86))
    body.current.position.y = -(1 - bIn) * 1.2
    body.current.scale.setScalar(0.4 + 0.6 * bIn)
    cap.current.position.y = (1 - cIn) * 1.1 + (1 - seat) * 0.5
    cap.current.scale.setScalar(0.4 + 0.6 * cIn)
    const capFade = cubicOut(seg(p, 0.15, 0.4))
    parts.capUniforms.uOpacity.value = capFade
    parts.capUniforms.uRim.value = cubicOut(seg(p, 0.2, 0.5))
    parts.bandMat.opacity = capFade
        parts.tintMat.opacity = 0.7 * cubicOut(seg(p, 0.0, 0.3))
    parts.glassUniforms.uOpacity.value = cubicOut(seg(p, 0.0, 0.35))

    parts.mouthUniforms.uDraw.value = cubicOut(seg(p, 0.1, 0.36))
    parts.mouthUniforms.uOpacity.value = 1 - seg(p, 0.76, 0.85)
    parts.seamUniforms.uDraw.value = cubicOut(seg(p, 0.2, 0.55))

    if (p >= 0.86 && flash.current.armed && p < 0.999) {
      flash.current.armed = false
      flash.current.t = 1
    }
    if (p < 0.5) flash.current.armed = true
    flash.current.t = Math.max(0, flash.current.t - dt * 1.6)

    // --- idle life ---
    const settle = seg(p, 0.85, 1)
    root.current.rotation.z = 0.16 + Math.sin(t * 0.37) * 0.04 * settle
    root.current.rotation.y = Math.sin(t * 0.23) * 0.16 * settle
    root.current.rotation.x = Math.sin(t * 0.31 + 1) * 0.07 * settle
    root.current.position.y = Math.sin(t * 0.8) * 0.03 * settle

    const locked = seg(p, 0.84, 0.88)
    const breath = Math.sin((t * Math.PI * 2) / 4)
    parts.seamUniforms.uColor.value.copy(glow(warm, (1.0 + 1.6 * locked) * (1 + 0.15 * breath * locked) + 6 * flash.current.t))

    const pour = seg(p, 0.2, 0.78)
    const bed = cubicOut(seg(p, 0.25, 0.8))
    const ember = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 5.5)
    parts.granuleUniforms.uPour.value = pour
    parts.granuleUniforms.uTime.value = t
    parts.granuleUniforms.uGain.value = 0.95 + 0.08 * ember + 0.5 * flash.current.t
    const cam = state.camera as THREE.PerspectiveCamera
    parts.granuleUniforms.uPx.value = state.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 35) / 2))
    parts.glassUniforms.uBed.value = bed * (0.9 + 0.1 * ember)
    parts.coreUniforms.uOpacity.value = (0.85 + 0.08 * ember) * bed + 0.3 * flash.current.t
  })

  return (
    <group ref={root}>
      {/* lathe is built along Y; turn it so the long axis runs along X (glass left, cap right) */}
      <group rotation-z={-Math.PI / 2}>
        <group ref={body}>
          <mesh geometry={parts.bodyGeo} material={parts.tintMat} renderOrder={1} />
          <mesh position={[0.2, -L * 0.48, 0]} renderOrder={1} material={parts.coreMat}>
            <planeGeometry args={[1.7, 0.95]} />
          </mesh>
          <points geometry={parts.granuleGeo} material={parts.granuleMat} renderOrder={2} />
          <mesh geometry={parts.bodyGeo} material={parts.glassMat} renderOrder={3} />
          <mesh geometry={parts.mouthGeo} material={parts.mouthMat} rotation-x={Math.PI / 2} position-y={BODY_OPEN} renderOrder={3} />
        </group>
        <group ref={cap}>
          <mesh geometry={parts.capGeo} material={parts.capMat} renderOrder={2} />
          <mesh geometry={parts.bandGeo} material={parts.bandMat} position-y={BAND_Y} renderOrder={4} />
          <mesh geometry={parts.seamGeo} material={parts.seamMat} rotation-x={Math.PI / 2} position-y={SEAM + 0.004} renderOrder={4} />
        </group>
      </group>
    </group>
  )
}
