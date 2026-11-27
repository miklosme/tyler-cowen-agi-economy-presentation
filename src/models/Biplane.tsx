/**
 * Biplane: a c. 1915–25 tractor biplane, one of four "vintage invention" icons (1905–1955 slide).
 * Faces +x (the direction of the timeline), seen near side-on in a gentle banking climb so both
 * staggered wings, the boxy longeron fuselage, the tall rudder and the round cowl all read at once.
 *
 * Focal light: the warm propeller disc and hub glint carry the eye; the cockpit answers with a
 * crisp warm coaming rim and a raked windscreen edge. Idle: the propeller spins inside a moderate motion-blur disc, the plane
 * banks and bobs, and faint air streaks slip off the wingtips.
 * Build-in: fuselage + cowl, lower wing, gear, upper wing, struts, then the tail rise and draw on
 * in a staggered sweep; the propeller arrives last and the engine "ignites" the focal lights.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  FAMILY,
  Part,
  circleSeg,
  easeInOut,
  hover,
  interleave,
  makeGlass,
  makeLines,
  makeMotes,
  polySeg,
  setLineDraw,
  win,
  type Piece,
  type Seg,
  type V3,
} from './vintage-parts/kit'

export const meta: ModelMeta = {
  title: 'Biplane (c. 1915)',
  distance: FAMILY.distance,
  elevation: FAMILY.elevation,
  azimuth: FAMILY.azimuth,
}

const YAW = -0.16 // near side-on: the far lower wingtip stays clear of the prop disc
const BANK = 0.1 // roll the wing tops slightly toward camera
const PITCH = 0.06 // a gentle climb
const SCALE = 1.16
const PX = 1.045 // propeller plane
const PR = 0.36 // propeller disc radius (moderate)
const PROP = '#ffc477' // warm amber, same as the car's lamps

// geometry anchors
const UY = 0.46 // upper wing top face (gap ~1.35x chord)
const LY = -0.135 // lower wing top face: roots into the fuselage belly
const WT = 0.026 // wing thickness
const AY = -0.47 // axle height
const AX = 0.36 // axle x
const WZ = 0.3 // wheel track (half)
const CPX = -0.19 // cockpit centre x, just behind the upper wing's trailing edge

/** Fuselage sections [x, halfWidth, top, bottom], nose to tail post. */
const SECTIONS: [number, number, number, number][] = [
  [0.82, 0.13, 0.14, -0.14],
  [0.34, 0.135, 0.165, -0.165],
  [-0.3, 0.12, 0.162, -0.14],
  [-1.22, 0.026, 0.112, 0.036],
]
/** Fuselage top height at x (linear between sections). */
function topAt(x: number) {
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    const a = SECTIONS[i]
    const b = SECTIONS[i + 1]
    if (x <= a[0] && x >= b[0]) return a[2] + ((x - a[0]) / (b[0] - a[0])) * (b[2] - a[2])
  }
  return SECTIONS[0][2]
}

const discVert = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const discFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uR;
  varying vec2 vP;
  void main() {
    float r = length(vP) / uR;
    float a = atan(vP.y, vP.x);
    // spinning-prop blur: two blades, each trailing a smooth decaying smear (periodic, no seam)
    float ph = mod(a - 1.5708, 3.14159);
    float trail = max(exp(-ph * 1.9), smoothstep(3.14159 - 0.3, 3.14159, ph));
    float prof = smoothstep(0.12, 0.32, r) * (1.0 - smoothstep(0.7, 1.0, r));
    float tip = exp(-pow((r - 0.9) / 0.04, 2.0)) * 0.045;
    gl_FragColor = vec4(uColor, (prof * (0.025 + 0.34 * trail) + tip) * uOpacity);
  }
`
// Cockpit pool: a smooth warm glow filling the opening with a soft bright rim (no noise).
const poolVert = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const poolFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    float rim = exp(-pow((r - 0.8) / 0.14, 2.0));
    float edge = 1.0 - smoothstep(0.92, 1.0, r);
    gl_FragColor = vec4(uColor, (0.6 * core + 0.7 * rim) * edge * uOpacity);
  }
`

export default function Biplane({ progress = 1 }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const craft = useRef<THREE.Group>(null)
  const prop = useRef<THREE.Group>(null)

  const parts = useMemo(() => {
    // ---- fuselage: boxy lofted body + round cowl --------------------------------------------
    const fus = loftBox(SECTIONS)
    const cowl = new THREE.CylinderGeometry(0.178, 0.198, 0.18, 36).rotateZ(-Math.PI / 2)
    const fuselage: Piece[] = [
      { geo: fus, m: 'body', edge: false },
      { geo: cowl, p: [0.91, 0, 0], m: 'body', edge: false },
    ]
    // longerons, hand-drawn so the near side carries full weight and the far side stays quiet
    const corner = (side: 1 | -1, top: boolean): V3[] => SECTIONS.map((s) => [s[0], top ? s[2] : s[3], side * s[1]])
    const fusLines: Seg = [
      ...polySeg(corner(1, true)),
      ...polySeg(corner(1, false)),
      // tail post
      ...polySeg([[-1.22, 0.112, 0.026], [-1.22, 0.036, 0.026]]),
      // cowl lip at full weight so the prop disc sits on a defined nose
      ...circleSeg([1.002, 0, 0], 0.18, 'x', 40),
    ]
    const fusSoft: Seg = [
      ...polySeg(corner(-1, true)),
      ...circleSeg([0.818, 0, 0], 0.2, 'x', 36), // cowl back edge
      ...polySeg(corner(-1, false)),
      ...polySeg([[-1.22, 0.112, -0.026], [-1.22, 0.036, -0.026]]),
      // stringer line along the near side: the classic fabric-fuselage longeron stripe
      ...polySeg(SECTIONS.map((s) => [s[0], s[2] - (s[2] - s[3]) * 0.42, s[1] + 0.002] as V3)),
    ]

    // ---- cockpit: dark opening, smooth warm pool, coaming ring, raked windscreen -------------
    const cpY = topAt(CPX)
    const CRX = 0.11
    const CRZ = 0.082
    const ellipse = (y: number, rx: number, rz: number, n = 32): V3[] =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2
        return [CPX + Math.cos(a) * rx, y, Math.sin(a) * rz] as V3
      })
    const coaming = new THREE.TorusGeometry(1, 0.13, 8, 36).rotateX(Math.PI / 2)
    const cockpitPieces: Piece[] = [{ geo: coaming, p: [CPX, cpY + 0.008, 0], s: [CRX, 0.11, CRZ], m: 'fabric', edge: false }]
    const wsBase = -0.05
    const wsTop = -0.1 // windscreen top leans back toward the tail
    const wsY0 = topAt(wsBase) + 0.004
    const wsY1 = wsY0 + 0.085
    const windscreen: V3[] = [
      [wsBase, wsY0, 0.072],
      [wsTop, wsY1, 0.058],
      [wsTop, wsY1, -0.058],
      [wsBase, wsY0, -0.072],
    ]
    const cockpitLines: Seg = polySeg(windscreen)
    // warm coaming rim: the cockpit's focal accent, brighter and a touch heavier than the linework
    const rimLine = makeLines(polySeg(ellipse(cpY + 0.022, CRX * 1.13, CRZ * 1.17, 40), true), false, false)
    ;(rimLine.material as unknown as { linewidth: number }).linewidth = 2.4
    ;(rimLine.material as unknown as { color: THREE.Color }).color.copy(glow('#ffc477', 4.5))
    const wsGeo = new THREE.BufferGeometry()
    wsGeo.setAttribute('position', new THREE.Float32BufferAttribute([...windscreen[0], ...windscreen[1], ...windscreen[2], ...windscreen[0], ...windscreen[2], ...windscreen[3]], 3))
    wsGeo.computeVertexNormals()
    const wsMat = makeGlass('#ffd9a0')

    // ---- wings: staggered, rounded-tip planforms ---------------------------------------------
    const wing = (span: number, chord: number) => {
      const s = new THREE.Shape()
      const r = chord * 0.45
      const z = span
      s.moveTo(0, -z + r)
      s.quadraticCurveTo(0, -z, r, -z)
      s.lineTo(chord - r, -z)
      s.quadraticCurveTo(chord, -z, chord, -z + r)
      s.lineTo(chord, z - r)
      s.quadraticCurveTo(chord, z, chord - r, z)
      s.lineTo(r, z)
      s.quadraticCurveTo(0, z, 0, z - r)
      s.closePath()
      const g = new THREE.ExtrudeGeometry(s, { depth: WT, bevelEnabled: false, curveSegments: 8 })
      g.rotateX(Math.PI / 2) // shape.y -> world z; extrusion -> -y
      return { g, s }
    }
    const topOutline = (sh: THREE.Shape, p: V3): Seg =>
      polySeg(sh.getPoints(10).map((v) => [p[0] + v.x, p[1] + 0.002, p[2] + v.y] as V3), true)
    const UPX = -0.02
    const LPX = -0.22
    const upper = wing(1.2, 0.44)
    const lower = wing(1.06, 0.43)
    const upperWing: Piece[] = [{ geo: upper.g, p: [UPX, UY, 0], m: 'fabric', edge: false }]
    const lowerWing: Piece[] = [{ geo: lower.g, p: [LPX, LY, 0], m: 'fabric', edge: false }]
    const upperLines = topOutline(upper.s, [UPX, UY, 0])
    const lowerLines = topOutline(lower.s, [LPX, LY, 0])
    const upperSoft: Seg = []
    for (const z of [-0.9, -0.6, -0.3, 0.3, 0.6, 0.9]) upperSoft.push(UPX + 0.03, UY + 0.002, z, UPX + 0.4, UY + 0.002, z)
    const lowerSoft: Seg = []
    for (const z of [-0.75, -0.45, 0.45, 0.75]) lowerSoft.push(LPX + 0.03, LY + 0.002, z, LPX + 0.36, LY + 0.002, z)

    // ---- struts: pure linework (a mesh this thin only hides its own glow) ---------------------
    const bays: [V3, V3][] = []
    for (const z of [0.84, -0.84]) {
      bays.push([[LPX + 0.32, LY, z], [UPX + 0.33, UY - WT, z]])
      bays.push([[LPX + 0.08, LY, z], [UPX + 0.09, UY - WT, z]])
    }
    const strutLines = interleave(bays.slice(0, 2), 8)
    const strutSoft: Seg = [...interleave(bays.slice(2), 8)]
    for (const z of [0.1]) {
      strutSoft.push(...polySeg([[0.3, topAt(0.3), z], [0.27, UY - WT, z * 1.4]]))
      strutSoft.push(...polySeg([[0.06, topAt(0.06), z], [0.08, UY - WT, z * 1.4]]))
    }

    // ---- tail: stabiliser + tall rounded fin/rudder ------------------------------------------
    const stab = new THREE.Shape()
    stab.moveTo(-0.86, 0.03)
    stab.quadraticCurveTo(-0.94, 0.35, -1.1, 0.34)
    stab.quadraticCurveTo(-1.25, 0.32, -1.25, 0.0)
    stab.quadraticCurveTo(-1.25, -0.32, -1.1, -0.34)
    stab.quadraticCurveTo(-0.94, -0.35, -0.86, -0.03)
    stab.closePath()
    const STY = 0.112
    const stabGeo = new THREE.ExtrudeGeometry(stab, { depth: 0.018, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2)
    const fin = new THREE.Shape()
    fin.moveTo(-0.9, topAt(-0.9))
    fin.quadraticCurveTo(-1.02, 0.22, -1.07, 0.48)
    fin.quadraticCurveTo(-1.12, 0.64, -1.24, 0.63)
    fin.quadraticCurveTo(-1.38, 0.6, -1.38, 0.36)
    fin.quadraticCurveTo(-1.36, 0.1, -1.24, 0.04) // rudder's lower corner ends at the tail-post foot
    fin.lineTo(-1.22, 0.112)
    fin.closePath()
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.022, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.011)
    const tail: Piece[] = [
      { geo: stabGeo, p: [0, STY + 0.018, 0], m: 'canvas', edge: false },
      { geo: finGeo, m: 'canvas', edge: false },
    ]
    const finPts = fin.getPoints(10)
    const tailLines: Seg = [
      ...polySeg(stab.getPoints(10).map((v) => [v.x, STY + 0.02, v.y] as V3), true),
      ...polySeg(finPts.slice(0, -1).map((v) => [v.x, v.y, 0.012] as V3)),
    ]
    const tailSoft: Seg = [
      ...polySeg([[-1.22, 0.115, 0.012], [-1.22, 0.6, 0.012]]), // rudder hinge
      ...polySeg(finPts.slice(0, -1).map((v) => [v.x, v.y, -0.012] as V3)),
    ]

    // ---- landing gear: V struts, axle, two wheels with rings outside the tire faces -----------
    const gearLines: Seg = []
    const gearSoft: Seg = []
    for (const s of [1, -1]) {
      const out = s > 0 ? gearLines : gearSoft
      out.push(...polySeg([[0.54, topAt(0.54) - 0.31, s * 0.1], [AX, AY, s * (WZ - 0.04)]]))
      out.push(...polySeg([[0.14, -0.16, s * 0.1], [AX, AY, s * (WZ - 0.04)]]))
    }
    gearLines.push(...polySeg([[AX, AY, -WZ + 0.04], [AX, AY, WZ - 0.04]]))
    const TR = 0.12
    const TT = 0.036
    const tire = new THREE.TorusGeometry(TR, TT, 10, 36)
    const hubDisc = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 28).rotateX(Math.PI / 2)
    const gear: Piece[] = []
    for (const s of [1, -1]) {
      gear.push({ geo: tire, p: [AX, AY, s * WZ], m: 'dark', edge: false })
      gear.push({ geo: hubDisc, p: [AX, AY, s * WZ], m: 'trim', edge: false })
      // rings on the camera-facing face of each wheel, just proud of the tire
      const fz = s * WZ + 0.042
      const out = s > 0 ? gearLines : gearSoft
      out.push(...circleSeg([AX, AY, fz], 0.146, 'z', 40))
      gearSoft.push(...circleSeg([AX, AY, s * WZ + 0.02], 0.045, 'z', 18))
    }

    // ---- propeller ----------------------------------------------------------------------------
    const spinner = new THREE.ConeGeometry(0.06, 0.08, 24).rotateZ(-Math.PI / 2)
    const blade = new THREE.BoxGeometry(0.03, 0.3, 0.06).translate(0, 0.19, 0)
    const bladeGeo = mergeTwo(blade, blade.clone().rotateX(Math.PI))
    const propPieces: Piece[] = [{ geo: spinner, p: [0.03, 0, 0], m: 'fabric', edge: false }]
    const bladeSeg: Seg = []
    for (const sgn of [1, -1]) {
      bladeSeg.push(
        ...polySeg([
          [0, 0.05 * sgn, 0.028],
          [0, 0.32 * sgn, 0.032],
          [0, 0.345 * sgn, 0],
          [0, 0.32 * sgn, -0.032],
          [0, 0.05 * sgn, -0.028],
        ]),
      )
    }
    const bladeLines = makeLines(bladeSeg, true, false)
    const bladeMat = new THREE.MeshStandardMaterial({ color: FAMILY.trim, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0, depthWrite: false })
    const discGeo = new THREE.CircleGeometry(PR, 64)
    const discMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(PROP, 2.6) }, uOpacity: { value: 0 }, uR: { value: PR } },
      vertexShader: discVert,
      fragmentShader: discFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    // ---- focal lights ------------------------------------------------------------------------
    const poolGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)
    const poolMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow('#ffa53a', 1.3) }, uOpacity: { value: 0 } },
      vertexShader: poolVert,
      fragmentShader: poolFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const openingMat = new THREE.MeshBasicMaterial({ color: '#05060c', transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    const glintMat = new THREE.MeshBasicMaterial({ color: glow('#ffc477', 2.4), toneMapped: false, transparent: true, opacity: 0 })

    // ---- air streaks off the wingtips and the prop -------------------------------------------
    const starts: V3[] = []
    const dirs: V3[] = []
    for (let i = 0; i < 28; i++) {
      const up = i % 2 === 0
      const z = (i % 4 < 2 ? 1 : -1) * (up ? 1.18 : 1.04)
      const y = up ? UY - 0.01 : LY - 0.01
      starts.push([(up ? UPX : LPX) + 0.1 + Math.random() * 0.2, y + (Math.random() - 0.5) * 0.04, z + (Math.random() - 0.5) * 0.05])
      dirs.push([-1.1 - Math.random() * 0.4, (Math.random() - 0.5) * 0.05, 0])
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.2 + Math.random() * 0.14
      starts.push([0.95, Math.sin(a) * r, Math.cos(a) * r])
      dirs.push([-1.4 - Math.random() * 0.4, Math.sin(a) * 0.05, Math.cos(a) * 0.05])
    }
    const motes = makeMotes(starts, dirs, 1.7, FAMILY.focal, 1.6)

    return {
      fuselage,
      fusLines,
      fusSoft,
      cockpitPieces,
      cockpitLines,
      rimLine,
      cpY,
      CRX,
      CRZ,
      wsGeo,
      wsMat,
      upperWing,
      lowerWing,
      upperLines,
      lowerLines,
      upperSoft,
      lowerSoft,
      strutLines,
      strutSoft,
      tail,
      tailLines,
      tailSoft,
      gear,
      gearLines,
      gearSoft,
      propPieces,
      spinSoft: circleSeg([-0.008, 0, 0], 0.062, 'x', 20),
      bladeGeo,
      bladeMat,
      bladeLines,
      discGeo,
      discMat,
      poolGeo,
      poolMat,
      openingMat,
      glintGeo: new THREE.SphereGeometry(0.026, 14, 10),
      glintMat,
      motes,
    }
  }, [])

  const ignite = easeInOut(win(progress, 0.5, 0.34))
  const bladeOp = easeInOut(win(progress, 0.38, 0.14))
  const cockpitIn = easeInOut(win(progress, 0.3, 0.3))

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    hover(root.current, t, 1.3, 1.2)
    if (craft.current) {
      craft.current.rotation.x = BANK + Math.sin(t * 0.55) * 0.06
      craft.current.rotation.z = PITCH + Math.sin(t * 0.8 + 0.6) * 0.022
    }
    if (prop.current) prop.current.rotation.x += dt * (2 + 26 * ignite)
    parts.discMat.uniforms.uOpacity.value = ignite
    parts.bladeMat.opacity = bladeOp * (1 - 0.82 * ignite)
    setLineDraw(parts.bladeLines, bladeOp, 1 - 0.8 * ignite) // a faint two-blade ghost stays inside the disc
    parts.glintMat.opacity = ignite
    const flick = 0.9 + 0.1 * Math.sin(t * 1.7)
    parts.poolMat.uniforms.uOpacity.value = ignite * flick
    setLineDraw(parts.rimLine, cockpitIn, 0.55 + 0.45 * ignite * flick)
    parts.openingMat.opacity = cockpitIn
    parts.wsMat.uniforms.uOpacity.value = cockpitIn
    parts.wsMat.uniforms.uTime.value = t
    const mm = parts.motes.material as THREE.ShaderMaterial
    mm.uniforms.uTime.value = t * 1.6
    mm.uniforms.uOpacity.value = ignite * 0.6
  })

  return (
    <group ref={root}>
      <group rotation-y={YAW}>
        <group ref={craft} position={[0.04, -0.02, 0]} rotation={[BANK, 0, PITCH]} scale={SCALE}>
          <Part progress={progress} start={0.0} pieces={parts.fuselage} subdivide={0.12} lines={parts.fusLines} soft={parts.fusSoft} />
          <Part progress={progress} start={0.07} pieces={parts.lowerWing} subdivide={0.12} lines={parts.lowerLines} soft={parts.lowerSoft} />
          <Part progress={progress} start={0.12} pieces={parts.gear} lines={parts.gearLines} soft={parts.gearSoft} />
          <Part progress={progress} start={0.24} rise={0.6} pieces={parts.upperWing} subdivide={0.12} lines={parts.upperLines} soft={parts.upperSoft} />
          <Part progress={progress} start={0.3} lines={parts.strutLines} sortLines={false} soft={parts.strutSoft} />
          <Part progress={progress} start={0.34} rise={0.5} pieces={parts.tail} subdivide={0.1} lines={parts.tailLines} soft={parts.tailSoft} />
          <Part progress={progress} start={0.28} pieces={parts.cockpitPieces} lines={parts.cockpitLines}>
            <mesh geometry={parts.poolGeo} material={parts.openingMat} position={[CPX, parts.cpY + 0.004, 0]} scale={[parts.CRX, 1, parts.CRZ]} />
            <mesh geometry={parts.poolGeo} material={parts.poolMat} position={[CPX, parts.cpY + 0.008, 0]} scale={[parts.CRX, 1, parts.CRZ]} />
            <primitive object={parts.rimLine} />
            <mesh geometry={parts.wsGeo} material={parts.wsMat} />
          </Part>
          <Part progress={progress} start={0.36} pieces={parts.propPieces} soft={parts.spinSoft} position={[PX, 0, 0]} innerRef={prop}>
            <mesh geometry={parts.discGeo} material={parts.discMat} rotation-y={Math.PI / 2} position-x={0.012} />
            <mesh geometry={parts.bladeGeo} material={parts.bladeMat} />
            <primitive object={parts.bladeLines} />
            <mesh geometry={parts.glintGeo} material={parts.glintMat} position-x={0.09} />
          </Part>
          <primitive object={parts.motes} />
        </group>
      </group>
    </group>
  )
}

/** Lofted box through rectangular sections [x, halfWidth, top, bottom] (x descending). */
function loftBox(sections: [number, number, number, number][]) {
  const pos: number[] = []
  const quad = (a: V3, b: V3, c: V3, d: V3) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  const ring = (s: [number, number, number, number]): V3[] => [
    [s[0], s[2], s[1]],
    [s[0], s[2], -s[1]],
    [s[0], s[3], -s[1]],
    [s[0], s[3], s[1]],
  ]
  for (let i = 0; i < sections.length - 1; i++) {
    const A = ring(sections[i])
    const B = ring(sections[i + 1])
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4
      quad(A[k], A[k2], B[k2], B[k])
    }
  }
  const l = ring(sections[sections.length - 1])
  quad(l[0], l[1], l[2], l[3])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const A = a.toNonIndexed()
  const B = b.toNonIndexed()
  const out = new THREE.BufferGeometry()
  const cat = (k: string) => {
    const x = A.attributes[k].array as Float32Array
    const y = B.attributes[k].array as Float32Array
    const r = new Float32Array(x.length + y.length)
    r.set(x)
    r.set(y, x.length)
    return new THREE.BufferAttribute(r, 3)
  }
  out.setAttribute('position', cat('position'))
  out.setAttribute('normal', cat('normal'))
  return out
}
