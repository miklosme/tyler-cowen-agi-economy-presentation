/**
 * PowerCompute: "Build energy and compute." A small tilted solar array (three panels with
 * ember cell-grid linework) under a ringed sun, feeding a compute chip (heat-spreader, pins,
 * glowing ice die) through a cable. Ember energy beads travel along the cable; each arrival
 * flares the die.
 *
 * Build-in: pedestal, panels rise and tilt into place (staggered) while their frames draw on,
 * the chip rises, the cable draws from array to chip, the sun ignites, then pulses start.
 * Idle: photons fall from the sun onto the panels, beads run down the cable, the die flickers
 * with compute and flares on each arrival, the sun's orbital rings turn.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow } from '../theme'
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
  makeBody,
  makeGlass,
  outCubic,
  outExpo,
  polyToSegments,
  seg,
  useSprites,
  type GlowLinesHandle,
} from './job-engine-parts/shared'

export const meta: ModelMeta = { title: 'Power & compute (build energy and compute)', azimuth: -20, ...FAMILY_FRAME }

// ---- layout
const ARRAY_POS = new THREE.Vector3(-0.03, -0.2, -0.5)
const ARRAY_YAW = 0.22
const TILT = 0.72 // radians from horizontal
const PW = 0.44 // panel width
const PL = 0.66 // panel length (along the tilt)
const PT = 0.045
const GAP = 0.045
const PANEL_X = [-(PW + GAP), 0, PW + GAP]

const CHIP_POS = new THREE.Vector3(0.04, DECK_Y, 0.3)
const CHIP_YAW = -0.25
const SUB = 0.78 // substrate size
const HS = 0.56 // heat spreader size
const CORE = 0.26
const PINS_PER_SIDE = 7

const SUN_POS = new THREE.Vector3(-0.06, 0.72, -0.55)

const N_PHOTONS = 30
const PULSES = 3
const TAIL = 10
const PULSE_SPEED = 0.42

const CONN = new THREE.Vector3(-SUB / 2 - 0.04, 0.04, 0.0) // chip space: docked into the left edge (faces the hero camera)
const PYLON_X = 0.34
const JBOX = new THREE.Vector3(-PYLON_X, -0.33, 0.085) // array space: collared to the front of the left pylon

const coreVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const coreFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uTime;
  uniform float uOn;
  uniform float uFlash;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main() {
    vec2 g = vUv * 6.0;
    vec2 id = floor(g);
    vec2 f = fract(g);
    float cell = smoothstep(0.0, 0.14, f.x) * (1.0 - smoothstep(0.86, 1.0, f.x))
               * smoothstep(0.0, 0.14, f.y) * (1.0 - smoothstep(0.86, 1.0, f.y));
    float tick = floor(uTime * 5.0 + hash(id) * 7.0);
    float act = step(0.45, hash(id + tick * 0.137));
    float r = length(vUv - 0.5) * 2.0;
    float centre = 1.0 - smoothstep(0.0, 1.3, r);
    vec3 col = uColor * (0.3 + 0.7 * centre) * (0.45 + 0.55 * act) * (0.15 + 0.85 * cell);
    col += uHot * uFlash * 0.35 * centre * cell;
    gl_FragColor = vec4(col * uOn, 1.0);
  }
`
const sunVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const sunFrag = /* glsl */ `
  uniform vec3 uEdge; uniform vec3 uHot; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    vec3 c = mix(uEdge * 0.75, uHot, pow(f, 2.2));
    gl_FragColor = vec4(c, uOpacity);
  }
`

function roundedSquare(size: number, r: number) {
  const s = size / 2
  const sh = new THREE.Shape()
  sh.moveTo(-s + r, -s)
  sh.lineTo(s - r, -s)
  sh.quadraticCurveTo(s, -s, s, -s + r)
  sh.lineTo(s, s - r)
  sh.quadraticCurveTo(s, s, s - r, s)
  sh.lineTo(-s + r, s)
  sh.quadraticCurveTo(-s, s, -s, s - r)
  sh.lineTo(-s, -s + r)
  sh.quadraticCurveTo(-s, -s, -s + r, -s)
  return sh
}

/** Segments of an outline of a w x l rectangle in the XZ plane at height y. */
function rectSegs(w: number, l: number, y: number): number[] {
  const x = w / 2
  const z = l / 2
  const c = [
    [-x, -z],
    [x, -z],
    [x, z],
    [-x, z],
  ]
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = c[i]
    const b = c[(i + 1) % 4]
    out.push(a[0], y, a[1], b[0], y, b[1])
  }
  return out
}

export default function PowerCompute({ progress = 1, accent }: ModelProps) {
  const computeColor = accent ?? ICE

  // ---------------- materials
  const body = useMemo(() => makeBody(), [])
  const panelMat = useMemo(() => makeBody('#0b1228', 0.75, 0.36), [])
  const pinMat = useMemo(() => {
    const m = makeBody('#1d1c22', 0.85, 0.3)
    m.emissive = new THREE.Color(EMBER).multiplyScalar(0.06)
    return m
  }, [])
  const panelMats = useMemo(() => [body, body, panelMat, body, body, body], [body, panelMat])

  // ---------------- solar panels
  const panelGeo = useMemo(() => new THREE.BoxGeometry(PW, PT, PL), [])
  const cellGrid = useMemo(() => {
    const s: number[] = []
    const y = PT / 2 + 0.003
    for (let i = 1; i < 3; i++) {
      const x = -PW / 2 + (PW * i) / 3
      s.push(x, y, -PL / 2, x, y, PL / 2)
    }
    for (let j = 1; j < 5; j++) {
      const z = -PL / 2 + (PL * j) / 5
      s.push(-PW / 2, y, z, PW / 2, y, z)
    }
    return s
  }, [])
  const frame = useMemo(() => rectSegs(PW, PL, PT / 2 + 0.003), [])
  const backFrame = useMemo(() => rectSegs(PW - 0.02, PL - 0.02, -PT / 2 - 0.003), [])

  // Mount (array space): a torque tube under the row on two chunky satin pylons.
  const TUBE_Y = -PT / 2 - 0.045
  const deckLocalY = DECK_Y - ARRAY_POS.y
  const tubeGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.03, 0.03, 3 * PW + 2 * GAP - 0.06, 16)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])
  const pylonGeo = useMemo(() => {
    const h = TUBE_Y - deckLocalY
    const prof = [
      [0.0, 0],
      [0.1, 0],
      [0.1, 0.03],
      [0.075, 0.05],
      [0.05, 0.08],
      [0.042, h - 0.04],
      [0.055, h - 0.02],
      [0.055, h + 0.02],
      [0.0, h + 0.02],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(prof, 24)
    g.translate(0, deckLocalY, 0)
    return g
  }, [TUBE_Y, deckLocalY])
  const pylonMat = useMemo(() => makeBody('#232a40', 0.7, 0.34), [])
  const pylonRim = useMemo(() => makeGlass({ boost: 0.8, power: 2.6, base: 0.0, streak: 0.0 }), [])
  const jboxCollar = useMemo(
    () => polyToSegments(circlePoints(0.05, JBOX.y + 0.05, 32).map((p) => p.add(new THREE.Vector3(-PYLON_X, 0, 0)))),
    [],
  )
  const pylonLines = useMemo(
    () =>
      [-PYLON_X, PYLON_X].flatMap((x) => [
        ...polyToSegments(circlePoints(0.101, deckLocalY + 0.031, 32).map((p) => p.add(new THREE.Vector3(x, 0, 0)))),
        ...polyToSegments(circlePoints(0.056, TUBE_Y - 0.02, 24).map((p) => p.add(new THREE.Vector3(x, 0, 0)))),
      ]),
    [TUBE_Y, deckLocalY],
  )

  // ---------------- chip
  const subGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedSquare(SUB, 0.035), { depth: 0.035, bevelEnabled: false, curveSegments: 4 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const hsGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedSquare(HS - 0.04, 0.02), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
      curveSegments: 4,
    })
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const SUB_Y = 0.018
  const HS_Y = SUB_Y + 0.035 + 0.02
  const HS_TOP = HS_Y + 0.07 + 0.02
  const hsEdges = useMemo(() => Array.from(new THREE.EdgesGeometry(hsGeo, 28).attributes.position.array as Float32Array), [hsGeo])
  const subEdges = useMemo(() => Array.from(new THREE.EdgesGeometry(subGeo, 28).attributes.position.array as Float32Array), [subGeo])
  const coreGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(CORE, CORE)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const coreMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: glow(computeColor, 0.8) },
          uHot: { value: glow('#e9fbff', 1.0) },
          uTime: { value: 0 },
          uOn: { value: 0 },
          uFlash: { value: 0 },
        },
        vertexShader: coreVert,
        fragmentShader: coreFrag,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const coreFrame = useMemo(() => rectSegs(CORE + 0.03, CORE + 0.03, 0), [])
  // Short traces from the die frame out toward the heat-spreader edge (4 per side).
  const traces = useMemo(() => {
    const s: number[] = []
    const a = (CORE + 0.03) / 2
    const b = HS / 2 - 0.07
    for (let side = 0; side < 4; side++) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2)
      for (const off of [-0.075, -0.025, 0.025, 0.075]) {
        const p0 = new THREE.Vector3(off, 0, a).applyQuaternion(q)
        const p1 = new THREE.Vector3(off, 0, b).applyQuaternion(q)
        s.push(p0.x, 0, p0.z, p1.x, 0, p1.z)
      }
    }
    return s
  }, [])
  const coreFrameH = useRef<GlowLinesHandle | null>(null)
  const tracesH = useRef<GlowLinesHandle | null>(null)
  const pins = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.04, 0.02, 0.1)
    const mesh = new THREE.InstancedMesh(geo, pinMat, PINS_PER_SIDE * 4)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const tips: number[] = []
    let k = 0
    for (let side = 0; side < 4; side++) {
      q.setFromAxisAngle(up, (side * Math.PI) / 2)
      for (let i = 0; i < PINS_PER_SIDE; i++) {
        if (side === 3 && i >= 2 && i <= 4) continue // the connector docks here
        const x = -SUB / 2 + 0.09 + ((SUB - 0.18) * i) / (PINS_PER_SIDE - 1)
        const p = new THREE.Vector3(x, 0.016, SUB / 2 + 0.04).applyQuaternion(q)
        m.compose(p, q, new THREE.Vector3(1, 1, 1))
        mesh.setMatrixAt(k++, m)
        const a = new THREE.Vector3(x - 0.02, 0.027, SUB / 2 + 0.088).applyQuaternion(q)
        const b = new THREE.Vector3(x + 0.02, 0.027, SUB / 2 + 0.088).applyQuaternion(q)
        tips.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    mesh.count = k
    mesh.renderOrder = 0
    return { mesh, tips }
  }, [pinMat])

  // ---------------- cable (world space), from a junction box under the array to a chip connector
  const chipM = useMemo(
    () =>
      new THREE.Matrix4().compose(
        CHIP_POS,
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), CHIP_YAW),
        new THREE.Vector3(1, 1, 1),
      ),
    [],
  )
  const arrayM = useMemo(
    () =>
      new THREE.Matrix4().compose(
        ARRAY_POS,
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ARRAY_YAW),
        new THREE.Vector3(1, 1, 1),
      ),
    [],
  )
  const cable = useMemo(() => {
    const start = JBOX.clone().setY(JBOX.y - 0.07).applyMatrix4(arrayM)
    const down = JBOX.clone().setY(deckLocalY + 0.12).setZ(JBOX.z + 0.01).applyMatrix4(arrayM)
    const end = CONN.clone().setX(CONN.x - 0.05).setY(0.035).applyMatrix4(chipM)
    const approach = CONN.clone().setX(CONN.x - 0.2).setY(0.03).applyMatrix4(chipM)
    const foot = new THREE.Vector3(down.x + 0.01, DECK_Y + 0.034, down.z + 0.14)
    // one smooth sweep: forward and out to the left, then curling right into the connector
    const pts = [
      start,
      down,
      foot,
      new THREE.Vector3(Math.min(foot.x, approach.x) - 0.1, DECK_Y + 0.034, (foot.z + approach.z) / 2 + 0.02),
      approach,
      end,
    ]
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    const tube = new THREE.TubeGeometry(curve, 140, 0.026, 10, false)
    const top = curve.getSpacedPoints(90).map((p) => p.clone().add(new THREE.Vector3(0, 0.027, 0)))
    return { curve, tube, line: polyToSegments(top) }
  }, [arrayM, chipM, deckLocalY])
  const junctionGeo = useMemo(() => new THREE.BoxGeometry(0.13, 0.12, 0.08), [])
  const jboxEdges = useMemo(() => Array.from(new THREE.EdgesGeometry(junctionGeo, 28).attributes.position.array as Float32Array), [junctionGeo])
  const connGeo = useMemo(() => new THREE.BoxGeometry(0.1, 0.055, 0.2), [])
  const connEdges = useMemo(() => Array.from(new THREE.EdgesGeometry(connGeo, 28).attributes.position.array as Float32Array), [connGeo])
  const beads = useSprites(PULSES * TAIL, glow(EMBER, 3.0), glow('#fff1d6', 2.6))

  // ---------------- sun
  const sunGeo = useMemo(() => new THREE.SphereGeometry(0.098, 24, 16), [])
  const sunMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uEdge: { value: glow(EMBER, 0.95) }, uHot: { value: glow('#fff3d6', 1.0) }, uOpacity: { value: 0 } },
        vertexShader: sunVert,
        fragmentShader: sunFrag,
        transparent: true,
        toneMapped: false,
      }),
    [],
  )
  const orbitA = useMemo(() => polyToSegments(circlePoints(0.195, 0, 72)), [])
  const orbitB = useMemo(() => polyToSegments(circlePoints(0.25, 0, 80)), [])
  const ringA = useRef<THREE.Group>(null)
  const ringB = useRef<THREE.Group>(null)
  const halo = useSprites(3, glow(EMBER, 1.0), glow(computeColor, 1.0))
  const dieWorld = useMemo(() => new THREE.Vector3(0, HS_TOP + 0.03, 0).applyMatrix4(chipM), [chipM, HS_TOP])

  // ---------------- photons: sun -> panels
  const photons = useSprites(N_PHOTONS, glow(EMBER, 2.0), glow('#fff2d0', 1.6), false)
  const panelTargets = useMemo(() => {
    const tilt = new THREE.Matrix4().makeRotationX(TILT)
    return Array.from({ length: N_PHOTONS }, (_, i) => {
      const px = PANEL_X[i % 3] + (Math.random() - 0.5) * PW * 0.8
      const pz = (Math.random() - 0.5) * PL * 0.8
      const v = new THREE.Vector3(0, PT / 2, pz).applyMatrix4(tilt).add(new THREE.Vector3(px, 0, 0)).applyMatrix4(arrayM)
      return { to: v, phase: Math.random(), speed: 0.45 + Math.random() * 0.3, size: 0.016 + Math.random() * 0.014, hue: Math.random() < 0.3 ? 1 : 0 }
    })
  }, [arrayM])

  const t = useRef(0)
  const sun = useRef<THREE.Group>(null)

  // ---------------- build timeline
  const pPanel = (i: number) => outExpo(seg(progress, T.body[0] + i * 0.05, T.body[1] - 0.08 + i * 0.05))
  const pFrame = seg(progress, 0.24, 0.5)
  const pGrid = seg(progress, 0.3, 0.6)
  const pChip = outExpo(seg(progress, 0.14, 0.5))
  const pChipLines = seg(progress, 0.24, 0.55)
  const pFocal = outCubic(seg(progress, T.focal[0], T.focal[1]))
  const pLife = seg(progress, T.life[0], T.life[1])
  const pSun = outCubic(seg(progress, 0.5, 0.9))
  const pCable = seg(progress, 0.45, 0.75)
  body.opacity = Math.max(pChip, pPanel(1))
  panelMat.opacity = pPanel(1)
  pinMat.opacity = pChip
  sunMat.uniforms.uOpacity.value = pSun
  const tubeIdx = cable.tube.index ? cable.tube.index.count : 0
  cable.tube.setDrawRange(0, Math.round((tubeIdx * pCable) / 6) * 6)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    t.current += dt
    const time = t.current + 1.3
    coreMat.uniforms.uTime.value = time
    coreMat.uniforms.uOn.value = pFocal

    // Pulses: beads with a short tail running from array to chip.
    let flash = 0
    for (let k = 0; k < PULSES; k++) {
      const c = (time * PULSE_SPEED + k / PULSES) % 1
      flash = Math.max(flash, Math.exp(-c / 0.07))
      for (let j = 0; j < TAIL; j++) {
        const u = c - j * 0.011
        const idx = k * TAIL + j
        if (u <= 0) {
          beads.alpha[idx] = 0
          continue
        }
        const p = cable.curve.getPointAt(Math.min(u, 1))
        beads.pos[idx * 3] = p.x
        beads.pos[idx * 3 + 1] = p.y + 0.03
        beads.pos[idx * 3 + 2] = p.z
        beads.size[idx] = (j === 0 ? 0.065 : 0.05) * (1 - (0.85 * j) / TAIL)
        beads.alpha[idx] = pLife * (1 - j / TAIL) * Math.min(1, (1 - u) * 25)
        beads.hue[idx] = j === 0 ? 1 : 0
      }
    }
    beads.flush()
    const f = flash * pLife
    coreMat.uniforms.uFlash.value = f
    if (coreFrameH.current) coreFrameH.current.mat.color.copy(glow(computeColor, 3.2 + 3 * f))
    if (tracesH.current) tracesH.current.mat.color.copy(glow(computeColor, 1.8 + 3 * f))

    // Halos: sun glow and die flare (soft additive sprites, peak below the grain limit).
    const js = cable.curve.getPointAt(0)
    halo.pos.set([SUN_POS.x, SUN_POS.y, SUN_POS.z, dieWorld.x, dieWorld.y, dieWorld.z, js.x, js.y, js.z])
    halo.size[0] = 0.5 + Math.sin(time * 2.1) * 0.03
    halo.alpha[0] = pSun * 0.4
    halo.hue[0] = 0
    halo.size[1] = 0.6 + 0.25 * f
    halo.alpha[1] = pFocal * (0.22 + 0.5 * f)
    halo.hue[1] = 1
    // spark where the cable leaves the array, as each pulse departs
    halo.size[2] = 0.16 + 0.12 * f
    halo.alpha[2] = pLife * (0.25 + 0.75 * f)
    halo.hue[2] = 0
    halo.flush()

    if (sun.current) sun.current.scale.setScalar(0.6 + 0.4 * pSun)
    if (ringA.current) ringA.current.rotation.y = time * 0.5
    if (ringB.current) ringB.current.rotation.y = -time * 0.35

    for (let i = 0; i < N_PHOTONS; i++) {
      const p = panelTargets[i]
      const u = (time * p.speed * 0.6 + p.phase) % 1
      const from = SUN_POS
      photons.pos[i * 3] = from.x + (p.to.x - from.x) * u
      photons.pos[i * 3 + 1] = from.y + (p.to.y - from.y) * u
      photons.pos[i * 3 + 2] = from.z + (p.to.z - from.z) * u
      photons.size[i] = p.size * 1.35 * (1 - 0.3 * u)
      photons.alpha[i] = pLife * Math.min(1, (u - 0.1) * 6) * Math.min(1, (1 - u) * 8) * 0.75
      photons.hue[i] = p.hue
    }
    photons.flush()
  })

  return (
    <group visible={progress > 0.001}>
      <Pedestal progress={progress} />

      {/* solar array */}
      <group position={ARRAY_POS} rotation-y={ARRAY_YAW}>
        {PANEL_X.map((x, i) => (
          <group key={i} position={[x, (1 - pPanel(i)) * -0.4, 0]} rotation-x={TILT * (0.4 + 0.6 * pPanel(i))}>
            <mesh geometry={panelGeo} material={panelMats} renderOrder={0} />
            <GlowLines segments={frame} color={EMBER} boost={2.6} draw={pFrame} />
            <GlowLines segments={backFrame} color={EMBER} boost={1.6} width={1.2} opacity={0.6} draw={pFrame} />
            <GlowLines segments={cellGrid} color={EMBER} boost={1.0} width={1.0} opacity={0.55} draw={pGrid} />
          </group>
        ))}
        <group position-y={(1 - pPanel(1)) * -0.3}>
          <mesh geometry={tubeGeo} material={pylonMat} position-y={TUBE_Y} />
          <mesh geometry={pylonGeo} material={pylonMat} position-x={-PYLON_X} />
          <mesh geometry={pylonGeo} material={pylonMat} position-x={PYLON_X} />
          <mesh geometry={pylonGeo} material={pylonRim} position-x={-PYLON_X} renderOrder={3} />
          <mesh geometry={pylonGeo} material={pylonRim} position-x={PYLON_X} renderOrder={3} />
          <mesh geometry={tubeGeo} material={pylonRim} position-y={TUBE_Y} renderOrder={3} />
          <GlowLines segments={pylonLines} color={EMBER} boost={1.6} width={1.2} opacity={0.45} draw={pFrame} />
          <GlowLines segments={jboxCollar} color={EMBER} boost={2.2} width={1.3} draw={pFrame} />
          <mesh geometry={junctionGeo} material={body} position={JBOX} />
          <group position={JBOX}>
            <GlowLines segments={jboxEdges} color={EMBER} boost={2.4} width={1.3} draw={pFrame} />
          </group>
        </group>
      </group>

      {/* cable */}
      <mesh geometry={cable.tube} material={body} renderOrder={0} />
      <GlowLines segments={cable.line} color={EMBER} boost={2.8} width={1.6} opacity={0.9} draw={pCable} />
      <primitive object={beads.points} />

      {/* chip */}
      <group position={CHIP_POS} rotation-y={CHIP_YAW}>
        <group position-y={(1 - pChip) * -0.25} scale={0.85 + 0.15 * pChip}>
          <mesh geometry={subGeo} material={body} position-y={SUB_Y} renderOrder={0} />
          <primitive object={pins.mesh} />
          <GlowLines segments={pins.tips} color={EMBER} boost={2.6} width={1.6} draw={pChipLines} />
          <mesh geometry={connGeo} material={body} position={CONN} />
          <group position={CONN}>
            <GlowLines segments={connEdges} color={EMBER} boost={2.4} width={1.3} draw={pCable} />
          </group>
          <mesh geometry={hsGeo} material={body} position-y={HS_Y} renderOrder={0} />
          <group position-y={SUB_Y}>
            <GlowLines segments={subEdges} color={computeColor} boost={1.4} width={1.1} opacity={0.45} draw={pChipLines} />
          </group>
          <group position-y={HS_Y}>
            <GlowLines segments={hsEdges} color={computeColor} boost={2.3} opacity={0.85} draw={pChipLines} />
          </group>
          <mesh geometry={coreGeo} material={coreMat} position-y={HS_TOP + 0.002} renderOrder={1} />
          <group position-y={HS_TOP + 0.004}>
            <GlowLines segments={coreFrame} color={computeColor} boost={3.2} draw={seg(progress, 0.55, 0.85)} handle={coreFrameH} />
            <GlowLines segments={traces} color={computeColor} boost={1.8} width={1.1} opacity={0.7} draw={seg(progress, 0.6, 0.9)} handle={tracesH} />
          </group>
        </group>
      </group>

      {/* sun */}
      <group position={SUN_POS}>
        <group ref={sun}>
          <mesh geometry={sunGeo} material={sunMat} renderOrder={2} />
          <group rotation={[1.15, 0, 0.45]}>
            <group ref={ringA}>
              <GlowLines segments={orbitA} color={EMBER} boost={2.6} width={1.4} draw={seg(progress, 0.55, 0.9)} />
            </group>
          </group>
          <group rotation={[-0.95, 0, -0.6]}>
            <group ref={ringB}>
              <GlowLines segments={orbitB} color={EMBER} boost={1.6} width={1.2} opacity={0.7} draw={seg(progress, 0.6, 0.95)} />
            </group>
          </group>
        </group>
      </group>

      <primitive object={halo.points} />
      <primitive object={photons.points} />
    </group>
  )
}
