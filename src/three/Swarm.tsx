/**
 * The swarm: one persistent cloud of SWARM_COUNT particles that is the connective tissue
 * of the whole deck. On every slide change it flies from the previous station to the next
 * and re-forms into that slide's formation, arriving in an art-directed order.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { SWARM_COUNT, getFormation, type Formation, type FormationKey } from './formations'
import { deck } from '../deck/store'
import { flightSeconds, slides, stationOf } from '../deck/slides'

const vertex = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec3 cFrom;
  attribute vec3 cTo;
  attribute vec4 fFrom;
  attribute vec4 fTo;
  attribute float aDelay;
  attribute float aRand;

  uniform float uMix;
  uniform float uStagger;
  uniform float uTime;
  uniform float uScatter;
  uniform mat3 uRotFrom;
  uniform mat3 uRotTo;
  uniform vec3 uCenterFrom;
  uniform vec3 uCenterTo;
  uniform float uSizeFrom;
  uniform float uSizeTo;
  uniform float uScale;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 flowOffset(vec4 f, float seed) {
    float sp = abs(f.w);
    if (sp == 0.0) return vec3(0.0);
    float ph = fract(uTime * sp + seed);
    return f.xyz * (ph - 0.5);
  }
  float flowAlpha(vec4 f, float seed) {
    if (f.w <= 0.0) return 1.0;
    float ph = fract(uTime * f.w + seed);
    return smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.75, 1.0, ph));
  }

  void main() {
    float d = aDelay * uStagger;
    float t = clamp((uMix - d) / (1.0 - uStagger), 0.0, 1.0);
    float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;

    vec3 pf = uCenterFrom + uRotFrom * (aFrom + flowOffset(fFrom, aRand));
    vec3 pt = uCenterTo + uRotTo * (aTo + flowOffset(fTo, fract(aRand * 1.37)));
    vec3 p = mix(pf, pt, e);

    float fly = sin(3.14159265 * e);
    float dist = length(pt - pf);
    vec3 n = vec3(
      sin(p.y * 0.21 + uTime * 0.9 + aRand * 6.28),
      sin(p.z * 0.17 + uTime * 0.7 + aRand * 3.10),
      sin(p.x * 0.19 + uTime * 0.6 + aRand * 9.00)
    );
    p += n * fly * uScatter * min(dist * 0.025, 1.4) * (0.4 + aRand);

    vColor = mix(cFrom, cTo, e) * (1.0 + fly * 0.6);
    float af = mix(flowAlpha(fFrom, aRand), flowAlpha(fTo, fract(aRand * 1.37)), e);
    vAlpha = af * (0.78 + 0.22 * sin(uTime * (0.8 + aRand * 2.2) + aRand * 50.0));

    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = mix(uSizeFrom, uSizeTo, e) * (0.5 + aRand * 1.0) * (1.0 + fly * 0.5);
    gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 48.0);
  }
`

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    float a = exp(-d2 * 3.2) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function rotation(f: Formation, time: number, out: THREE.Matrix3) {
  const m = new THREE.Matrix4().makeRotationX(f.tilt ?? 0)
  m.multiply(new THREE.Matrix4().makeRotationY((f.yaw ?? 0) + (f.spin ?? 0) * time))
  return out.setFromMatrix4(m)
}

export const TRANSITION_SECONDS = 2.6

export function Swarm() {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)

  const { geometry, uniforms } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = SWARM_COUNT
    const mk = (k: number) => new THREE.BufferAttribute(new Float32Array(n * k), k)
    g.setAttribute('position', mk(3))
    g.setAttribute('aFrom', mk(3))
    g.setAttribute('aTo', mk(3))
    g.setAttribute('cFrom', mk(3))
    g.setAttribute('cTo', mk(3))
    g.setAttribute('fFrom', mk(4))
    g.setAttribute('fTo', mk(4))
    g.setAttribute('aDelay', mk(1))
    const rand = mk(1)
    for (let i = 0; i < n; i++) rand.array[i] = Math.random()
    g.setAttribute('aRand', rand)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    return {
      geometry: g,
      uniforms: {
        uMix: { value: 1 },
        uStagger: { value: 0.5 },
        uTime: { value: 0 },
        uScatter: { value: 1 },
        uRotFrom: { value: new THREE.Matrix3() },
        uRotTo: { value: new THREE.Matrix3() },
        uCenterFrom: { value: new THREE.Vector3() },
        uCenterTo: { value: new THREE.Vector3() },
        uSizeFrom: { value: 0.04 },
        uSizeTo: { value: 0.04 },
        uScale: { value: 1 },
      },
    }
  }, [])

  const st = useRef({
    index: -1,
    started: 0,
    duration: TRANSITION_SECONDS,
    from: null as Formation | null,
    to: null as Formation | null,
    fromKey: '' as string,
    toKey: '' as string,
    fromCenter: new THREE.Vector3(),
    toCenter: new THREE.Vector3(),
    sameFamily: false,
    fromSpinStart: 0,
  })

  const attr = (name: string) => geometry.getAttribute(name) as THREE.BufferAttribute

  function snapshotFrom(now: number) {
    // Freeze the current visual state into the "from" buffers (handles interrupted transitions).
    const s = st.current
    const aFrom = attr('aFrom').array as Float32Array
    const aTo = attr('aTo').array as Float32Array
    const cFrom = attr('cFrom').array as Float32Array
    const cTo = attr('cTo').array as Float32Array
    const fFrom = attr('fFrom').array as Float32Array
    const fTo = attr('fTo').array as Float32Array
    const delay = attr('aDelay').array as Float32Array
    const mix = uniforms.uMix.value
    if (mix >= 1 || !s.to) {
      aFrom.set(aTo)
      cFrom.set(cTo)
      fFrom.set(fTo)
      uniforms.uRotFrom.value.copy(uniforms.uRotTo.value)
      uniforms.uCenterFrom.value.copy(uniforms.uCenterTo.value)
      uniforms.uSizeFrom.value = uniforms.uSizeTo.value
      return
    }
    const stagger = uniforms.uStagger.value
    const rf = uniforms.uRotFrom.value.elements
    const rt = uniforms.uRotTo.value.elements
    const cf = uniforms.uCenterFrom.value
    const ct = uniforms.uCenterTo.value
    for (let i = 0; i < SWARM_COUNT; i++) {
      const t = Math.min(1, Math.max(0, (mix - delay[i] * stagger) / (1 - stagger)))
      const e = easeInOut(t)
      const i3 = i * 3
      const fx = aFrom[i3], fy = aFrom[i3 + 1], fz = aFrom[i3 + 2]
      const tx = aTo[i3], ty = aTo[i3 + 1], tz = aTo[i3 + 2]
      const pfx = cf.x + rf[0] * fx + rf[3] * fy + rf[6] * fz
      const pfy = cf.y + rf[1] * fx + rf[4] * fy + rf[7] * fz
      const pfz = cf.z + rf[2] * fx + rf[5] * fy + rf[8] * fz
      const ptx = ct.x + rt[0] * tx + rt[3] * ty + rt[6] * tz
      const pty = ct.y + rt[1] * tx + rt[4] * ty + rt[7] * tz
      const ptz = ct.z + rt[2] * tx + rt[5] * ty + rt[8] * tz
      aFrom[i3] = pfx + (ptx - pfx) * e
      aFrom[i3 + 1] = pfy + (pty - pfy) * e
      aFrom[i3 + 2] = pfz + (ptz - pfz) * e
      cFrom[i3] += (cTo[i3] - cFrom[i3]) * e
      cFrom[i3 + 1] += (cTo[i3 + 1] - cFrom[i3 + 1]) * e
      cFrom[i3 + 2] += (cTo[i3 + 2] - cFrom[i3 + 2]) * e
      fFrom[i * 4 + 3] = 0
    }
    uniforms.uRotFrom.value.identity()
    uniforms.uCenterFrom.value.set(0, 0, 0)
    uniforms.uSizeFrom.value = uniforms.uSizeTo.value
    s.sameFamily = false
    void now
  }

  function retarget(index: number, instant: boolean, now: number) {
    const s = st.current
    const key = slides[index].formation as FormationKey
    const f = getFormation(key)
    const center = new THREE.Vector3(...stationOf(index))
    const prevFamily = s.to?.family
    const same = !!prevFamily && prevFamily === f.family && uniforms.uMix.value >= 1
    if (!instant) snapshotFrom(now)
    const aTo = attr('aTo')
    const cTo = attr('cTo')
    const fTo = attr('fTo')
    ;(aTo.array as Float32Array).set(f.pos)
    ;(cTo.array as Float32Array).set(f.col)
    ;(fTo.array as Float32Array).set(f.flow)
    ;(attr('aDelay').array as Float32Array).set(f.order)
    if (instant) {
      ;(attr('aFrom').array as Float32Array).set(f.pos)
      ;(attr('cFrom').array as Float32Array).set(f.col)
      ;(attr('fFrom').array as Float32Array).set(f.flow)
      uniforms.uCenterFrom.value.copy(center)
      rotation(f, 0, uniforms.uRotFrom.value)
      uniforms.uSizeFrom.value = f.size
    }
    for (const n of ['aFrom', 'aTo', 'cFrom', 'cTo', 'fFrom', 'fTo', 'aDelay']) attr(n).needsUpdate = true
    s.fromCenter.copy(uniforms.uCenterFrom.value)
    s.toCenter.copy(center)
    s.duration = instant ? TRANSITION_SECONDS : flightSeconds(s.index, index) * 1.12
    s.from = s.to
    s.to = f
    s.index = index
    s.started = now
    s.sameFamily = same && !instant
    s.fromSpinStart = now
    uniforms.uSizeTo.value = f.size
    uniforms.uCenterTo.value.copy(center)
    uniforms.uMix.value = instant ? 1 : 0
    uniforms.uStagger.value = same ? 0.15 : 0.5
    uniforms.uScatter.value = same ? 0 : 1
    // Precompute neighbours while idle so the next transition doesn't hitch.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200))
    for (const j of [index + 1, index - 1, index + 2]) {
      if (j >= 0 && j < slides.length) idle(() => getFormation(slides[j].formation as FormationKey))
    }
  }

  useEffect(() => {
    ;(window as unknown as { __auditSwarm: unknown }).__auditSwarm = () => {
      const out: Record<string, number> = {}
      for (const n of ['aFrom', 'aTo', 'cFrom', 'cTo', 'fFrom', 'fTo', 'aDelay']) {
        const a = attr(n).array as Float32Array
        let bad = 0
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++
        out[n] = bad
      }
      return out
    }
    const d = deck.get()
    retarget(d.index, true, performance.now() / 1000)
  }, [])

  const rotTmp = useMemo(() => new THREE.Matrix3(), [])
  const qa = useMemo(() => new THREE.Quaternion(), [])
  const qb = useMemo(() => new THREE.Quaternion(), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])

  useFrame((_, dt) => {
    const now = performance.now() / 1000
    const d = deck.get()
    const s = st.current
    if (d.index !== s.index) retarget(d.index, d.instant, now)
    uniforms.uTime.value += Math.min(dt, 0.1)
    const time = uniforms.uTime.value
    const raw = Math.min(1, (now - s.started) / s.duration)
    uniforms.uMix.value = raw

    if (s.to) {
      if (s.sameFamily && s.from) {
        // Same shape, new orientation: rotate rigidly (slerp) instead of morphing through the interior.
        const k = easeInOut(raw)
        rotation(s.from, time, rotTmp)
        qa.setFromRotationMatrix(m4.setFromMatrix3(rotTmp))
        rotation(s.to, time, rotTmp)
        qb.setFromRotationMatrix(m4.setFromMatrix3(rotTmp))
        qa.slerp(qb, k)
        uniforms.uRotTo.value.setFromMatrix4(m4.makeRotationFromQuaternion(qa))
        uniforms.uRotFrom.value.copy(uniforms.uRotTo.value)
        uniforms.uCenterTo.value.lerpVectors(s.fromCenter, s.toCenter, k)
        uniforms.uCenterFrom.value.copy(uniforms.uCenterTo.value)
      } else {
        rotation(s.to, time, uniforms.uRotTo.value)
      }
    }
    const fov = (camera.fov * Math.PI) / 180
    uniforms.uScale.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(fov / 2))
  })

  // Built imperatively: R3F copies a `uniforms` prop into new objects, so per-frame writes to our
  // uniforms would never reach the GPU.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  )
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
}
