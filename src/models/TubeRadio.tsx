/**
 * TubeRadio: a 1930s "cathedral" tabletop tube radio, one of four "vintage invention" icons
 * (1905–1955 slide). Faces +z.
 * Idle: the tubes glow warm behind gothic fretwork and woven grille cloth, the dial window
 * pulses, and faint arched sound-wave rings emanate from the grille.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  FAMILY,
  Part,
  boxPiece,
  circleSeg,
  easeInOut,
  hover,
  makeLines,
  makeMotes,
  polySeg,
  shapeOutline,
  win,
  type Piece,
  type Seg,
  type V3,
} from './vintage-parts/kit'

export const meta: ModelMeta = {
  title: 'Cathedral tube radio (c. 1932)',
  distance: FAMILY.distance,
  elevation: FAMILY.elevation,
  azimuth: FAMILY.azimuth,
}

// Cabinet outline (front view)
const W = 0.6 // half width
const Y0 = -0.8
const YS = 0.14 // where the arch springs
const ARCH = 0.66 // arch rise
const D = 0.24 // half depth
const FZ = D // front face z
/** Turn the face toward the right (the direction of the timeline), like the car and plane. */
const FACE = 0.95

// Grille opening
const GW = 0.4
const GY0 = -0.14
const GYS = 0.2
const GARCH = 0.42

/** Gothic (slightly pointed) arch half-profile: y at x for an arch of half-width w, rise h. */
function archY(x: number, w: number, ys: number, h: number) {
  const u = Math.min(1, Math.abs(x) / w)
  // superellipse-ish with a soft point
  return ys + h * Math.pow(1 - Math.pow(u, 2.2), 0.62)
}

function archShape(w: number, y0: number, ys: number, h: number, n = 64) {
  const s = new THREE.Shape()
  s.moveTo(-w, y0)
  s.lineTo(w, y0)
  s.lineTo(w, ys)
  for (let i = 1; i <= n; i++) {
    const x = w - (2 * w * i) / n
    s.lineTo(x, archY(x, w, ys, h))
  }
  s.lineTo(-w, y0)
  return s
}
function archPoly(w: number, y0: number, ys: number, h: number, n = 64) {
  return archShape(w, y0, ys, h, n).getPoints().map((p) => new THREE.Vector2(p.x, p.y))
}
function inside(poly: THREE.Vector2[], x: number, y: number) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}
/** Clip a 2D line to a polygon by sampling; returns merged inside intervals as segments. */
function clipLine(poly: THREE.Vector2[], ax: number, ay: number, bx: number, by: number, z: number, steps = 160): Seg {
  const out: Seg = []
  let start: [number, number] | null = null
  let last: [number, number] = [ax, ay]
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t
    const ins = inside(poly, x, y)
    if (ins && !start) start = [x, y]
    if (!ins && start) {
      out.push(start[0], start[1], z, last[0], last[1], z)
      start = null
    }
    last = [x, y]
  }
  if (start) out.push(start[0], start[1], z, last[0], last[1], z)
  return out
}

const clothVert = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const clothFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uI; uniform float uTime;
  varying vec2 vP;
  void main() {
    // warm tube glow pooled low behind the cloth
    vec2 c = vec2(0.0, -0.02);
    float d = length((vP - c) * vec2(1.25, 1.0));
    float g = exp(-d * d * 7.0);
    float flick = 0.92 + 0.08 * sin(uTime * 2.3) * sin(uTime * 3.7 + 1.0);
    gl_FragColor = vec4(uColor * (0.05 + g * 0.95) * uI * flick, 1.0);
  }
`
const dialVert = clothVert
const dialFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uR;
  varying vec2 vP;
  void main() {
    vec2 p = vP / uR;           // centred on the dial pivot, radius 1 = window edge
    float r = length(p);
    float a = atan(p.x, p.y);   // 0 straight up, +-1.25 at the ends
    vec3 col = uColor * (0.75 + 0.35 * (1.0 - r));
    // tick ring
    float tick = (1.0 - smoothstep(0.0, 0.09, abs(fract(a * 6.0 + 0.5) - 0.5)));
    float band = smoothstep(0.55, 0.6, r) * (1.0 - smoothstep(0.88, 0.92, r));
    col *= 1.0 - tick * band * 0.75;
    // needle sweeping slowly
    float na = 0.55 * sin(uTime * 0.35);
    vec2 nd = vec2(sin(na), cos(na));
    float along = dot(p, nd);
    float off = abs(p.x * nd.y - p.y * nd.x);
    float needle = (1.0 - smoothstep(0.02, 0.06, off)) * step(0.0, along) * step(along, 0.92);
    col *= 1.0 - needle * 0.95;
    gl_FragColor = vec4(col * uI, 1.0);
  }
`

export default function TubeRadio({ progress = 1 }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const rings = useRef<THREE.Group>(null)

  const parts = useMemo(() => {
    // ---- cabinet --------------------------------------------------------------------------
    const cabShape = archShape(W, Y0, YS, ARCH, 72)
    const cabGeo = new THREE.ExtrudeGeometry(cabShape, { depth: 2 * D, bevelEnabled: false, curveSegments: 1 })
    cabGeo.translate(0, 0, -D)
    const cabSmooth = toCreasedNormals(cabGeo, 0.5)
    const cabinet: Piece[] = [
      { geo: cabSmooth, m: 'fabric', edge: 30 },
      boxPiece(-W - 0.05, W + 0.05, Y0 - 0.07, Y0 + 0.01, -D - 0.04, D + 0.04, 'trim', 30), // plinth
    ]
    // back panel: inset outline + vent louvres, so the turnaround isn't a blank slab
    const backSoft: Seg = [...shapeOutline(archShape(W - 0.1, Y0 + 0.1, YS, ARCH - 0.1, 72), -D - 0.002, 120)]
    for (let i = 0; i < 6; i++) {
      const y = -0.05 + i * 0.07
      backSoft.push(-0.28, y, -D - 0.003, 0.28, y, -D - 0.003)
    }

    // ---- front molding (raised arch frame with the grille opening cut out) ----------------
    const mold = archShape(W - 0.07, Y0 + 0.07, YS, ARCH - 0.07, 72)
    const hole = archShape(GW, GY0, GYS, GARCH, 64)
    mold.holes.push(new THREE.Path(hole.getPoints()))
    const moldGeo = new THREE.ExtrudeGeometry(mold, { depth: 0.035, bevelEnabled: false, curveSegments: 1 })
    const molding: Piece[] = [{ geo: moldGeo, p: [0, 0, FZ], m: 'body', edge: 30 }]

    // ---- fretwork bars (gothic lancets) ---------------------------------------------------
    const fret: Piece[] = []
    const fretLines: Seg = []
    const BZ = FZ + 0.018
    for (const x of [-0.2, 0, 0.2]) {
      const top = archY(x, GW, GYS, GARCH) - 0.01
      fret.push(boxPiece(x - 0.022, x + 0.022, GY0, top, BZ - 0.012, BZ + 0.012, 'body', false))
      fretLines.push(...polySeg([[x - 0.022, GY0, BZ + 0.013], [x - 0.022, top, BZ + 0.013]]))
      fretLines.push(...polySeg([[x + 0.022, GY0, BZ + 0.013], [x + 0.022, top, BZ + 0.013]]))
    }
    // pointed lancet heads between the bars
    const lancet = (x0: number, x1: number): V3[] => {
      const yb = GYS + 0.06
      const pts: V3[] = []
      for (let i = 0; i <= 12; i++) {
        const t = i / 12
        const x = x0 + (x1 - x0) * t
        const y = yb + 0.12 * Math.pow(Math.sin(Math.PI * t), 0.7)
        pts.push([x, Math.min(y, archY(x, GW, GYS, GARCH) - 0.02), BZ + 0.013])
      }
      return pts
    }
    fretLines.push(...polySeg(lancet(-0.178, -0.022)), ...polySeg(lancet(0.022, 0.178)))
    // horizontal rail across the fretwork
    fret.push(boxPiece(-GW, GW, GY0 + 0.14, GY0 + 0.17, BZ - 0.012, BZ + 0.012, 'body', false))
    fretLines.push(...polySeg([[-GW, GY0 + 0.17, BZ + 0.013], [GW, GY0 + 0.17, BZ + 0.013]]))

    // ---- grille cloth: back-lit panel + woven hatch linework --------------------------------
    const gPoly = archPoly(GW, GY0, GYS, GARCH, 64)
    const clothGeo = new THREE.ShapeGeometry(archShape(GW, GY0, GYS, GARCH, 64))
    const clothMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(palette.ember, 0.4) }, uI: { value: 0 }, uTime: { value: 0 } },
      vertexShader: clothVert,
      fragmentShader: clothFrag,
      toneMapped: false,
    })
    const hatch: Seg = []
    const CZ = FZ + 0.004
    const step = 0.06
    for (let k = -1.4; k <= 1.4; k += step) {
      hatch.push(...clipLine(gPoly, k - 0.7, -0.4, k + 0.7, 1.0, CZ))
      hatch.push(...clipLine(gPoly, k + 0.7, -0.4, k - 0.7, 1.0, CZ))
    }
    const hatchLines = makeLines(hatch, true)
    ;(hatchLines.material as LineMaterial).linewidth = 0.8
    ;(hatchLines.material as LineMaterial).color.copy(glow(palette.ember, 0.6))

    // ---- dial window ----------------------------------------------------------------------
    const DY = -0.4 // pivot
    const DR = 0.18
    const dialShape = new THREE.Shape()
    dialShape.moveTo(-DR, 0)
    dialShape.absarc(0, 0, DR, Math.PI, 0, true)
    dialShape.lineTo(-DR, 0)
    const dialGeo = new THREE.ShapeGeometry(dialShape, 32)
    const dialMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(palette.ember, 1.3) }, uI: { value: 0 }, uTime: { value: 0 }, uR: { value: DR } },
      vertexShader: dialVert,
      fragmentShader: dialFrag,
      toneMapped: false,
    })
    // escutcheon around the dial
    const esc = new THREE.Shape()
    esc.moveTo(-DR - 0.05, -0.05)
    esc.lineTo(-DR - 0.05, 0)
    esc.absarc(0, 0, DR + 0.05, Math.PI, 0, true)
    esc.lineTo(DR + 0.05, -0.05)
    esc.closePath()
    const escHole = new THREE.Path()
    escHole.moveTo(-DR, 0)
    escHole.absarc(0, 0, DR, Math.PI, 0, true)
    escHole.lineTo(-DR, 0)
    esc.holes.push(escHole)
    const escGeo = new THREE.ExtrudeGeometry(esc, { depth: 0.03, bevelEnabled: false, curveSegments: 24 })
    const dial: Piece[] = [{ geo: escGeo, p: [0, DY, FZ + 0.035], m: 'trim', edge: 30 }]

    // ---- knobs ----------------------------------------------------------------------------
    const knob = new THREE.CylinderGeometry(0.055, 0.062, 0.07, 24).rotateX(Math.PI / 2)
    const knobs: Piece[] = []
    const knobLines: Seg = []
    const KY = -0.62
    for (const [x, ka] of [[-0.3, -0.6], [0, 0.25], [0.3, 0.9]] as const) {
      const r = (x === 0 ? 0.045 : 0.055) * 1.3
      knobs.push({ geo: knob, p: [x, KY, FZ + 0.07], s: [r / 0.055, r / 0.055, 1], m: 'trim', edge: false })
      knobLines.push(...circleSeg([x, KY, FZ + 0.106], r, 'z', 24))
      knobLines.push(...polySeg([[x, KY, FZ + 0.107], [x + Math.sin(ka) * r * 0.8, KY + Math.cos(ka) * r * 0.8, FZ + 0.107]]))
    }

    // ---- sound waves: ~110 deg arcs over the grille, fading at their ends ---------------------
    const A0 = Math.PI * 0.2
    const A1 = Math.PI * 0.8
    const arc: Seg = circleSeg([0, 0, 0], 0.5, 'z', 40, A0, A1)
    const arcCols = new Float32Array(arc.length)
    for (let i = 0; i < arc.length; i += 3) {
      const a = Math.atan2(arc[i + 1], arc[i])
      const u = (a - A0) / (A1 - A0)
      const f = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 1.4)
      arcCols[i] = arcCols[i + 1] = arcCols[i + 2] = f
    }
    const ringObjs: LineSegments2[] = [0, 1, 2].map(() => {
      const l = makeLines(arc, true, false)
      l.geometry.setColors(arcCols)
      const m = l.material as LineMaterial
      m.vertexColors = true
      m.blending = THREE.AdditiveBlending
      m.color.copy(glow(palette.ember, 2.4))
      m.linewidth = 1.65
      l.geometry.instanceCount = Infinity
      return l
    })

    // ---- warm motes rising out of the grille (tube heat) ----------------------------------
    const starts: V3[] = []
    const dirs: V3[] = []
    for (let i = 0; i < 26; i++) {
      starts.push([(Math.random() - 0.5) * 0.6, GY0 + 0.1 + Math.random() * 0.3, FZ + 0.06])
      dirs.push([(Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.3, 0.35 + Math.random() * 0.3])
    }
    const motes = makeMotes(starts, dirs, 1.8, FAMILY.focal, 1.8)

    return {
      cabinet,
      molding,
      backSoft,
      fret,
      fretLines,
      clothGeo,
      clothMat,
      hatchLines,
      dial,
      dialGeo,
      dialMat,
      DY,
      knobs,
      knobLines,
      ringObjs,
      motes,
    }
  }, [])

  const ignite = easeInOut(win(progress, 0.62, 0.34))
  const dialEarly = easeInOut(win(progress, 0.22, 0.2))
  const clothT = easeInOut(win(progress, 0.36, 0.4))
  parts.hatchLines.geometry.instanceCount = Math.floor((parts.hatchLines.userData.count as number) * clothT)
  parts.hatchLines.visible = clothT > 0

  useFrame((state) => {
    const t = state.clock.elapsedTime
    hover(root.current, t, 2.6, 0.8)
    const pulse = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2)) + 0.05 * Math.sin(t * 9.0)
    parts.dialMat.uniforms.uI.value = Math.max(dialEarly * 0.3, ignite * pulse)
    parts.dialMat.uniforms.uTime.value = t
    parts.clothMat.uniforms.uI.value = Math.max(clothT * 0.08, ignite * (0.75 + 0.25 * pulse))
    parts.clothMat.uniforms.uTime.value = t
    // rings: expand outward from the grille and fade
    parts.ringObjs.forEach((l, i) => {
      const ph = (t * 0.32 + i / 3) % 1
      const s = 1.25 + ph * 1.0
      l.scale.set(s, s, 1)
      l.position.set(0, 0.2, FZ + 0.06 + ph * 0.3)
      ;(l.material as LineMaterial).opacity = ignite * clothT * Math.pow(Math.sin(Math.PI * ph), 1.5) * 0.95 * (1 - ph * 0.35)
      l.visible = ignite > 0.01
    })
    const mm = parts.motes.material as THREE.ShaderMaterial
    mm.uniforms.uTime.value = t
    mm.uniforms.uOpacity.value = ignite * 0.6
  })

  return (
    <group ref={root}>
      <group position={[0, 0.02, 0]} rotation-y={FACE}>
        <Part progress={progress} start={0.02} pieces={parts.cabinet} soft={parts.backSoft} />
        <Part progress={progress} start={0.12} pieces={parts.molding} />
        <Part progress={progress} start={0.3} pieces={[]}>
          <mesh geometry={parts.clothGeo} material={parts.clothMat} position-z={FZ + 0.002} />
          <primitive object={parts.hatchLines} />
        </Part>
        <Part progress={progress} start={0.4} pieces={parts.fret} lines={parts.fretLines} />
        <Part progress={progress} start={0.18} pieces={parts.dial}>
          <mesh geometry={parts.dialGeo} material={parts.dialMat} position={[0, parts.DY, FZ + 0.04]} />
        </Part>
        <Part progress={progress} start={0.22} pieces={parts.knobs} lines={parts.knobLines} />
        <group ref={rings}>
          {parts.ringObjs.map((l, i) => (
            <primitive key={i} object={l} />
          ))}
        </group>
        <primitive object={parts.motes} />
      </group>
    </group>
  )
}
