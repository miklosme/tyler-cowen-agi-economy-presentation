/**
 * StatusStaircase: "Status is about to be remixed."
 *
 * intact  — five monumental floating slabs ascend left to right, gold-lit, with a proud little
 *           briefcase-carrying mannequin on the summit (the old ladder).
 * remixed — the slabs drift, tilt and fall out of order, the gold cools to slate, the summit
 *           figure tumbles to a low slab, and a new irregular path of ice-cyan stepping stones
 *           grows up and to the left, higher than the old summit, with a glowing climber on it.
 *
 * Everything is a function of one smoothed remix amount `m` (0 = intact, 1 = remixed), so the
 * slide can switch variants at any time and the change always animates.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'Status staircase',
  distance: 5.8,
  elevation: 12,
  azimuth: 18,
  variants: ['intact', 'remixed'],
}

// ---------------------------------------------------------------------------------------------
// Layout

const SLAB = { w: 0.46, h: 0.19, d: 0.68 }
const STEPS = 5
const intactPos = (i: number): [number, number, number] => [-0.96 + i * 0.48, -0.74 + i * 0.33, 0]

/** Model-space positions just above and in front of each intact step (for HTML labels). */
export const STEP_ANCHORS: [number, number, number][] = Array.from({ length: STEPS }, (_, i) => {
  const [x, y, z] = intactPos(i)
  return [x, y + SLAB.h / 2 + 0.06, z + SLAB.d / 2 + 0.08]
})

// Where each old slab ends up in the remixed state (position + euler), deliberately out of order.
const REMIX: { p: [number, number, number]; r: [number, number, number] }[] = [
  { p: [-1.1, -1.36, 0.05], r: [0.4, 0.6, -0.3] },
  { p: [0.24, -0.9, 0.3], r: [0.28, -0.2, 0.05] }, // the figure lands here, tipped toward the camera
  { p: [0.74, -1.0, -0.3], r: [0.45, 0.35, -0.55] },
  { p: [1.2, -0.52, 0.16], r: [-0.6, -0.6, 0.5] },
  { p: [0.5, -0.14, -0.66], r: [-0.3, 0.5, -0.7] },
]

// The initiative-takers' path: small irregular stones rising up and to the left.
const STONES: { p: [number, number, number]; s: [number, number, number]; ry: number }[] = [
  { p: [-0.44, -0.58, 0.5], s: [0.19, 0.085, 0.19], ry: 0.3 },
  { p: [-0.7, -0.3, 0.6], s: [0.16, 0.08, 0.17], ry: 1.1 },
  { p: [-0.5, -0.08, 0.72], s: [0.15, 0.075, 0.15], ry: 2.0 },
  { p: [-0.88, 0.16, 0.55], s: [0.17, 0.08, 0.16], ry: 0.7 },
  { p: [-0.74, 0.42, 0.68], s: [0.15, 0.075, 0.15], ry: 2.6 },
  { p: [-1.02, 0.68, 0.52], s: [0.17, 0.08, 0.17], ry: 1.6 },
  { p: [-1.4, 1.2, 0.46], s: [0.17, 0.08, 0.17], ry: 0.2 },
]
const CLIMBER_STONE = 5

// ---------------------------------------------------------------------------------------------
// Helpers

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))
const smooth = (t: number) => t * t * (3 - 2 * t)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number) => {
  const c = 1.6
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

const spriteVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = aAlpha;
    gl_PointSize = aSize * uScale / -mv.z;
  }
`
const spriteFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a;
    gl_FragColor = vec4(uColor, a * vA * uOpacity);
  }
`

function makeSprites(count: number, color: THREE.Color, scale: number) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uOpacity: { value: 1 }, uScale: { value: scale } },
    vertexShader: spriteVertex,
    fragmentShader: spriteFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  return { geometry, material }
}

// ---------------------------------------------------------------------------------------------
// The mannequin

const FIG_SCALE = 1.28
const CLIMBER_SCALE = 1.15

/** Luminous-instrument figure skin: a dim core with a bright fresnel rim (reads as lit glass). */
function makeFigureMaterial(core: THREE.Color, rim: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: core }, uRim: { value: rim }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore; uniform vec3 uRim; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0), 1.8);
        float top = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = uCore * (0.45 + 0.9 * top) + uRim * f;
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
    transparent: true,
    toneMapped: false,
  })
}

type FigureRig = {
  briefcase: THREE.Group | null
  root: THREE.Group
  body: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
}

/** Abstract faceless mannequin, ~0.32 tall, pivot at its centre (feet at y = -0.16). */
function buildFigure(material: THREE.Material, briefcase: THREE.Material | null): FigureRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = -0.16
  root.add(body)

  const limb = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10)

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.032, 0.11, 14), material)
  torso.position.y = 0.205
  body.add(torso)
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), material)
  shoulders.scale.set(1, 0.42, 0.62)
  shoulders.position.y = 0.258
  body.add(shoulders)
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), material)
  pelvis.scale.set(1.1, 0.7, 0.8)
  pelvis.position.y = 0.15
  body.add(pelvis)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.03, 8), material)
  neck.position.y = 0.278
  body.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.031, 18, 14), material)
  head.scale.set(0.92, 1.1, 1)
  head.position.y = 0.315
  body.add(head)

  const leg = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.15, 0)
    const m = new THREE.Mesh(limb(0.017, 0.115), material)
    m.position.y = -0.074
    g.add(m)
    body.add(g)
    return g
  }
  const arm = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.25, 0)
    const m = new THREE.Mesh(limb(0.0125, 0.095), material)
    m.position.y = -0.058
    g.add(m)
    body.add(g)
    return g
  }
  const legL = leg(-0.021)
  const legR = leg(0.021)
  const armL = arm(-0.058)
  const armR = arm(0.058)
  armL.rotation.z = -0.18
  armR.rotation.z = 0.12

  let bcGroup: THREE.Group | null = null
  if (briefcase) {
    bcGroup = new THREE.Group()
    const bc = new THREE.Mesh(new RoundedBoxGeometry(0.088, 0.064, 0.026, 2, 0.007), briefcase)
    bcGroup.add(bc)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 12, Math.PI), briefcase)
    handle.position.set(0, 0.032, 0)
    bcGroup.add(handle)
    bcGroup.position.set(0.014, -0.15, 0)
    armR.add(bcGroup)
    // a sliver of tie: the executive tell
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.075, 4), briefcase)
    tie.rotation.x = Math.PI
    tie.scale.z = 0.35
    tie.position.set(0, 0.215, 0.047)
    body.add(tie)
  }
  return { root, body, legL, legR, armL, armR, briefcase: bcGroup }
}

// ---------------------------------------------------------------------------------------------

export default function StatusStaircase({ progress = 1, accent, variant = 'intact' }: ModelProps) {
  const target = variant === 'remixed' ? 1 : 0
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  // Remix state. Starts at the requested variant so stills show it; afterwards it eases.
  const mRaw = useRef(target)
  const m = useRef(target)
  const time = useRef(0)

  const P = useMemo(() => {
    const gold = new THREE.Color(accent ?? palette.ember)
    const goldLine = glow(`#${gold.getHexString()}`, 1.9)
    const goldLip = new THREE.Color(gold).lerp(new THREE.Color('#ffffff'), 0.3).multiplyScalar(1.7)
    const coolLine = new THREE.Color('#9a8a70').lerp(gold, 0.2).multiplyScalar(2.3)
    const ash = new THREE.Color('#a08c70')
    
    const coolLip = new THREE.Color(gold).lerp(new THREE.Color('#9a9488'), 0.45).multiplyScalar(1.05)
    const iceLine = glow(palette.ice, 2.5)
    const iceLineHot = glow(palette.ice, 3.8)

    // --- old slabs ---------------------------------------------------------------------
    const slabGeo = new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.d, 3, 0.018)
    const slabEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(SLAB.w * 1.004, SLAB.h * 1.004, SLAB.d * 1.004))
    const lipGeo = new THREE.BoxGeometry(SLAB.w * 0.98, 0.012, 0.012)
    // top glow sheen: a gradient quad lying on each slab's top face, brightest toward the front lip
    const sheenGeo = new THREE.PlaneGeometry(SLAB.w * 0.94, SLAB.d * 0.9)
    sheenGeo.rotateX(-Math.PI / 2)
    const sheenMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(gold).multiplyScalar(1.4) }, uAmt: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAmt; varying vec2 vUv;
        void main() {
          float front = pow(1.0 - vUv.y, 0.0) * smoothstep(0.0, 1.0, 1.0 - vUv.y);
          float side = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float a = (0.08 + 0.32 * pow(front, 3.0)) * side * uAmt;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })

    const bodyMat = new THREE.MeshStandardMaterial({ color: '#141a2e', metalness: 0.78, roughness: 0.32 })
    // faint warm face shading so the slabs read as solid satin, not hollow wire boxes
    const shellMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.13, 0.09, 0.055) }, uAmt: { value: 0.5 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vY = clamp(position.y / ${SLAB.h.toFixed(3)} + 0.5, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAmt;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0);
          vec3 col = uColor * (0.35 + 1.2 * fres) * (0.55 + 0.45 * vY) * uAmt;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })

    const slabs = Array.from({ length: STEPS }, () => {
      const group = new THREE.Group()
      const body = new THREE.Mesh(slabGeo, bodyMat)
      group.add(body)
      const shell = new THREE.Mesh(slabGeo, shellMat)
      shell.scale.setScalar(1.003)
      group.add(shell)
      const edgeMat = new THREE.LineBasicMaterial({ color: goldLine.clone(), transparent: true, toneMapped: false })
      const edges = new THREE.LineSegments(slabEdgeGeo, edgeMat)
      group.add(edges)
      const lipMat = new THREE.MeshBasicMaterial({ color: goldLip.clone(), toneMapped: false, transparent: true })
      const lip = new THREE.Mesh(lipGeo, lipMat)
      lip.position.set(0, SLAB.h / 2 + 0.001, SLAB.d / 2 + 0.001)
      group.add(lip)
      const sheen = new THREE.Mesh(sheenGeo, sheenMat)
      sheen.position.y = SLAB.h / 2 + 0.003
      group.add(sheen)
      return { group, edgeMat, lipMat, lip, edges }
    })

    // --- figures -------------------------------------------------------------------------
    const oldFigMat = makeFigureMaterial(new THREE.Color(gold).multiplyScalar(0.13), new THREE.Color(gold).multiplyScalar(2.8))
    const caseMat = makeFigureMaterial(new THREE.Color(gold).multiplyScalar(0.55), new THREE.Color(gold).multiplyScalar(2.6))
    const oldFig = buildFigure(oldFigMat, caseMat)
    oldFig.root.scale.setScalar(FIG_SCALE)

    const newFigMat = makeFigureMaterial(new THREE.Color(palette.ice).multiplyScalar(0.2), glow(palette.ice, 3.8))
    const newFig = buildFigure(newFigMat, null)
    // climbing pose: stepping up and left, reaching for the next stone
    newFig.root.rotation.y = -Math.PI / 2 + 0.35
    newFig.body.rotation.x = 0.22
    newFig.legL.rotation.x = -1.15
    newFig.legR.rotation.x = 0.42
    newFig.armR.rotation.x = -2.55
    newFig.armL.rotation.x = 0.7
    newFig.armL.rotation.z = -0.1

    // --- the new path ----------------------------------------------------------------------
    // faceted stepping stone: a tapered 7-sided prism, flat top, jittered rim
    const stoneGeo = new THREE.CylinderGeometry(1, 0.72, 1, 7, 1).toNonIndexed()
    {
      const pos = stoneGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        const a = Math.atan2(z, x)
        const r = 1 + Math.sin(a * 3 + 1.3) * 0.09 + Math.cos(a * 5 - 0.4) * 0.06
        pos.setXYZ(i, x * r, pos.getY(i), z * r)
      }
      stoneGeo.computeVertexNormals()
    }
    // split the edges: the top rim carries the silhouette, side seams and bottom ring stay quiet
    const allEdges = new THREE.EdgesGeometry(stoneGeo, 25).getAttribute('position') as THREE.BufferAttribute
    const topPts: number[] = []
    const sidePts: number[] = []
    for (let i = 0; i < allEdges.count; i += 2) {
      const isTop = allEdges.getY(i) > 0.49 && allEdges.getY(i + 1) > 0.49
      const dst = isTop ? topPts : sidePts
      for (const k of [i, i + 1]) dst.push(allEdges.getX(k), allEdges.getY(k), allEdges.getZ(k))
    }
    const stoneTopEdge = new THREE.BufferGeometry()
    stoneTopEdge.setAttribute('position', new THREE.Float32BufferAttribute(topPts, 3))
    const stoneSideEdge = new THREE.BufferGeometry()
    stoneSideEdge.setAttribute('position', new THREE.Float32BufferAttribute(sidePts, 3))
    const capGeo = new THREE.CircleGeometry(0.84, 28)
    capGeo.rotateX(-Math.PI / 2)
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#141d2e', metalness: 0.72, roughness: 0.34 })
    const stones = STONES.map((_, j) => {
      const group = new THREE.Group()
      const mesh = new THREE.Mesh(stoneGeo, stoneMat)
      group.add(mesh)
      const lineMat = new THREE.LineBasicMaterial({ color: iceLine.clone(), transparent: true, toneMapped: false })
      const lines = new THREE.LineSegments(stoneTopEdge, lineMat)
      lines.scale.setScalar(1.01)
      group.add(lines)
      const seamMat = new THREE.LineBasicMaterial({ color: new THREE.Color(iceLine).multiplyScalar(0.45), transparent: true, toneMapped: false })
      const seams = new THREE.LineSegments(stoneSideEdge, seamMat)
      seams.scale.setScalar(1.01)
      group.add(seams)
      const isGoal = j === STONES.length - 1
      const capMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(palette.ice).multiplyScalar(isGoal ? 0.75 : 0.4) }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uOpacity; varying vec2 vP;
          void main() {
            float r = clamp(length(vP) / 0.84, 0.0, 1.0);
            gl_FragColor = vec4(uColor * (0.45 + 0.55 * r * r) * uOpacity, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      const cap = new THREE.Mesh(capGeo, capMat)
      cap.position.y = 0.505
      group.add(cap)
      return { group, lineMat, seamMat, capMat }
    })

    // path curve across the stone tops
    const pathPts = STONES.map((s) => new THREE.Vector3(s.p[0], s.p[1] + s.s[1] * 0.5 + 0.03, s.p[2]))
    const curve = new THREE.CatmullRomCurve3(pathPts, false, 'centripetal')
    const TRAIL = 90
    const trail = makeSprites(TRAIL, glow(palette.ice, 2.2), 1)
    {
      const pos = trail.geometry.getAttribute('position') as THREE.BufferAttribute
      const size = trail.geometry.getAttribute('aSize') as THREE.BufferAttribute
      for (let i = 0; i < TRAIL; i++) {
        const p = curve.getPointAt(i / (TRAIL - 1))
        // a gentle arc between stones so it reads as hops, not a ramp
        const local = (i / (TRAIL - 1)) * (STONES.length - 1)
        p.y += Math.sin((local % 1) * Math.PI) * 0.06
        pos.setXYZ(i, p.x, p.y, p.z)
        size.setX(i, 0.02)
      }
    }

    // --- motes ------------------------------------------------------------------------------
    const GOLD_N = 60
    const goldMotes = makeSprites(GOLD_N, glow(`#${gold.getHexString()}`, 2.4), 1)
    const goldSeed = Array.from({ length: GOLD_N }, () => ({
      u: Math.random(),
      x: (Math.random() - 0.5) * 0.4,
      z: (Math.random() - 0.5) * 0.55,
      sp: 0.06 + Math.random() * 0.08,
      ph: Math.random(),
      size: 0.012 + Math.random() * 0.018,
    }))
    const ICE_N = 50
    const iceMotes = makeSprites(ICE_N, glow(palette.ice, 2.8), 1)
    const iceSeed = Array.from({ length: ICE_N }, () => ({
      ph: Math.random(),
      sp: 0.05 + Math.random() * 0.06,
      off: new THREE.Vector3((Math.random() - 0.5) * 0.14, Math.random() * 0.06, (Math.random() - 0.5) * 0.14),
      size: 0.012 + Math.random() * 0.02,
    }))

    // --- halos (focal blooms) -------------------------------------------------------------
    const goldHalo = makeSprites(1, glow(`#${gold.getHexString()}`, 1.1), 1)
    const iceHalo = makeSprites(2, glow(palette.ice, 1.2), 1)

    return {
      gold, ash, iceLine, iceLineHot, goldLine, goldLip, coolLine, coolLip,
      slabs, sheenMat, shellMat, oldFig, oldFigMat, caseMat, newFig, newFigMat,
      stones, trail, curve, goldMotes, goldSeed, iceMotes, iceSeed, goldHalo, iceHalo,
    }
  }, [accent])

  const tmp = useMemo(
    () => ({
      q: new THREE.Quaternion(),
      qA: new THREE.Quaternion(),
      qB: new THREE.Quaternion(),
      qS: new THREE.Quaternion(),
      e: new THREE.Euler(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      v: new THREE.Vector3(),
      col: new THREE.Color(),
      zAxis: new THREE.Vector3(0, 0, 1),
      xAxis: new THREE.Vector3(1, 0, 0),
      m4: new THREE.Matrix4(),
      m4b: new THREE.Matrix4(),
      pv: new THREE.Vector3(),
      sv: new THREE.Vector3(),
      qL: new THREE.Quaternion(),
      qI: new THREE.Quaternion(),
      yAxis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    time.current += dt
    const t = time.current
    // linear clock toward the target, then a damped follower: smooth start, smooth landing
    const step = dt / 3.0
    mRaw.current += THREE.MathUtils.clamp(target - mRaw.current, -step, step)
    m.current = THREE.MathUtils.damp(m.current, mRaw.current, 5, dt)
    const M = m.current
    const p = clamp01(progress)
    // world-size -> pixels for the sprite shader
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 35
    const pxScale = gl.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))

    // ---- old slabs ----
    const dim = smooth(seg(M, 0.0, 0.55))
    tmp.col.copy(P.goldLine).lerp(P.coolLine, dim)
    P.slabs.forEach((s, i) => {
      const b = easeOutCubic(seg(p, i * 0.09, i * 0.09 + 0.45))
      const e = smooth(seg(M, 0.04 + (STEPS - 1 - i) * 0.035, 0.5 + (STEPS - 1 - i) * 0.035))
      const [ix, iy, iz] = intactPos(i)
      const r = REMIX[i]
      const bob = Math.sin(t * 0.7 + i * 1.3) * (0.008 + 0.02 * e)
      s.group.position.set(
        THREE.MathUtils.lerp(ix, r.p[0], e),
        THREE.MathUtils.lerp(iy, r.p[1], e) + bob - (1 - b) * 0.7,
        THREE.MathUtils.lerp(iz, r.p[2], e),
      )
      const drift = e * 0.06
      s.group.rotation.set(
        r.r[0] * e + Math.sin(t * 0.31 + i) * drift,
        r.r[1] * e + Math.sin(t * 0.23 + i * 2.1) * drift,
        r.r[2] * e + Math.cos(t * 0.27 + i * 0.7) * drift,
      )
      const sc = 0.35 + 0.65 * b
      s.group.scale.set(sc, sc, sc)
      s.group.visible = b > 0.001
      s.group.updateMatrix()
      s.edgeMat.color.copy(tmp.col)
      s.edgeMat.opacity = b * (1 - 0.35 * dim)
      const lipDraw = easeOutCubic(seg(p, i * 0.09 + 0.2, i * 0.09 + 0.6))
      s.lip.scale.x = Math.max(lipDraw, 0.0001)
      s.lipMat.color.copy(P.goldLip).multiplyScalar(i === STEPS - 1 ? 1.25 + 0.1 * Math.sin(t * 2.2) : 0.62 + 0.08 * i)
      s.lipMat.color.lerp(P.coolLip, dim)
      s.lipMat.opacity = lipDraw
    })
    P.shellMat.uniforms.uAmt.value = easeOutCubic(seg(p, 0.2, 0.7)) * THREE.MathUtils.lerp(0.55, 0.8, dim)
    P.sheenMat.uniforms.uAmt.value = easeOutCubic(seg(p, 0.3, 0.8)) * (1 - 0.5 * dim)
    P.sheenMat.uniforms.uColor.value.copy(P.gold).multiplyScalar(1.4).lerp(P.ash, dim)

    // ---- old figure: stands on the summit, then tumbles to slab 1 ----
    {
      const fig = P.oldFig
      const top = P.slabs[STEPS - 1].group
      const low = P.slabs[1].group
      const f = smooth(seg(M, 0.12, 0.66))
      const H = 0.16 * FIG_SCALE
      tmp.a.set(0.02, SLAB.h / 2 + H, 0.04).applyMatrix4(top.matrix)
      tmp.b.set(0.0, SLAB.h / 2 + 0.05, 0.02).applyMatrix4(low.matrix)
      // arc: hop up off the tilting summit, then fall
      tmp.c.lerpVectors(tmp.a, tmp.b, f)
      tmp.c.y += Math.sin(f * Math.PI) * 0.32 * (1 - f * 0.4)
      // appears at its feet on the summit (earlier when the build plays straight into "remixed")
      const a0 = THREE.MathUtils.lerp(0.6, 0.3, M)
      const appear = easeOutCubic(seg(p, a0, a0 + 0.35))
      fig.root.position.copy(tmp.c)
      tmp.qA.copy(top.quaternion)
      tmp.qB.copy(low.quaternion)
      tmp.q.slerpQuaternions(tmp.qA, tmp.qB, f)
      // head-over-heels, ending on its back with the chest tilted ~25° up toward the camera
      tmp.qS.setFromAxisAngle(tmp.xAxis, -f * (Math.PI * 2.5 - 0.2))
      tmp.qA.setFromAxisAngle(tmp.yAxis, f * 0.95)
      fig.root.quaternion.copy(tmp.q).multiply(tmp.qA).multiply(tmp.qS)
      fig.root.scale.setScalar(FIG_SCALE * Math.max(appear, 0.0001))
      // scale up from the feet, not the centre
      tmp.v.set(0, -H * (1 - appear) / FIG_SCALE, 0).applyQuaternion(fig.root.quaternion).multiplyScalar(FIG_SCALE)
      fig.root.position.add(tmp.v)
      fig.root.visible = appear > 0.001
      // proud idle: a slight breathing sway; limbs flail during the fall
      const flail = Math.sin(f * Math.PI)
      fig.body.rotation.x = -0.05 + Math.sin(t * 1.1) * 0.015 * (1 - f)
      // sprawled landing: a clear X of arms and legs in the plane of the slab
      fig.armL.rotation.z = -0.18 - flail * 1.3 - f * 1.3
      fig.armR.rotation.z = 0.12 + flail * 0.9 + f * 1.0
      fig.legL.rotation.z = -flail * 0.4 - f * 0.42
      fig.legR.rotation.z = flail * 0.3 + f * 0.42
      if (fig.briefcase) {
        // the dropped briefcase: from the hand to lying flat on the slab's near edge
        const bf = smooth(seg(M, 0.22, 0.78))
        fig.root.updateMatrixWorld(true)
        low.updateMatrixWorld()
        const sc = FIG_SCALE * Math.max(appear, 0.0001)
        tmp.qL.setFromEuler(tmp.e.set(-Math.PI / 2, 0.7, 0, 'YXZ'))
        tmp.m4.compose(tmp.pv.set(0.13, SLAB.h / 2 + 0.014 * sc, 0.25), tmp.qL, tmp.sv.setScalar(sc))
        tmp.m4.premultiply(low.matrixWorld)
        tmp.m4b.copy(fig.armR.matrixWorld).invert().multiply(tmp.m4)
        tmp.m4b.decompose(tmp.pv, tmp.qL, tmp.sv)
        // blend from the in-hand pose (with a little hop) to the landed pose
        fig.briefcase.position.set(0.014, -0.15, 0).lerp(tmp.pv, bf)
        fig.briefcase.position.x += Math.sin(bf * Math.PI) * 0.12
        fig.briefcase.quaternion.slerpQuaternions(tmp.qI, tmp.qL, bf)
        fig.briefcase.scale.set(1, 1, 1).lerp(tmp.sv, bf)
      }
      // the gold survives, dimmed: the fallen figure stays the warm counterpart to the cyan climber
      const u1 = P.oldFigMat.uniforms
      // the gold cools to an ashier amber: still legible, no longer the hero
      tmp.col.copy(P.gold).lerp(P.ash, 0.4 * dim)
      u1.uCore.value.copy(tmp.col).multiplyScalar(THREE.MathUtils.lerp(0.13, 0.09, dim))
      u1.uRim.value.copy(tmp.col).multiplyScalar(THREE.MathUtils.lerp(2.8, 1.15, dim))
      const u2 = P.caseMat.uniforms
      u2.uCore.value.copy(P.gold).multiplyScalar(THREE.MathUtils.lerp(0.55, 0.25, dim))
      u2.uRim.value.copy(P.gold).multiplyScalar(THREE.MathUtils.lerp(2.6, 1.2, dim))

      // summit halo behind the figure
      const hp = P.goldHalo.geometry.getAttribute('position') as THREE.BufferAttribute
      const hs = P.goldHalo.geometry.getAttribute('aSize') as THREE.BufferAttribute
      // halo follows the figure: a proud glow on the summit, an ember afterglow where it fell
      hp.setXYZ(0, fig.root.position.x, fig.root.position.y + 0.03 * (1 - f), fig.root.position.z - 0.1)
      hs.setX(0, THREE.MathUtils.lerp(0.75, 0.5, f) + Math.sin(t * 1.4) * 0.03)
      hp.needsUpdate = true
      hs.needsUpdate = true
      P.goldHalo.material.uniforms.uOpacity.value = appear * THREE.MathUtils.lerp(0.32, 0.22, dim)
      P.goldHalo.material.uniforms.uScale.value = pxScale
    }

    // ---- gold motes rising off the staircase ----
    {
      const pos = P.goldMotes.geometry.getAttribute('position') as THREE.BufferAttribute
      const al = P.goldMotes.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
      const sz = P.goldMotes.geometry.getAttribute('aSize') as THREE.BufferAttribute
      P.goldSeed.forEach((s, i) => {
        const k = (s.ph + t * s.sp) % 1
        const stepIdx = Math.min(STEPS - 1, Math.floor(s.u * STEPS))
        const sl = P.slabs[stepIdx].group
        tmp.v.set(s.x, SLAB.h / 2 + k * 0.5, s.z).applyMatrix4(sl.matrix)
        pos.setXYZ(i, tmp.v.x, tmp.v.y, tmp.v.z)
        al.setX(i, Math.sin(k * Math.PI) * (0.4 + 0.6 * (stepIdx / (STEPS - 1))))
        sz.setX(i, s.size)
      })
      pos.needsUpdate = true
      al.needsUpdate = true
      sz.needsUpdate = true
      P.goldMotes.material.uniforms.uOpacity.value = easeOutCubic(seg(p, 0.5, 1)) * (1 - dim)
      P.goldMotes.material.uniforms.uScale.value = pxScale
    }

    // ---- new path: stones grow one after another ----
    let pathGrow = 0
    let builtHead = 0
    {
      const pb = easeOutCubic(seg(p, 0.2, 0.9))
      let builtSum = 0
      P.stones.forEach((s, j) => {
        const pbj = easeOutCubic(seg(p, 0.12 + j * 0.08, 0.42 + j * 0.08))
        builtSum += pbj
        const a = 0.34 + j * 0.065
        const g = seg(M, a, a + 0.2)
        const sc = g <= 0 ? 0 : easeOutBack(g) * pbj
        const st = STONES[j]
        s.group.visible = sc > 0.001
        s.group.position.set(st.p[0], st.p[1] + Math.sin(t * 0.9 + j * 1.7) * 0.012 - (1 - g) * 0.12, st.p[2])
        s.group.rotation.set(Math.sin(t * 0.5 + j) * 0.03, st.ry + t * 0.03 * ((j % 2) * 2 - 1), Math.cos(t * 0.4 + j) * 0.03)
        s.group.scale.set(st.s[0] * sc, st.s[1] * sc, st.s[2] * sc)
        s.lineMat.opacity = clamp01(g * 1.5) * pbj
        s.seamMat.opacity = s.lineMat.opacity
        s.capMat.uniforms.uOpacity.value = s.lineMat.opacity
        s.lineMat.color.copy(j === CLIMBER_STONE || j === CLIMBER_STONE + 1 ? P.iceLineHot : P.iceLine)
      })
      pathGrow = smooth(seg(M, 0.34, 0.34 + 0.065 * (STONES.length - 1) + 0.2)) * pb
      // the trail never runs ahead of the stones being built (at most half a hop)
      builtHead = clamp01((builtSum - 0.5) / (STONES.length - 1) + 0.06)
      const tr = P.trail
      tr.material.uniforms.uScale.value = pxScale
      tr.material.uniforms.uOpacity.value = 0.9
      const al = tr.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
      const n = al.count
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1)
        const head = Math.min(pathGrow * 1.05, builtHead)
        const vis = clamp01((head - u) * 12)
        const pulse = 0.5 + 0.5 * Math.sin(u * 40 - t * 3.0)
        al.setX(i, vis * (0.25 + 0.5 * pulse))
      }
      al.needsUpdate = true
    }

    // ---- the climber ----
    {
      const fig = P.newFig
      const st = P.stones[CLIMBER_STONE].group
      const g = easeOutCubic(seg(M, 0.68, 0.95)) * easeOutCubic(seg(p, 0.5, 1))
      const S = STONES[CLIMBER_STONE]
      // planted on the stone's current top surface; grows up from its feet
      const top = st.position.y + st.scale.y * 0.5
      fig.root.position.set(S.p[0] + 0.01, top + 0.16 * CLIMBER_SCALE * g - 0.01, S.p[2])
      fig.root.scale.setScalar(CLIMBER_SCALE * Math.max(g, 0.0001))
      fig.root.visible = g > 0.001
      const c = Math.sin(t * 2.0)
      fig.legL.rotation.x = -1.1 + c * 0.12
      fig.armR.rotation.x = -2.85 + c * 0.1
      fig.armL.rotation.x = 0.65 - c * 0.12
      P.newFigMat.uniforms.uOpacity.value = g
      // halos: one around the climber, one marking the highest stone
      const hp = P.iceHalo.geometry.getAttribute('position') as THREE.BufferAttribute
      const hs = P.iceHalo.geometry.getAttribute('aSize') as THREE.BufferAttribute
      const ha = P.iceHalo.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
      fig.root.updateMatrix()
      tmp.v.set(0, 0.03, 0.07).applyMatrix4(fig.root.matrix) // torso centre (the body leans forward)
      hp.setXYZ(0, tmp.v.x, tmp.v.y, tmp.v.z)
      hs.setX(0, 0.46 + Math.sin(t * 2.3) * 0.03)
      ha.setX(0, g)
      const last = STONES[STONES.length - 1]
      hp.setXYZ(1, last.p[0], P.stones[STONES.length - 1].group.position.y + last.s[1] * 0.5, last.p[2])
      hs.setX(1, 0.42 + Math.sin(t * 1.7) * 0.03)
      ha.setX(1, smooth(seg(M, 0.78, 1)) * 0.8)
      hp.needsUpdate = true
      hs.needsUpdate = true
      ha.needsUpdate = true
      P.iceHalo.material.uniforms.uScale.value = pxScale
      P.iceHalo.material.uniforms.uOpacity.value = 0.3 * easeOutCubic(seg(p, 0.5, 1))
    }

    // ---- ice motes streaming up the new path ----
    {
      const pos = P.iceMotes.geometry.getAttribute('position') as THREE.BufferAttribute
      const al = P.iceMotes.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
      const sz = P.iceMotes.geometry.getAttribute('aSize') as THREE.BufferAttribute
      P.iceSeed.forEach((s, i) => {
        const k = (s.ph + t * s.sp) % 1
        const u = k * Math.max(Math.min(pathGrow, builtHead - 0.06), 0.001)
        P.curve.getPointAt(Math.min(u, 1), tmp.v)
        tmp.v.add(s.off)
        tmp.v.y += k * 0.05
        pos.setXYZ(i, tmp.v.x, tmp.v.y, tmp.v.z)
        al.setX(i, Math.sin(k * Math.PI))
        sz.setX(i, s.size)
      })
      pos.needsUpdate = true
      al.needsUpdate = true
      sz.needsUpdate = true
      P.iceMotes.material.uniforms.uOpacity.value = pathGrow
      P.iceMotes.material.uniforms.uScale.value = pxScale
    }
  })

  return (
    <group>
      {P.slabs.map((s, i) => (
        <primitive key={`slab${i}`} object={s.group} matrixAutoUpdate={false} />
      ))}
      <primitive object={P.oldFig.root} />
      {P.stones.map((s, j) => (
        <primitive key={`stone${j}`} object={s.group} />
      ))}
      <primitive object={P.newFig.root} />
      <points geometry={P.trail.geometry} material={P.trail.material} frustumCulled={false} />
      <points geometry={P.goldMotes.geometry} material={P.goldMotes.material} frustumCulled={false} />
      <points geometry={P.iceMotes.geometry} material={P.iceMotes.material} frustumCulled={false} />
      <points geometry={P.goldHalo.geometry} material={P.goldHalo.material} frustumCulled={false} />
      <points geometry={P.iceHalo.geometry} material={P.iceHalo.material} frustumCulled={false} />
    </group>
  )
}
