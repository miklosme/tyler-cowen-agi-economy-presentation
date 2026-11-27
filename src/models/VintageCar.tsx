/**
 * VintageCar: a Model-T-era tall-cabin coupe, one of four "vintage invention" icons
 * (1905–1955 slide). Faces +x (the direction of the timeline), yawed slightly toward camera.
 * Idle: spoked wheels roll slowly, headlamps glow warm with a soft beam and drifting motes.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glow } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  FAMILY,
  Part,
  boxPiece,
  bandShape,
  circleSeg,
  easeInOut,
  hover,
  makeGlass,
  makeMotes,
  matrixOf,
  polySeg,
  transformSeg,
  win,
  type Piece,
  type Seg,
  type V3,
} from './vintage-parts/kit'

export const meta: ModelMeta = {
  title: 'Vintage car (c. 1908)',
  distance: FAMILY.distance,
  elevation: FAMILY.elevation,
  azimuth: FAMILY.azimuth,
}

const R = 0.34 // wheel radius
const WY = -0.28 // wheel centre height
const WX = [-0.72, 0.7]
const TRACK = 0.46
const YAW = -0.42
const FILL: [number, number] = [0.04, 0.5] // body fills in right behind its lines
const LENS = '#ffc477' // warm amber filament, between focal white and ember

const lensVert = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.yz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const lensFrag = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uRim; uniform float uI;
  varying vec2 vP;
  void main() {
    float r = length(vP) / 0.085;
    float core = 1.0 - smoothstep(0.0, 0.55, r);
    vec3 col = mix(uRim, uCore, core * core) * (0.85 + 0.15 * (1.0 - r));
    gl_FragColor = vec4(col * uI, uI);
  }
`
const beamVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`
const beamFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    // uv.y: 1 at the far (wide) end, 0 at the lamp. uv.x wraps around the cone.
    float along = 1.0 - vUv.y;
    float fall = pow(clamp(along, 0.0, 1.0), 1.6);
    float edge = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 3.0 + uTime * 0.4);
    // fade at grazing angles so the cone has no hard paper edges
    float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
    gl_FragColor = vec4(uColor, fall * facing * uOpacity * (0.75 + 0.25 * edge));
  }
`

export default function VintageCar({ progress = 1 }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const wheelRefs = useRef<(THREE.Group | null)[]>([])

  const parts = useMemo(() => {
    // ---- wheels (one shared set of geometry) -------------------------------------------
    const tire = new THREE.TorusGeometry(R - 0.045, 0.045, 10, 48)
    const rim = new THREE.TorusGeometry(R - 0.1, 0.014, 6, 40)
    const hub = new THREE.CylinderGeometry(0.065, 0.065, 0.09, 20).rotateX(Math.PI / 2)
    const spokeGeos: THREE.BufferGeometry[] = []
    const SPOKES = 10
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2
      const g = new THREE.BoxGeometry(R - 0.12, 0.016, 0.016)
      g.translate((R - 0.12) / 2 + 0.03, 0, 0)
      g.rotateZ(a)
      spokeGeos.push(g)
    }
    const spokes = mergeAll(spokeGeos)
    const wheelPieces: Piece[] = [
      { geo: tire, m: 'dark', edge: false },
      { geo: rim, m: 'trim', edge: false },
      { geo: hub, m: 'trim', edge: false },
      { geo: spokes, m: 'trim', edge: false },
    ]
    const wheelLines = (side: number): Seg => [
      ...circleSeg([0, 0, 0.05 * side], R, 'z', 56),
      ...circleSeg([0, 0, 0.02 * side], R - 0.1, 'z', 40),
      ...circleSeg([0, 0, 0.05 * side], 0.065, 'z', 16),
    ]
    const spokeLines = (side: number): Seg => {
      const s: Seg = []
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2
        const c = Math.cos(a)
        const sn = Math.sin(a)
        s.push(c * 0.07, sn * 0.07, 0.02 * side, c * (R - 0.1), sn * (R - 0.1), 0.02 * side)
      }
      return s
    }
    const wheels = [
      { pos: [WX[0], WY, TRACK] as V3, side: 1 },
      { pos: [WX[1], WY, TRACK] as V3, side: 1 },
      { pos: [WX[0], WY, -TRACK] as V3, side: -1 },
      { pos: [WX[1], WY, -TRACK] as V3, side: -1 },
    ].map((w) => ({
      ...w,
      lines: w.side > 0 ? wheelLines(w.side) : [],
      soft: w.side > 0 ? spokeLines(w.side) : [...wheelLines(w.side), ...spokeLines(w.side), ...circleSeg([0, 0, 0.05], R, 'z', 56)],
    }))

    // ---- fenders + running boards (one extruded profile per side) ------------------------
    const prof = new THREE.SplineCurve(
      [
        [-1.13, -0.2],
        [-1.03, 0.03],
        [-0.87, 0.13],
        [-0.67, 0.145],
        [-0.5, 0.07],
        [-0.4, -0.12],
        [-0.31, -0.3],
        [-0.2, -0.335],
        [0.0, -0.34],
        [0.22, -0.335],
        [0.35, -0.28],
        [0.49, -0.07],
        [0.65, 0.1],
        [0.82, 0.125],
        [0.97, 0.06],
        [1.04, -0.03],
        [1.075, -0.11],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    ).getPoints(110)
    const fenderShape = bandShape(prof, 0.035)
    const FW = 0.24
    const fenderGeo = toCreasedNormals(new THREE.ExtrudeGeometry(fenderShape, { depth: FW, bevelEnabled: false, curveSegments: 4 }), 0.6)
    const fenders: Piece[] = [
      { geo: fenderGeo, p: [0, 0, TRACK - FW / 2], m: 'fabric', edge: false },
      { geo: fenderGeo, p: [0, 0, -TRACK - FW / 2], m: 'fabric', edge: false },
    ]
    // one clean crown line per fender (outer edge) + a soft inner edge on the near side
    const crown = (z: number) => polySeg(prof.filter((v) => v.x > -0.97 && v.x < 1.0).map((v) => [v.x, v.y + 0.002, z] as V3))
    const fenderLines: Seg = [...crown(TRACK + FW / 2 + 0.002)]
    const fenderSoft: Seg = [...crown(TRACK - FW / 2), ...crown(-TRACK - FW / 2 - 0.002)]
    // running board outer edge, owned by the fenders so fender-board-fender reads as one sweep
    fenderLines.push(...polySeg([[-0.3, -0.372, TRACK + FW / 2 + 0.003], [0.27, -0.372, TRACK + FW / 2 + 0.003]]))
    // chassis rails + splash aprons between fender and body
    const chassis: Piece[] = [
      boxPiece(-1.02, 1.0, -0.36, -0.3, -0.3, 0.3, 'dark', false),
      boxPiece(-0.3, 0.3, -0.34, -0.3, 0.3, 0.34, 'dark', false),
      boxPiece(-0.3, 0.3, -0.34, -0.3, -0.34, -0.3, 'dark', false),
    ]

    // ---- body: hood, radiator, cowl, lower tub ---------------------------------------------
    const body: Piece[] = [
      { geo: taperedHood(), p: [0.55, -0.065, 0], edge: 28 }, // long hood, narrowing to the radiator
      { geo: radiatorShell(), p: [0.98, 0, 0], m: 'trim', edge: 30 }, // tall arched Model-T radiator
      boxPiece(-0.88, 0.12, -0.3, 0.15, -0.36, 0.36), // lower tub
      boxPiece(-0.84, 0.08, 0.15, 0.158, -0.33, 0.33, 'dark', false), // cabin floor, kept dark
      boxPiece(-1.03, -0.88, -0.3, 0.02, -0.33, 0.33), // rear deck
    ]
    const radCap = new THREE.CylinderGeometry(0.03, 0.035, 0.05, 14)
    body.push({ geo: radCap, p: [1.022, 0.27, 0], m: 'trim', edge: false })
    const bodySoft: Seg = []
    // radiator honeycomb as vertical fins + hood louvres
    for (let i = -2; i <= 2; i++) bodySoft.push(1.068, -0.22, i * 0.06, 1.068, 0.15, i * 0.06)
    for (let i = 0; i < 3; i++) {
      const x = 0.55 + i * 0.12
      bodySoft.push(x, -0.18, 0.252, x, -0.02, 0.252, x, -0.18, -0.252, x, -0.02, -0.252)
    }
    // belt line on the tub; the hood ridge is a full-weight line (bodyLines)
    bodySoft.push(-0.88, 0.02, 0.362, 0.12, 0.02, 0.362, -0.88, 0.02, -0.362, 0.12, 0.02, -0.362)
    const bodyLines: Seg = polySeg([[0.12, 0.132, 0], [0.98, 0.132, 0]])

    // ---- cabin greenhouse: pillars + roof -------------------------------------------------
    const CY0 = 0.15
    const CY1 = 0.62
    const cabin: Piece[] = [
      boxPiece(0.07, 0.12, CY0, CY1, -0.36, -0.31, 'body', false), // A pillars
      boxPiece(0.07, 0.12, CY0, CY1, 0.31, 0.36, 'body', false),
      boxPiece(-0.28, -0.22, CY0, CY1, 0.33, 0.36, 'body', false), // B pillars
      boxPiece(-0.28, -0.22, CY0, CY1, -0.36, -0.33, 'body', false),
      boxPiece(-0.88, -0.68, CY0, CY1, -0.36, 0.36, 'body', false), // rear quarter (solid)
      { geo: crownedRoof(1.14), p: [-0.38, CY1, 0], edge: 30 }, // crowned roof, overhanging front and rear
      boxPiece(0.07, 0.12, CY1 - 0.06, CY1, -0.31, 0.31, 'body', false), // windshield header
    ]
    // one line per pillar (outer face), drawn on the near side only
    const pillarLines: Seg = [
      ...polySeg([[-0.68, CY0, 0.362], [-0.68, CY1, 0.362]]),
      ...polySeg([[-0.881, CY0, 0.36], [-0.881, CY1, 0.36]]),
      ...polySeg([[0.12, CY0, 0.362], [0.12, CY1, 0.362]]),
      ...polySeg([[-0.25, CY0, 0.362], [-0.25, CY1, 0.362]]),
      ...polySeg([[0.121, CY0, 0.36], [0.121, CY0, -0.36]]),
    ]
    // steering wheel visible through the glass
    const steer = new THREE.TorusGeometry(0.11, 0.012, 6, 28).rotateY(Math.PI / 2).rotateZ(-0.5)
    cabin.push({ geo: steer, p: [-0.06, 0.25, 0.14], m: 'dark', edge: false })
    const cabinSoft: Seg = []
    // far-side pillars, soft weight
    cabinSoft.push(0.12, CY0, -0.362, 0.12, CY1, -0.362, -0.25, CY0, -0.362, -0.25, CY1, -0.362, -0.68, CY0, -0.362, -0.68, CY1, -0.362)

    const glassGeo = {
      side: new THREE.PlaneGeometry(0.31, CY1 - CY0 - 0.04),
      front: new THREE.PlaneGeometry(0.62, CY1 - CY0 - 0.08),
      rearSide: new THREE.PlaneGeometry(0.4, CY1 - CY0 - 0.04),
    }

    // ---- headlamps ----------------------------------------------------------------------
    const LX = 1.0
    const LY = 0.15
    const LZ = 0.45 // outboard, perched over the front fenders so they never merge with the radiator
    const bucket = new THREE.CylinderGeometry(0.1, 0.085, 0.13, 28).rotateZ(-Math.PI / 2)
    const stalk = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8)
    const lampPieces: Piece[] = []
    const lampLines: Seg = []
    for (const z of [LZ, -LZ]) {
      lampPieces.push({ geo: bucket, p: [LX, LY, z], m: 'trim', edge: false })
      lampPieces.push({ geo: stalk, p: [LX - 0.02, LY - 0.14, z], m: 'dark', edge: false })
      lampLines.push(...circleSeg([LX + 0.066, LY, z], 0.1, 'x', 32))
      lampLines.push(...circleSeg([LX - 0.065, LY, z], 0.085, 'x', 24))
      lampLines.push(...polySeg([[LX - 0.02, LY - 0.09, z], [LX - 0.02, LY - 0.15, z]]))
    }
    const lens = new THREE.CircleGeometry(0.085, 32).rotateY(Math.PI / 2)
    const beam = new THREE.CylinderGeometry(0.16, 0.075, 0.3, 32, 1, true).rotateZ(-Math.PI / 2)
    beam.translate(0.15, 0, 0)

    const glass = makeGlass()
    const lensMat = new THREE.ShaderMaterial({
      uniforms: { uCore: { value: glow('#ffe2b0', 3.0) }, uRim: { value: glow(LENS, 1.3) }, uI: { value: 0 } },
      vertexShader: lensVert,
      fragmentShader: lensFrag,
      toneMapped: false,
      transparent: true,
    })
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(FAMILY.focal, 1.6) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    // motes drifting forward in the beams
    const starts: V3[] = []
    const dirs: V3[] = []
    for (let i = 0; i < 14; i++) {
      const z = i % 2 ? LZ : -LZ
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 0.06
      starts.push([LX + 0.1, LY + Math.sin(a) * r, z + Math.cos(a) * r])
      const spread = 0.12 + Math.random() * 0.12
      dirs.push([0.26 + Math.random() * 0.12, Math.sin(a) * spread * 0.6, Math.cos(a) * spread * 0.6])
    }
    const motes = makeMotes(starts, dirs, 2.4, FAMILY.focal, 2.4)

    return {
      wheelPieces,
      wheels,
      fenders,
      fenderLines,
      fenderSoft,
      chassis,
      body,
      bodySoft,
      bodyLines,
      cabin,
      cabinSoft,
      pillarLines,
      glassGeo,
      glass,
      lampPieces,
      lampLines,
      lens,
      beam,
      lensMat,
      beamMat,
      motes,
      LX,
      LY,
      LZ,
      CY0,
      CY1,
    }
  }, [])

  const light = useRef<THREE.PointLight>(null)
  const ignite = easeInOut(win(progress, 0.56, 0.36))
  const glassOp = 1.7 * easeInOut(win(progress, 0.45, 0.3))

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    hover(root.current, t, 0.0, 0.8)
    // suspension shimmy: body rides on the wheels
    for (const w of wheelRefs.current) if (w) w.rotation.z -= dt * 0.9 * (0.3 + 0.7 * ignite)
    const flick = 0.94 + 0.04 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 17.1)
    parts.lensMat.uniforms.uI.value = ignite * flick
    parts.beamMat.uniforms.uOpacity.value = 0.26 * ignite * flick
    parts.beamMat.uniforms.uTime.value = t
    ;(parts.motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    ;(parts.motes.material as THREE.ShaderMaterial).uniforms.uOpacity.value = ignite * 0.8
    parts.glass.uniforms.uTime.value = t
    parts.glass.uniforms.uOpacity.value = glassOp
    if (light.current) light.current.intensity = 1.4 * ignite * flick
  })

  const { CY0, CY1, LX, LY, LZ } = parts
  const midY = (CY0 + CY1) / 2 - 0.01

  return (
    <group ref={root}>
      <group rotation-y={YAW} position={[0.02, 0.0, 0]} scale={1.08}>
        {parts.wheels.map((w, i) => (
          <Part
            key={i}
            progress={progress}
            start={[0.02, 0.07, 0.16, 0.2][i]}
            pieces={parts.wheelPieces}
            lines={w.lines}
            soft={w.soft}
            position={w.pos}
            innerRef={(g) => {
              wheelRefs.current[i] = g
            }}
          />
        ))}
        <Part progress={progress} start={0.1} pieces={parts.chassis} subdivide={0.12} fill={FILL} />
        <Part progress={progress} start={0.15} pieces={parts.fenders} subdivide={0.12} fill={FILL} lines={parts.fenderLines} soft={parts.fenderSoft} />
        <Part progress={progress} start={0.16} pieces={parts.body} subdivide={0.12} fill={FILL} lines={parts.bodyLines} soft={parts.bodySoft} />
        <Part progress={progress} start={0.24} pieces={parts.cabin} subdivide={0.12} fill={FILL} lines={parts.pillarLines} soft={parts.cabinSoft}>
          <mesh geometry={parts.glassGeo.side} material={parts.glass} position={[-0.085, midY, 0.345]} />
          <mesh geometry={parts.glassGeo.side} material={parts.glass} position={[-0.085, midY, -0.345]} />
          <mesh geometry={parts.glassGeo.rearSide} material={parts.glass} position={[-0.48, midY, 0.345]} />
          <mesh geometry={parts.glassGeo.rearSide} material={parts.glass} position={[-0.48, midY, -0.345]} />
          <mesh geometry={parts.glassGeo.front} material={parts.glass} position={[0.095, midY - 0.02, 0]} rotation-y={Math.PI / 2} />
        </Part>
        <Part progress={progress} start={0.42} pieces={parts.lampPieces} lines={parts.lampLines}>
          {[LZ, -LZ].map((z) => (
            <group key={z} position={[LX + 0.067, LY, z]}>
              <mesh geometry={parts.lens} material={parts.lensMat} />
              <mesh geometry={parts.beam} material={parts.beamMat} />
            </group>
          ))}
          <primitive object={parts.motes} />
        </Part>
        <pointLight ref={light} position={[LX + 0.35, LY + 0.05, 0]} color={FAMILY.focal} distance={2.4} decay={2} intensity={0} />
      </group>
    </group>
  )
}

function mergeAll(geos: THREE.BufferGeometry[]) {
  // Minimal merge for non-indexed copies (avoids pulling BufferGeometryUtils for one use).
  const parts = geos.map((g) => g.toNonIndexed())
  let total = 0
  for (const g of parts) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  let o = 0
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3)
    nor.set(g.attributes.normal.array as Float32Array, o * 3)
    o += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return out
}

/** Hood box (x 0.12..0.98, y -0.26..0.13) narrowing from 0.5 to 0.42 wide toward the radiator. */
function taperedHood() {
  const g = new THREE.BoxGeometry(0.86, 0.39, 0.5)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) > 0) pos.setZ(i, pos.getZ(i) * 0.84)
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}

/** Tall, narrow radiator shell with an arched top cap, rising above the hood line. */
function radiatorShell() {
  const w = 0.21
  const s = new THREE.Shape()
  s.moveTo(-w, -0.3)
  s.lineTo(w, -0.3)
  s.lineTo(w, 0.16)
  s.quadraticCurveTo(w, 0.25, 0, 0.255)
  s.quadraticCurveTo(-w, 0.25, -w, 0.16)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: false, curveSegments: 10 })
  g.rotateY(Math.PI / 2) // shape x -> -z (symmetric), extrusion -> +x
  return g
}

/** Roof slab with a gentle crown across its width, extruded along the car's length. */
function crownedRoof(len: number) {
  const w = 0.4
  const s = new THREE.Shape()
  s.moveTo(-w, 0)
  s.lineTo(w, 0)
  s.lineTo(w, 0.045)
  s.quadraticCurveTo(0, 0.13, -w, 0.045)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 12 })
  g.translate(0, 0, -len / 2)
  g.rotateY(Math.PI / 2) // width -> z, length -> x
  return g
}
