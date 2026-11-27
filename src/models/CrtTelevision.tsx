/**
 * CrtTelevision: a late-1940s/50s console television on splayed legs with rabbit-ear antenna,
 * one of four "vintage invention" icons (1905–1955 slide). Faces +z.
 * Build-in ends with the classic CRT power-on (a bright line that opens into the picture).
 * Idle: the bulging screen glows with a test-pattern, drifting scanlines and a soft roll bar.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  FAMILY,
  Part,
  boxPiece,
  circleSeg,
  easeInOut,
  hover,
  interleave,
  polySeg,
  roundedRectPath,
  roundedRectShape,
  shapeOutline,
  win,
  type Piece,
  type Seg,
  type V3,
} from './vintage-parts/kit'

export const meta: ModelMeta = {
  title: 'CRT television (c. 1949)',
  distance: FAMILY.distance,
  elevation: FAMILY.elevation,
  azimuth: FAMILY.azimuth,
}

// Cabinet
const CW = 0.68 // half width
const CY0 = -0.42
const CY1 = 0.52
const CD = 0.4 // half depth
const FZ = CD
// Screen
const SX = -0.13
const SY = 0.07
const SW = 0.8
const SH = 0.62
const SR = 0.13
/** Turn the face toward the right (the direction of the timeline), like the car and plane. */
const FACE = 0.95

const screenVert = /* glsl */ `
  uniform vec2 uSize; uniform float uBulge;
  varying vec2 vUv; varying vec2 vP;
  void main() {
    vUv = uv;
    vP = position.xy;
    vec2 q = position.xy / (uSize * 0.5);
    float b = (1.0 - q.x * q.x * 0.6) * (1.0 - q.y * q.y * 0.6);
    vec3 p = position + vec3(0.0, 0.0, uBulge * max(b, 0.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const screenFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uI; uniform float uOn; uniform float uTime;
  uniform vec2 uSize; uniform float uR; uniform float uGlass;
  varying vec2 vUv; varying vec2 vP;
  float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 hs = uSize * 0.5;
    float d = sdRound(vP, hs, uR);
    if (d > 0.0) discard;
    vec2 p = vP / hs.y;                 // -1..1 vertically
    // CRT power-on: horizontal line opening vertically
    float open = smoothstep(0.0, 1.0, uOn);
    float lineH = mix(0.02, 1.2, pow(open, 1.6));
    float vis = (1.0 - smoothstep(lineH - 0.04, lineH, abs(p.y)));
    float lineBoost = 1.0 + 2.0 * (1.0 - open);

    // test pattern: concentric rings, crosshair, radial wedges, framed
    float r = length(p);
    float rr = abs(fract(r * 4.0 + 0.5) - 0.5);          // distance to the nearest ring
    float rings = (1.0 - smoothstep(0.04, 0.075, rr)) * step(r, 0.9) * step(0.2, r);
    float disc = 1.0 - smoothstep(0.08, 0.1, r);                 // solid centre bullseye
    // corner registration wedges (classic test-card cues)
    vec2 ap = abs(p);
    float corner = step(0.9, ap.x) * step(0.58, ap.y) * step(ap.x, 1.1) * step(ap.y, 0.78) * step(ap.x - 0.9, (ap.y - 0.58) * 1.0);
    float cross = (1.0 - smoothstep(0.006, 0.02, min(abs(p.x), abs(p.y)))) * step(r, 0.9);
    float ang = atan(p.y, p.x);
    float wedge = step(0.5, fract(ang / 6.2831 * 16.0)) * (1.0 - smoothstep(0.3, 0.32, r)) * step(0.12, r);
    float pattern = max(max(max(rings, cross), wedge * 0.8), max(disc, corner * 0.8));

    // scanlines (drifting) + soft roll bar + flicker
    float scan = 0.82 + 0.18 * sin((p.y * 90.0 + uTime * 6.0));
    float roll = 1.0 + 0.22 * exp(-pow(fract(p.y * 0.25 - uTime * 0.12) * 4.0 - 2.0, 2.0) * 3.0);
    float flick = 0.95 + 0.05 * sin(uTime * 31.0) * sin(uTime * 7.0);
    // strong corner falloff so the tube face reads as convex
    float vign = (1.0 - smoothstep(-0.16, 0.02, d)) * max(0.0, 1.12 - 0.3 * dot(p, p));

    vec3 base = uColor * (0.25 + 0.75 * vign);
    vec3 col = base * (1.0 - 0.72 * pattern) * scan * roll * flick;
    col *= vis * lineBoost * uI;
    // curved-glass highlight (upper left), present even while the tube is dark
    vec2 hp = (p - vec2(-0.62, 0.58)) * vec2(1.0, 1.9);
    float sheen = (1.0 - smoothstep(0.0, 0.75, length(hp))) * 0.14;
    col += vec3(0.95, 0.9, 0.82) * sheen * uGlass;
    gl_FragColor = vec4(col, 1.0);
  }
`

export default function CrtTelevision({ progress = 1 }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)

  const parts = useMemo(() => {
    // ---- cabinet --------------------------------------------------------------------------
    const cabinet: Piece[] = [
      boxPiece(-CW, CW, CY0, CY1, -CD, CD, 'body', 30),
      boxPiece(-CW - 0.025, CW + 0.025, CY1, CY1 + 0.04, -CD - 0.025, CD + 0.025, 'trim', 30), // top cap
      boxPiece(-CW - 0.025, CW + 0.025, CY0 - 0.04, CY0, -CD - 0.025, CD + 0.025, 'trim', 30), // base band
    ]
    // the CRT's tapered rear housing: the bump that says "picture tube" from behind
    const hood = new THREE.CylinderGeometry(0.27, 0.56, 0.3, 4, 1).rotateY(Math.PI / 4).rotateX(-Math.PI / 2)
    cabinet.push({ geo: hood, p: [SX * 0.5, (CY0 + CY1) / 2 + 0.02, -CD - 0.15], m: 'body', edge: 28 })
    const backSoft: Seg = []
    for (let i = 0; i < 5; i++) {
      const y = 0.0 + i * 0.06
      backSoft.push(SX * 0.5 - 0.12, y, -CD - 0.302, SX * 0.5 + 0.12, y, -CD - 0.302)
    }

    // ---- legs (tapered, splayed) ------------------------------------------------------------
    const legs: Piece[] = []
    const legLines: Seg = []
    const legSoft: Seg = []
    const LEG_BOTTOM = -0.95
    // Tapered dark legs; the glow line rides on the camera-facing flank (in local space the
    // hero camera sits at about (-0.33, 0.95) in xz) so the leg body never hides it.
    const foot = new THREE.SphereGeometry(0.012, 12, 8)
    const RT = 0.028
    const RB = 0.013
    const cam = new THREE.Vector3(-0.33, 0, 0.95)
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const a: V3 = [sx * (CW - 0.1), CY0 - 0.04, sz * (CD - 0.1)]
        const b: V3 = [sx * (CW + 0.0), LEG_BOTTOM, sz * (CD + 0.02)]
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
        const len = dir.length()
        const g = new THREE.CylinderGeometry(RT, RB, len, 10)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate())
        const e = new THREE.Euler().setFromQuaternion(q)
        legs.push({ geo: g, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z], m: 'body', edge: false })
        legs.push({ geo: foot, p: b, m: 'trim', edge: false })
        const off = cam.clone().sub(dir.clone().normalize().multiplyScalar(cam.dot(dir.clone().normalize()))).normalize()
        const k = 1.25
        legSoft.push(...circleSeg([b[0], b[1] + 0.005, b[2]], 0.024, 'y', 14))
        legSoft.push(...polySeg([
          [a[0] - off.x * RT * k, a[1] - off.y * RT * k, a[2] - off.z * RT * k],
          [b[0] - off.x * RB * k, b[1] - off.y * RB * k, b[2] - off.z * RB * k],
        ]))
        legLines.push(...polySeg([
          [a[0] + off.x * RT * k, a[1] + off.y * RT * k, a[2] + off.z * RT * k],
          [b[0] + off.x * RB * k, b[1] + off.y * RB * k, b[2] + off.z * RB * k],
        ]))
      }

    // ---- screen mask / bezel --------------------------------------------------------------
    const bezel = roundedRectShape(SW + 0.14, SH + 0.14, SR + 0.05, SX, SY)
    const hole = new THREE.Path()
    roundedRectPath(hole, SW, SH, SR, SX, SY)
    bezel.holes.push(hole)
    const bezelGeo = new THREE.ExtrudeGeometry(bezel, { depth: 0.045, bevelEnabled: false, curveSegments: 10 })
    const face: Piece[] = [{ geo: bezelGeo, p: [0, 0, FZ], m: 'trim', edge: 30 }]
    const faceSoft: Seg = [
      ...shapeOutline(roundedRectShape(SW + 0.22, SH + 0.22, SR + 0.08, SX, SY), FZ + 0.002, 96),
    ]

    // ---- right control panel: speaker slots + two knobs ------------------------------------
    const PX = 0.5
    const panel: Piece[] = []
    const panelLines: Seg = []
    const panelSoft: Seg = []
    for (let i = 0; i < 5; i++) {
      const x = PX - 0.08 + i * 0.04
      panelSoft.push(x, 0.18, FZ + 0.003, x, 0.42, FZ + 0.003)
    }
    panelLines.push(...shapeOutline(roundedRectShape(0.26, 0.3, 0.04, PX, 0.3), FZ + 0.003, 48))
    const knob = new THREE.CylinderGeometry(0.06, 0.066, 0.07, 26).rotateX(Math.PI / 2)
    for (const [y, ka] of [[0, 0.8], [-0.22, -0.5]] as const) {
      panel.push({ geo: knob, p: [PX, y, FZ + 0.035], m: 'trim', edge: false })
      panelLines.push(...circleSeg([PX, y, FZ + 0.071], 0.06, 'z', 28))
      panelLines.push(...polySeg([[PX, y, FZ + 0.072], [PX + Math.cos(ka) * 0.05, y + Math.sin(ka) * 0.05, FZ + 0.072]]))
    }

    // ---- rabbit-ear antenna ---------------------------------------------------------------
    const ant: Piece[] = []
    const antLines: Seg = []
    const dome = new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    const AB: V3 = [0.12, CY1 + 0.04, -0.05]
    ant.push({ geo: dome, p: AB, m: 'fabric', edge: false })
    antLines.push(...circleSeg([AB[0], AB[1] + 0.004, AB[2]], 0.104, 'y', 32))
    const tips: V3[] = [
      [-0.3, 1.06, -0.19],
      [0.56, 1.01, -0.15],
    ]
    const tipBall = new THREE.SphereGeometry(0.022, 12, 8)
    const rodBase: V3 = [AB[0], AB[1] + 0.08, AB[2]]
    // dome profile arcs (front + side) so the base reads as a dome, not a blob
    for (const ang of [0, Math.PI / 2]) {
      const pts: V3[] = []
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (i / 12)
        pts.push([AB[0] + Math.cos(a) * 0.102 * Math.cos(ang), AB[1] + Math.sin(a) * 0.102, AB[2] + Math.cos(a) * 0.102 * Math.sin(ang)])
      }
      antLines.push(...polySeg(pts))
    }
    // both rods extend together: segments interleaved, drawn in order
    antLines.push(...interleave(tips.map((tp) => [rodBase, tp] as [V3, V3]), 12))

    const tipMat = new THREE.MeshBasicMaterial({ color: glow('#ffb054', 1.6), toneMapped: false, transparent: true, opacity: 0 })

    // ---- screen ---------------------------------------------------------------------------
    const screenGeo = new THREE.PlaneGeometry(SW, SH, 32, 24)
    const screenMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: glow('#ffbf72', 0.95) },
        uGlass: { value: 0 },
        uI: { value: 0 },
        uOn: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(SW, SH) },
        uR: { value: SR },
        uBulge: { value: 0.04 },
      },
      vertexShader: screenVert,
      fragmentShader: screenFrag,
      toneMapped: false,
    })
    // dark recess behind the glass so the screen edge reads as a tube face
    const recess = new THREE.ShapeGeometry(roundedRectShape(SW, SH, SR, 0, 0), 8)
    const recessMat = new THREE.MeshBasicMaterial({ color: '#05060c', transparent: true, opacity: 0 })

    return { legSoft, tips, tipBall, tipMat, cabinet, backSoft, legs, legLines, face, faceSoft, panel, panelLines, panelSoft, ant, antLines, screenGeo, screenMat, recess, recessMat }
  }, [])

  const on = win(progress, 0.62, 0.38)
  const recessOp = easeInOut(win(progress, 0.35, 0.3))
  parts.recessMat.opacity = recessOp
  parts.tipMat.opacity = easeInOut(win(progress, 0.6, 0.2))

  useFrame((state) => {
    const t = state.clock.elapsedTime
    hover(root.current, t, 3.9, 0.8)
    const flick = 0.96 + 0.04 * Math.sin(t * 13.0) * Math.sin(t * 5.1)
    parts.screenMat.uniforms.uOn.value = on
    parts.screenMat.uniforms.uI.value = on > 0 ? 1 : 0
    parts.screenMat.uniforms.uGlass.value = recessOp
    parts.screenMat.uniforms.uTime.value = t
    if (light.current) light.current.intensity = 1.3 * easeInOut(on) * flick
  })

  return (
    <group ref={root}>
      <group position={[0, -0.08, 0]} rotation-y={FACE}>
        <Part progress={progress} start={0.02} pieces={parts.legs} lines={parts.legLines} soft={parts.legSoft} />
        <Part progress={progress} start={0.1} pieces={parts.cabinet} soft={parts.backSoft} />
        <Part progress={progress} start={0.22} pieces={parts.face}>
          <mesh geometry={parts.recess} material={parts.recessMat} position={[SX, SY, FZ + 0.001]} />
          <mesh geometry={parts.screenGeo} material={parts.screenMat} position={[SX, SY, FZ + 0.004]} />
        </Part>
        <Part progress={progress} start={0.32} pieces={parts.panel} lines={parts.panelLines} soft={parts.panelSoft} />
        <Part progress={progress} start={0.18} pieces={parts.ant} lines={parts.antLines} sortLines={false}>
          {parts.tips.map((tp, i) => (
            <mesh key={i} geometry={parts.tipBall} material={parts.tipMat} position={tp} />
          ))}
        </Part>
        <pointLight ref={light} position={[SX, SY, FZ + 0.6]} color={FAMILY.focal} distance={2.2} decay={2} intensity={0} />
      </group>
    </group>
  )
}

