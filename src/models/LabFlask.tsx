/**
 * LabFlask: "Run experiments." An Erlenmeyer flask in fresnel glass on the family pedestal,
 * filled with glowing ice-cyan liquid. Bubbles rise and pop, ember sparks drift in the liquid,
 * and an ember droplet falls from a tilted pipette above, rippling the surface on impact.
 *
 * Build-in: pedestal rises, the empty glass rises into place, silhouette and rings draw on,
 * then the liquid fills from the base and the pipette lowers in. Idle: bubbles, swirl, a drop
 * every 3.2 s with a ripple and an ember splash.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  DECK_Y,
  EMBER,
  FAMILY_FRAME,
  GlowLines,
  ICE,
  Pedestal,
  T,
  circlePoints,
  interleave,
  makeBody,
  makeGlass,
  outCubic,
  outExpo,
  polyToSegments,
  seg,
  useSprites,
  type GlowLinesHandle,
} from './job-engine-parts/shared'

export const meta: ModelMeta = { title: 'Lab flask (run experiments)', azimuth: 18, ...FAMILY_FRAME }

// Flask outer profile (radius, y). Base sits on the pedestal deck. The whole flask group is
// scaled by S around the deck so the pedestal ticks stay visible all round.
const S = 0.9
const B = DECK_Y
const CONE_R0 = 0.7 // radius at the foot of the cone
const CONE_Y0 = B + 0.09
const CONE_R1 = 0.19 // radius at the shoulder
const CONE_Y1 = B + 0.98
const NECK_R = 0.155
const NECK_TOP = B + 1.36
const LEVEL = B + 0.62 // liquid surface
const INSET = 0.035
const PIP_TIP = NECK_TOP + 0.16
const PIP_TILT = -0.3

function coneR(y: number) {
  const t = (y - CONE_Y0) / (CONE_Y1 - CONE_Y0)
  return CONE_R0 + (CONE_R1 - CONE_R0) * t
}

const profilePts: [number, number][] = [
  [0.0, B + 0.004],
  [0.56, B + 0.004],
  [0.605, B + 0.008],
  [0.64, B + 0.018],
  [0.664, B + 0.033],
  [0.682, B + 0.052],
  [0.694, B + 0.072],
  [CONE_R0, CONE_Y0],
  [coneR(B + 0.5), B + 0.5],
  [CONE_R1, CONE_Y1],
  [0.168, CONE_Y1 + 0.06],
  [NECK_R, CONE_Y1 + 0.13],
  [NECK_R, NECK_TOP - 0.04],
  [0.19, NECK_TOP - 0.02],
  [0.2, NECK_TOP],
  [0.185, NECK_TOP + 0.012],
  [0.14, NECK_TOP + 0.004],
]

const liquidVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vP = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const liquidFrag = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uBright;
  uniform float uTime;
  uniform float uBottom;
  uniform float uLevel;
  uniform float uFill;
  uniform float uOn;
  uniform float uPulse;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    if (vP.y > uFill) discard;
    float h = clamp((vP.y - uBottom) / (uLevel - uBottom), 0.0, 1.0);
    float top = clamp((vP.y - uBottom) / max(uFill - uBottom, 0.001), 0.0, 1.0);
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
    float ang = atan(vP.z, vP.x);
    float swirl = 0.5 + 0.5 * sin(vP.y * 16.0 - uTime * 1.7 + sin(ang * 3.0 + uTime * 0.6) * 1.3);
    float caust = 0.5 + 0.5 * sin(ang * 7.0 + vP.y * 9.0 + uTime * 0.9);
    // dark, saturated volume: glow sits at the base and just under the surface
    float g = 0.04 + 0.12 * h + 0.14 * pow(1.0 - h, 6.0) + 0.85 * pow(top, 8.0);
    vec3 col = mix(uDeep, uBright, g);
    col *= 0.8 + 0.2 * swirl + 0.1 * caust;
    col += uBright * f * 0.25;
    col *= 1.0 + uPulse * 0.3;
    gl_FragColor = vec4(col * uOn, 0.985 * uOn);
  }
`
const surfFrag = /* glsl */ `
  uniform vec3 uBright;
  uniform vec3 uEmber;
  uniform float uTime;
  uniform float uOn;
  uniform float uRipple; // seconds since the drop landed
  uniform float uRadius;
  varying vec3 vP;
  void main() {
    float r = length(vP.xz) / uRadius;
    float wave = 0.0;
    float hot = 0.0;
    if (uRipple < 2.0) {
      float front = uRipple * 0.75;
      wave = 0.5 * exp(-pow((r - front) / 0.06, 2.0)) * exp(-uRipple * 1.2);
      hot = exp(-r * r / 0.02) * exp(-uRipple * 5.0);
    }
    float rim = smoothstep(0.75, 1.0, r);
    vec3 col = uBright * (0.45 + 0.3 * rim) + uBright * wave * 0.35 + uEmber * (wave * 0.55 + hot * 0.7);
    col *= 0.94 + 0.06 * sin(r * 30.0 - uTime * 2.0);
    gl_FragColor = vec4(col * uOn, uOn);
  }
`
const surfVert = /* glsl */ `
  varying vec3 vP;
  void main() {
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const N_BUB = 42
const N_SPLASH = 18
const DROP_PERIOD = 3.2

export default function LabFlask({ progress = 1, accent }: ModelProps) {
  const liquidColor = accent ?? ICE

  const outer = useMemo(() => new THREE.LatheGeometry(profilePts.map(([r, y]) => new THREE.Vector2(r, y)), 128), [])
  const glassFront = useMemo(() => makeGlass({ boost: 1.25, power: 3.4, base: 0.02, streak: 0.4 }), [])
  const glassBack = useMemo(
    () => makeGlass({ boost: 0.7, power: 2.6, base: 0.012, streak: 0.0, side: THREE.BackSide }),
    [],
  )

  // Liquid: inner lathe up to the surface level, clipped by uFill during the build.
  const liquid = useMemo(() => {
    const pts = [
      [0.0, B + 0.03],
      [0.55, B + 0.03],
      [0.64, B + 0.055],
      [CONE_R0 - INSET, CONE_Y0 + 0.01],
      [coneR(LEVEL) - INSET, LEVEL],
      [0.0, LEVEL],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(pts, 96)
  }, [])
  const surfR = coneR(LEVEL) - INSET
  const surface = useMemo(() => {
    const g = new THREE.CircleGeometry(surfR, 64)
    g.rotateX(-Math.PI / 2)
    return g
  }, [surfR])
  const liquidMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uDeep: { value: new THREE.Color(liquidColor).lerp(new THREE.Color(palette.iceDeep), 0.35).multiplyScalar(0.3) },
          uBright: { value: glow(liquidColor, 0.85) },
          uTime: { value: 0 },
          uBottom: { value: B },
          uLevel: { value: LEVEL },
          uFill: { value: LEVEL },
          uOn: { value: 0 },
          uPulse: { value: 0 },
        },
        vertexShader: liquidVert,
        fragmentShader: liquidFrag,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const surfMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBright: { value: glow(liquidColor, 0.95) },
          uEmber: { value: glow(EMBER, 1.2) },
          uTime: { value: 0 },
          uOn: { value: 0 },
          uRipple: { value: 9 },
          uRadius: { value: surfR },
        },
        vertexShader: surfVert,
        fragmentShader: surfFrag,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Linework: glass rings, camera-facing silhouette, meniscus, a short ember scale.
  const rings = useMemo(
    () =>
      interleave([
        polyToSegments(circlePoints(0.668, B + 0.035, 112, Math.PI * 0.5, Math.PI * 2.5)),
        polyToSegments(circlePoints(NECK_R + 0.004, CONE_Y1 + 0.13, 48, Math.PI * 0.5, Math.PI * 2.5)),
      ]),
    [],
  )
  // Ember lip ring: the warm "human hand" accent on the cool glass.
  const lip = useMemo(() => polyToSegments(circlePoints(0.203, NECK_TOP - 0.004, 48, Math.PI * 0.5, Math.PI * 2.5)), [])
  const silhouette = useMemo(() => {
    const pts = profilePts.filter(([r, y]) => y >= B + 0.03 && y <= NECK_TOP && r > 0.15)
    const side = (sx: number) => polyToSegments(pts.map(([r, y]) => new THREE.Vector3(sx * (r + 0.004), y, 0)))
    return interleave([side(1), side(-1)])
  }, [])
  const meniscus = useMemo(() => polyToSegments(circlePoints(surfR + 0.004, 0.002, 96)), [surfR])
  const ripple = useMemo(() => polyToSegments(circlePoints(1, 0.004, 64)), [])
  const rippleH = useRef<GlowLinesHandle | null>(null)
  const rippleG = useRef<THREE.Group>(null)
  const menG = useRef<THREE.Group>(null)
  const ticks = useMemo(() => {
    const s: number[] = []
    const a0 = Math.PI * 0.5 + 0.15 // front, just left of centre as seen from the hero camera
    const ys = [LEVEL + 0.09, LEVEL + 0.17, LEVEL + 0.25]
    ys.forEach((y, i) => {
      const r = coneR(y) + 0.006
      const span = i === 1 ? 0.22 : 0.36
      s.push(...polyToSegments(circlePoints(r, y, 8, a0 - span, a0)))
    })
    return s
  }, [])

  // Pipette (built around its tip at the origin, then tilted).
  const pip = useMemo(() => {
    const tube = new THREE.LatheGeometry(
      [
        [0.0, 0],
        [0.013, 0],
        [0.03, 0.12],
        [0.042, 0.22],
        [0.042, 0.4],
        [0.0, 0.4],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      32,
    )
    const bulb = new THREE.LatheGeometry(
      [
        [0.0, 0.35],
        [0.058, 0.35],
        [0.06, 0.4],
        [0.09, 0.45],
        [0.097, 0.52],
        [0.074, 0.585],
        [0.0, 0.605],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    )
    const core = new THREE.CylinderGeometry(0.026, 0.02, 0.15, 12)
    core.translate(0, 0.3, 0)
    const outline = interleave([
      polyToSegments([new THREE.Vector3(0.014, 0, 0), new THREE.Vector3(0.031, 0.12, 0), new THREE.Vector3(0.043, 0.22, 0), new THREE.Vector3(0.043, 0.36, 0)]),
      polyToSegments([new THREE.Vector3(-0.014, 0, 0), new THREE.Vector3(-0.031, 0.12, 0), new THREE.Vector3(-0.043, 0.22, 0), new THREE.Vector3(-0.043, 0.36, 0)]),
      polyToSegments([new THREE.Vector3(0, 0, 0.014), new THREE.Vector3(0, 0.12, 0.031), new THREE.Vector3(0, 0.22, 0.043), new THREE.Vector3(0, 0.36, 0.043)]),
      polyToSegments([new THREE.Vector3(0, 0, -0.014), new THREE.Vector3(0, 0.12, -0.031), new THREE.Vector3(0, 0.22, -0.043), new THREE.Vector3(0, 0.36, -0.043)]),
    ])
    const collar = polyToSegments(circlePoints(0.064, 0.37, 32, Math.PI * 0.5, Math.PI * 2.5))
    return { tube, bulb, core, outline, collar }
  }, [])
  const bulbMat = useMemo(() => makeBody('#171c30', 0.55, 0.38), [])
  const bulbRim = useMemo(() => makeGlass({ boost: 2.0, power: 2.0, base: 0.0, streak: 0.5 }), [])
  const pipGlass = useMemo(() => makeGlass({ boost: 1.2, power: 2.0, base: 0.04, streak: 0.4 }), [])
  const emberMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: glow(EMBER, 1.1), transparent: true })
    m.toneMapped = false
    return m
  }, [])
  const dropMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: glow(EMBER, 1.5), transparent: true })
    m.toneMapped = false
    return m
  }, [])
  const dropGeo = useMemo(() => new THREE.SphereGeometry(0.048, 16, 12), [])

  // Particles: bubbles (ice-white, with some ember sparks) and the splash crown.
  const bub = useSprites(N_BUB, glow('#d8f6ff', 1.1), glow(EMBER, 2.6))
  const bubSeed = useMemo(
    () =>
      Array.from({ length: N_BUB }, (_, i) => ({
        a: Math.random() * Math.PI * 2,
        rf: Math.sqrt(Math.random()) * 0.82,
        speed: 0.16 + Math.random() * 0.22,
        phase: Math.random(),
        size: 0.032 + Math.random() * 0.04,
        ember: i % 6 === 0 ? 1 : 0,
        wob: Math.random() * 6,
      })),
    [],
  )
  const splash = useSprites(N_SPLASH, glow(EMBER, 3.2), glow('#fff1d6', 2.6))
  const splashSeed = useMemo(
    () =>
      Array.from({ length: N_SPLASH }, () => ({
        a: Math.random() * Math.PI * 2,
        v: 0.5 + Math.random() * 0.45,
        out: 0.2 + Math.random() * 0.25,
        size: 0.024 + Math.random() * 0.022,
      })),
    [],
  )

  const t = useRef(2.93)
  const drop = useRef<THREE.Mesh>(null)
  const surfMesh = useRef<THREE.Mesh>(null)
  const pipette = useRef<THREE.Group>(null)
  const sil = useRef<THREE.Group>(null)

  // Build timeline
  const pBody = outExpo(seg(progress, T.body[0], T.body[1]))
  const pLines = seg(progress, T.lines[0], T.lines[1] - 0.1)
  const pFill = outCubic(seg(progress, 0.5, 0.92))
  const pLife = seg(progress, T.life[0], T.life[1])
  const pPip = outExpo(seg(progress, 0.55, 0.92))
  glassFront.uniforms.uOpacity.value = pBody
  glassBack.uniforms.uOpacity.value = pBody
  pipGlass.uniforms.uOpacity.value = pPip
  bulbRim.uniforms.uOpacity.value = pPip
  bulbMat.opacity = pPip
  emberMat.opacity = pPip
  const fillY = B + 0.03 + (LEVEL - B - 0.03) * pFill

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    t.current += dt
    const time = t.current
    liquidMat.uniforms.uTime.value = time
    surfMat.uniforms.uTime.value = time

    // Silhouette lines face the camera (rotate about the flask axis).
    if (sil.current) {
      const c = state.camera.position
      sil.current.rotation.y = Math.atan2(c.x, c.z)
    }

    // Fill from the base: clip the volume and carry the surface disc up the cone.
    const on = Math.min(1, pFill * 3)
    liquidMat.uniforms.uFill.value = fillY
    liquidMat.uniforms.uOn.value = on
    surfMat.uniforms.uOn.value = on
    if (surfMesh.current) {
      surfMesh.current.position.y = fillY + 0.001
      const k = (coneR(fillY) - INSET) / surfR
      surfMesh.current.scale.set(k, 1, k)
      surfMesh.current.visible = pFill > 0.001
      if (menG.current) {
        menG.current.position.y = fillY
        menG.current.scale.set(k, 1, k)
      }
    }

    // Drop cycle: form at the tip (0..0.5), fall, land at LEVEL.
    const cyc = (time % DROP_PERIOD) / DROP_PERIOD
    const dropOn = seg(progress, 0.6, 0.78)
    const fallStart = 0.6
    const g = 2.6
    const fallDist = PIP_TIP - 0.048 - LEVEL
    const fallT = Math.sqrt((2 * fallDist) / g) / DROP_PERIOD
    let landedAge = 9
    if (drop.current) {
      if (cyc < fallStart) {
        const k = cyc / fallStart
        const s = 0.3 + 0.7 * outCubic(k)
        drop.current.scale.set(s, s * (1 + 0.25 * k), s)
        drop.current.position.set(0, PIP_TIP - 0.048 * s, 0)
        drop.current.visible = dropOn > 0.01
      } else if (cyc < fallStart + fallT) {
        const tt = (cyc - fallStart) * DROP_PERIOD
        drop.current.scale.set(0.85, 1.3, 0.85)
        drop.current.position.set(0, PIP_TIP - 0.048 - 0.5 * g * tt * tt, 0)
        drop.current.visible = dropOn > 0.01
      } else {
        drop.current.visible = false
      }
    }
    // Age of the most recent landing (it can belong to the previous cycle).
    landedAge = cyc >= fallStart + fallT ? (cyc - fallStart - fallT) * DROP_PERIOD : (cyc + 1 - fallStart - fallT) * DROP_PERIOD
    if (time < DROP_PERIOD * (fallStart + fallT)) landedAge = 9
    dropMat.opacity = dropOn
    surfMat.uniforms.uRipple.value = landedAge
    if (rippleG.current && rippleH.current) {
      const rr = Math.max(0.02, surfR * Math.min(1, landedAge * 0.75))
      rippleG.current.scale.set(rr, 1, rr)
      rippleH.current.mat.opacity = landedAge < 2.2 ? (1 - landedAge / 2.2) * dropOn : 0
    }
    liquidMat.uniforms.uPulse.value = Math.exp(-landedAge * 2.5) * dropOn

    // Bubbles (only inside the current fill)
    for (let i = 0; i < N_BUB; i++) {
      const s = bubSeed[i]
      const u = (time * s.speed + s.phase) % 1
      const y = B + 0.07 + u * (LEVEL - B - 0.07)
      const rmax = coneR(y) - 0.08
      const a = s.a + Math.sin(time * 0.7 + s.wob) * 0.3
      const r = rmax * s.rf
      bub.pos[i * 3] = Math.cos(a) * r + Math.sin(time * 3 + s.wob) * 0.012
      bub.pos[i * 3 + 1] = y
      bub.pos[i * 3 + 2] = Math.sin(a) * r
      const pop = u > 0.92 ? (u - 0.92) / 0.08 : 0
      const grow = s.ember ? 0.9 + 0.4 * u : 0.6 + 0.6 * u
      bub.size[i] = s.size * grow * (1 + pop * 1.4)
      const inside = y < fillY - 0.02 ? 1 : 0
      bub.alpha[i] = inside * Math.max(pLife, pFill * 0.6) * Math.min(1, u * 6) * (1 - pop) * (u > 0.85 && !s.ember ? 0.45 : 1) * (s.ember ? 0.95 : 0.7)
      bub.hue[i] = s.ember
    }
    bub.flush()

    // Splash crown when the drop lands
    for (let i = 0; i < N_SPLASH; i++) {
      const s = splashSeed[i]
      const age = landedAge
      const live = age < 1.1 ? 1 : 0
      const r = s.out * Math.min(1, age * 2.2) * surfR * 1.4
      const y = LEVEL + s.v * age - 0.5 * 1.6 * age * age
      splash.pos[i * 3] = Math.cos(s.a) * r
      splash.pos[i * 3 + 1] = Math.max(LEVEL, y)
      splash.pos[i * 3 + 2] = Math.sin(s.a) * r
      splash.size[i] = s.size * (1 - age / 1.1)
      splash.alpha[i] = live * pLife * (1 - age / 1.1)
      splash.hue[i] = i % 3 === 0 ? 1 : 0
    }
    splash.flush()

    // Idle: the pipette hovers gently.
    if (pipette.current) {
      pipette.current.position.y = PIP_TIP + (1 - pPip) * 0.45 + Math.sin(time * 1.1) * 0.006
    }
  })

  return (
    <group visible={progress > 0.001}>
      <Pedestal progress={progress} />

      <group position-y={B * (1 - S)} scale={S}>
        <group position-y={(1 - pBody) * -0.3}>
          <mesh geometry={liquid} material={liquidMat} renderOrder={1} />
          <mesh ref={surfMesh} geometry={surface} material={surfMat} renderOrder={1} />
          <primitive object={bub.points} />
          <primitive object={splash.points} />
          <mesh geometry={outer} material={glassBack} renderOrder={3} />
          <mesh geometry={outer} material={glassFront} renderOrder={3} />
          <GlowLines segments={rings} color={ICE} boost={1.5} draw={pLines} opacity={0.7} />
          <GlowLines segments={lip} color={EMBER} boost={2.4} draw={seg(progress, 0.45, 0.75)} />
          <group ref={sil}>
            <GlowLines segments={silhouette} color={ICE} boost={2.2} width={1.5} opacity={0.85} draw={pLines} />
          </group>
          <group ref={menG}>
            <GlowLines segments={meniscus} color={liquidColor} boost={1.8} width={1.4} opacity={0.8 * seg(pFill, 0.15, 0.35)} />
          </group>
          <group ref={rippleG} position-y={LEVEL}>
            <GlowLines segments={ripple} color={EMBER} boost={3.2} width={1.6} handle={rippleH} />
          </group>
          <GlowLines segments={ticks} color={ICE} boost={2.2} width={1.4} opacity={0.6} draw={seg(progress, 0.5, 0.85)} />
        </group>

        <group ref={pipette} position-y={PIP_TIP}>
          <group rotation-z={PIP_TILT}>
            <mesh geometry={pip.bulb} material={bulbMat} renderOrder={0} />
            <mesh geometry={pip.bulb} material={bulbRim} renderOrder={3} />
            <GlowLines segments={pip.collar} color={EMBER} boost={3.2} draw={seg(progress, 0.62, 0.92)} />
            <mesh geometry={pip.core} material={emberMat} renderOrder={1} />
            <mesh geometry={pip.tube} material={pipGlass} renderOrder={3} />
            <GlowLines segments={pip.outline} color={ICE} boost={2.2} width={1.3} opacity={0.8} draw={seg(progress, 0.62, 0.92)} />
          </group>
        </group>
        <mesh ref={drop} geometry={dropGeo} material={dropMat} renderOrder={2} />
      </group>
    </group>
  )
}
