/**
 * HumanGathering: "Being human gets more valuable."
 *
 * People around a campfire at night, in a closed ring. Across the fire one figure stands and talks
 * with both palms open; the rest turn in toward speaker and fire: arms crossed, hands in pockets,
 * a hand at the chin, hands clasped behind, and two people seated on boulders in the foreground
 * with their backs to us (one lifts a hand to answer). We look past their backlit shoulders into
 * the circle. The figures wear coats, have hair and a nose so heads read in profile, and are matte
 * warm-black cloth, not glossy mannequins: they are shaped only by the fire, a warm wash on the
 * sides that face it, a soft rim, and a halo along silhouettes that stand between us and the
 * flames. The speaker faces the fire and is the warmest-lit figure. The mass leans right (taller
 * standing figures on the right) because the slide's text is on the left.
 *
 * Idle: breathing, out-of-phase sway, the speaker's hands shaping phrases, slow listening nods, a
 * flicker that drives the point light, the pool, the rims and the flames, and embers drifting up.
 * Build-in: footprint rings draw on, embers spark, the fire kindles, the seats fade in, then each
 * figure appears as a faint glowing silhouette and fills in from the feet up behind a thin ember
 * line. The rings fade away once everyone has arrived.
 *
 * Also exports makeFigureGeometry(pose) for crowds on other slides (InstancedMesh-ready).
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'Human gathering',
  distance: 4.2,
  elevation: 15,
  azimuth: -18,
}

/* ------------------------------------------------------------------------------------------ */
/* Figure geometry                                                                             */
/* ------------------------------------------------------------------------------------------ */

type V = [number, number, number]
type FigurePose = 'stand' | 'talk' | 'listen' | 'walk'
type AnyPose = FigurePose | 'cross' | 'behind' | 'akimbo' | 'lean' | 'relaxed' | 'chin' | 'pockets' | 'sit' | 'sitGesture'
/** Clothing and hair, so the figures read as people in coats around a fire rather than mannequins. */
type FigureLook = { coat?: 'long' | 'short'; hair?: 'bun' | 'long'; nose?: boolean }

type ArmSpec = { e: V; w: V; palm: V; open?: boolean; hide?: boolean }
type LegSpec = { k: V; a: V; toe?: number }
type PoseSpec = {
  lean: number // forward pitch of the upper body (rad)
  twist: number // yaw of the upper body (rad)
  side: number // sideways roll of the upper body (rad)
  head: V // nod (x), turn (y), tilt (z)
  arms: [ArmSpec, ArmSpec] // right (+x), left (-x)
  legs: [LegSpec, LegSpec]
  /** Seated poses: how far the upper body drops (legs are then given in final coordinates). */
  drop?: number
}

const SHOULDER_X = 0.09
const SHOULDER_Y = 0.782
const HIP_X = 0.052
const HIP_Y = 0.5

const LEGS_STAND: [LegSpec, LegSpec] = [
  { k: [0.056, 0.272, 0.008], a: [0.06, 0.045, -0.004] },
  { k: [-0.056, 0.272, 0.008], a: [-0.06, 0.045, -0.004] },
]
const LEGS_REST: [LegSpec, LegSpec] = [
  { k: [0.054, 0.273, 0.016], a: [0.058, 0.045, -0.012] },
  { k: [-0.066, 0.279, 0.034], a: [-0.088, 0.045, 0.024] },
]

const POSES: Record<AnyPose, PoseSpec> = {
  stand: {
    lean: 0,
    twist: 0,
    side: 0,
    head: [0.02, 0, 0],
    arms: [
      { e: [0.116, 0.625, -0.005], w: [0.126, 0.47, 0.02], palm: [-1, 0, 0.1] },
      { e: [-0.116, 0.625, -0.005], w: [-0.126, 0.47, 0.02], palm: [1, 0, 0.1] },
    ],
    legs: LEGS_STAND,
  },
  talk: {
    lean: 0.08,
    twist: -0.2,
    side: 0.045,
    head: [-0.06, -0.08, 0.06],
    arms: [
      // one palm offered out to the listeners, the other open near the chest: "here is the thing"
      // the offered palm reaches out over the fire, toward the circle
      { e: [0.165, 0.652, 0.085], w: [0.238, 0.728, 0.238], palm: [-0.2, 1, 0.3], open: true },
      // the other hand lifts, open, as if explaining
      { e: [-0.165, 0.645, 0.07], w: [-0.215, 0.7, 0.215], palm: [0.25, 1, 0.3], open: true },
    ],
    legs: [
      // weight on the left leg; the right knee bends and the foot steps out
      { k: [0.054, 0.272, 0.004], a: [0.06, 0.045, -0.01] },
      { k: [-0.072, 0.28, 0.068], a: [-0.104, 0.045, 0.04] },
    ],
  },
  listen: {
    lean: 0.05,
    twist: 0.04,
    side: -0.03,
    head: [0.14, 0.06, 0.24],
    arms: [
      { e: [0.118, 0.628, 0.035], w: [0.03, 0.54, 0.104], palm: [-1, 0.1, -0.2] },
      { e: [-0.118, 0.632, 0.03], w: [-0.026, 0.55, 0.098], palm: [1, 0.1, -0.2] },
    ],
    legs: LEGS_REST,
  },
  cross: {
    lean: -0.02,
    twist: 0,
    side: 0.02,
    head: [0.06, 0, -0.14],
    arms: [
      { e: [0.122, 0.64, 0.06], w: [-0.07, 0.668, 0.1], palm: [0, 0.3, -1] },
      { e: [-0.122, 0.632, 0.066], w: [0.075, 0.69, 0.088], palm: [0, 0.3, -1] },
    ],
    legs: [
      { k: [0.06, 0.272, 0.01], a: [0.072, 0.045, 0.0] },
      { k: [-0.058, 0.272, 0.01], a: [-0.07, 0.045, 0.0] },
    ],
  },
  behind: {
    lean: 0.12,
    twist: 0,
    side: 0,
    head: [-0.12, 0, 0.1],
    arms: [
      { e: [0.12, 0.632, -0.055], w: [0.035, 0.54, -0.1], palm: [-1, 0, 0] },
      { e: [-0.12, 0.632, -0.055], w: [-0.03, 0.545, -0.104], palm: [1, 0, 0] },
    ],
    legs: [
      { k: [0.058, 0.276, 0.04], a: [0.07, 0.045, 0.05] },
      { k: [-0.06, 0.271, -0.012], a: [-0.07, 0.045, -0.03] },
    ],
  },
  // arms loose at the sides, head tipped toward the speaker
  relaxed: {
    lean: 0.05,
    twist: -0.04,
    side: 0.03,
    head: [0.04, 0.06, 0.2],
    arms: [
      { e: [0.12, 0.627, 0.015], w: [0.136, 0.475, 0.06], palm: [-1, 0, 0.2] },
      { e: [-0.118, 0.626, 0.0], w: [-0.124, 0.47, 0.035], palm: [1, 0, 0.1] },
    ],
    legs: LEGS_REST,
  },
  // leaning in toward the speaker, one hand resting at the waist, weight on one leg
  lean: {
    lean: 0.15,
    twist: 0.05,
    side: -0.03,
    head: [-0.08, 0.04, 0.12],
    arms: [
      { e: [0.15, 0.625, 0.01], w: [0.085, 0.545, 0.075], palm: [-1, 0, 0] },
      { e: [-0.116, 0.622, 0.01], w: [-0.124, 0.468, 0.045], palm: [1, 0, 0.1] },
    ],
    legs: LEGS_REST,
  },
  akimbo: {
    lean: 0.02,
    twist: -0.06,
    side: 0.045,
    head: [0.05, -0.04, 0.16],
    arms: [
      { e: [0.19, 0.64, -0.03], w: [0.098, 0.548, 0.02], palm: [-1, 0, 0] },
      { e: [-0.118, 0.625, 0.0], w: [-0.13, 0.47, 0.03], palm: [1, 0, 0.1] },
    ],
    legs: LEGS_REST,
  },
  // thinking: one hand at the chin, the other arm folded under its elbow
  chin: {
    lean: 0.03,
    twist: 0.05,
    side: -0.035,
    head: [0.1, 0.02, 0.12],
    arms: [
      { e: [0.07, 0.668, 0.112], w: [0.03, 0.83, 0.082], palm: [-0.4, 0, 1] },
      { e: [-0.12, 0.632, 0.05], w: [0.035, 0.648, 0.108], palm: [0, 0.3, -1] },
    ],
    legs: [
      { k: [0.05, 0.274, 0.02], a: [0.05, 0.045, -0.006] },
      { k: [-0.07, 0.276, 0.04], a: [-0.1, 0.045, 0.04] },
    ],
  },
  // hands in coat pockets, weight on one hip
  pockets: {
    lean: -0.03,
    twist: -0.05,
    side: 0.05,
    head: [0.08, 0.05, -0.1],
    arms: [
      { e: [0.152, 0.634, -0.02], w: [0.1, 0.5, 0.06], palm: [-1, 0, 0] },
      { e: [-0.148, 0.632, -0.02], w: [-0.098, 0.5, 0.06], palm: [1, 0, 0] },
    ],
    legs: [
      { k: [0.056, 0.272, 0.0], a: [0.062, 0.045, -0.02] },
      { k: [-0.072, 0.278, 0.05], a: [-0.11, 0.045, 0.06] },
    ],
  },
  // seated on a log, leaning in, forearms on the knees, hands loosely together
  sit: {
    lean: 0.36,
    twist: 0.0,
    side: 0.02,
    head: [-0.22, 0.0, 0.08],
    arms: [
      { e: [0.13, 0.638, 0.07], w: [0.035, 0.6, 0.192], palm: [-1, 0, 0.3] },
      { e: [-0.13, 0.638, 0.07], w: [-0.03, 0.604, 0.19], palm: [1, 0, 0.3] },
    ],
    legs: [
      { k: [0.08, 0.235, 0.215], a: [0.08, 0.045, 0.27] },
      { k: [-0.085, 0.235, 0.21], a: [-0.09, 0.045, 0.26] },
    ],
    drop: 0.29,
  },
  // seated, answering the speaker: one forearm on a knee, the other hand lifted open
  sitGesture: {
    lean: 0.26,
    twist: -0.1,
    side: -0.03,
    head: [-0.2, -0.05, -0.08],
    arms: [
      { e: [0.15, 0.66, 0.085], w: [0.175, 0.8, 0.14], palm: [-0.2, 0.25, 1], open: true },
      { e: [-0.135, 0.645, 0.045], w: [-0.08, 0.605, 0.164], palm: [1, 0, 0.3] },
    ],
    legs: [
      { k: [0.075, 0.235, 0.215], a: [0.09, 0.045, 0.25] },
      { k: [-0.09, 0.237, 0.2], a: [-0.11, 0.045, 0.21] },
    ],
    drop: 0.29,
  },
  walk: {
    lean: 0.06,
    twist: 0.06,
    side: 0,
    head: [0.03, 0, 0],
    arms: [
      { e: [0.113, 0.63, -0.055], w: [0.118, 0.48, -0.09], palm: [-1, 0, 0] },
      { e: [-0.11, 0.63, 0.06], w: [-0.11, 0.488, 0.128], palm: [1, 0, 0] },
    ],
    legs: [
      { k: [0.054, 0.288, 0.078], a: [0.056, 0.05, 0.118] },
      { k: [-0.052, 0.27, -0.038], a: [-0.054, 0.078, -0.152], toe: 0.55 },
    ],
  },
}

const UP = new THREE.Vector3(0, 1, 0)
const v3 = (p: V) => new THREE.Vector3(p[0], p[1], p[2])

/** Open-ended tapered cylinder from a (radius ra) to b (radius rb). */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a)
  const g = new THREE.CylinderGeometry(rb, ra, d.length(), seg, 1, true)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
  return g
}

function ball(c: THREE.Vector3, r: number, ws = 10, hs = 7) {
  const g = new THREE.SphereGeometry(r, ws, hs)
  g.translate(c.x, c.y, c.z)
  return g
}

/** Ellipsoid with axes: x = side, y = along, z = thickness. */
function ellipsoid(c: THREE.Vector3, along: THREE.Vector3, normal: THREE.Vector3, r: V, ws = 12, hs = 8) {
  const y = along.clone().normalize()
  const z = normal.clone().sub(y.clone().multiplyScalar(normal.dot(y))).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  const g = new THREE.SphereGeometry(1, ws, hs)
  const m = new THREE.Matrix4().makeBasis(x, y, z).scale(new THREE.Vector3(r[0], r[1], r[2])).setPosition(c)
  g.applyMatrix4(m)
  return g
}

function aboutPivot(p: THREE.Vector3, rot: THREE.Euler) {
  return new THREE.Matrix4()
    .makeTranslation(p.x, p.y, p.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(rot))
    .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z))
}

const COAT_TOP: [number, number][] = [
  [0.1, 0.63],
  [0.107, 0.69],
  [0.119, 0.74],
  [0.124, 0.766],
  [0.113, 0.794],
  [0.076, 0.813],
  [0.042, 0.822],
  [0.0, 0.826],
]
const COAT_LONG: [number, number][] = [[0.121, 0.365], [0.118, 0.43], [0.11, 0.5], [0.101, 0.575], ...COAT_TOP]
const COAT_SHORT: [number, number][] = [[0.101, 0.45], [0.098, 0.52], [0.096, 0.58], ...COAT_TOP]

function buildFigure(P: PoseSpec, look: FigureLook = {}): THREE.BufferGeometry {
  const upper: THREE.BufferGeometry[] = []
  const lower: THREE.BufferGeometry[] = []
  const drop = P.drop ?? 0
  const sleeve = look.coat ? 1.18 : 1

  if (look.coat) {
    const coat = new THREE.LatheGeometry(
      (look.coat === 'long' ? COAT_LONG : COAT_SHORT).map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    )
    coat.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.78))
    upper.push(coat)
  }

  // Torso: one smooth lathe from pelvis to collar, flattened front-to-back, broad at the shoulders.
  const prof: [number, number][] = [
    [0.0, 0.438],
    [0.042, 0.441],
    [0.068, 0.456],
    [0.084, 0.48],
    [0.09, 0.51],
    [0.085, 0.55],
    [0.071, 0.6],
    [0.073, 0.64],
    [0.089, 0.69],
    [0.104, 0.736],
    [0.11, 0.764],
    [0.1, 0.79],
    [0.066, 0.811],
    [0.03, 0.822],
    [0.0, 0.825],
  ]
  const torso = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    24,
  )
  torso.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.73))
  upper.push(torso)

  // Neck, then a rounder head with a jaw that gives the faceless head a direction of attention.
  upper.push(limb(new THREE.Vector3(0, 0.8, -0.004), new THREE.Vector3(0, 0.872, 0.008), 0.029, 0.024, 10))
  const pivot = new THREE.Vector3(0, 0.862, 0.006)
  const headRot = aboutPivot(pivot, new THREE.Euler(P.head[0], P.head[1], P.head[2], 'YXZ'))
  const cranium = new THREE.SphereGeometry(0.054, 20, 14)
  cranium.applyMatrix4(new THREE.Matrix4().makeScale(0.88, 1.1, 0.98))
  cranium.translate(0, 0.922, 0.0)
  const jaw = new THREE.SphereGeometry(1, 14, 10)
  jaw.applyMatrix4(new THREE.Matrix4().makeScale(0.033, 0.029, 0.035))
  jaw.translate(0, 0.893, 0.013)
  const headParts = [cranium, jaw]
  if (look.nose ?? true) {
    // a small nose turns the head into a profile that the firelight can catch
    headParts.push(ellipsoid(new THREE.Vector3(0, 0.909, 0.05), new THREE.Vector3(0, 1, 0.35), new THREE.Vector3(0, 0, 1), [0.0055, 0.011, 0.0068], 8, 6))
  }
  if (look.hair === 'long') {
    headParts.push(ellipsoid(new THREE.Vector3(0, 0.9, -0.014), UP, new THREE.Vector3(0, 0, 1), [0.055, 0.074, 0.05], 14, 10))
  } else if (look.hair === 'bun') {
    headParts.push(ball(new THREE.Vector3(0, 0.958, -0.046), 0.024, 10, 7))
  }
  for (const g of headParts) {
    g.applyMatrix4(headRot)
    upper.push(g)
  }

  // Arms. Joint spheres match the limb radius so they read as smooth joints, not wooden balls.
  P.arms.forEach((arm, i) => {
    const s = new THREE.Vector3(i === 0 ? SHOULDER_X : -SHOULDER_X, SHOULDER_Y, 0)
    const e = v3(arm.e)
    const w = v3(arm.w)
    if (!look.coat) upper.push(ball(s, 0.029, 10, 7))
    upper.push(limb(s, e, 0.029 * sleeve, 0.022 * sleeve))
    upper.push(ball(e, 0.022 * sleeve, 8, 6))
    upper.push(limb(e, w, 0.022 * sleeve, 0.0155 * sleeve))
    upper.push(ball(w, 0.0155 * sleeve, 8, 6))
    const dir = new THREE.Vector3().subVectors(w, e).normalize()
    const palm = v3(arm.palm)
    if (arm.open) {
      // open hand: a broad flat paddle plus a thumb splayed to one side, slightly oversized
      upper.push(ellipsoid(w.clone().addScaledVector(dir, 0.04), dir, palm, [0.022, 0.041, 0.008], 12, 8))
      const side = new THREE.Vector3().crossVectors(dir, palm).normalize().multiplyScalar(i === 0 ? 1 : -1)
      const tb = w.clone().addScaledVector(dir, 0.012)
      const tt = tb.clone().addScaledVector(dir, 0.024).addScaledVector(side, 0.03)
      upper.push(limb(tb, tt, 0.0085, 0.006, 6))
      upper.push(ball(tt, 0.006, 6, 4))
    } else {
      upper.push(ellipsoid(w.clone().addScaledVector(dir, 0.034), dir, palm, [0.018, 0.04, 0.0115], 10, 7))
    }
  })

  // Legs.
  P.legs.forEach((leg, i) => {
    const h = new THREE.Vector3(i === 0 ? HIP_X : -HIP_X, HIP_Y - drop, 0)
    const k = v3(leg.k)
    const a = v3(leg.a)
    lower.push(ellipsoid(h.clone().add(new THREE.Vector3(0, 0.004, 0)), UP, new THREE.Vector3(0, 0, 1), [0.05, 0.052, 0.036], 12, 8))
    lower.push(limb(h, k, 0.05, 0.033))
    lower.push(ball(k, 0.033, 10, 7))
    lower.push(limb(k, a, 0.033, 0.021))
    lower.push(ball(a, 0.021, 8, 6))
    const toe = leg.toe ?? 0
    const fwd = new THREE.Vector3(0, -Math.sin(toe), Math.cos(toe))
    const n = new THREE.Vector3(0, Math.cos(toe), Math.sin(toe))
    const c = a.clone().add(new THREE.Vector3(0, -0.022, 0)).addScaledVector(fwd, 0.03)
    if (toe === 0) c.y = 0.022
    lower.push(ellipsoid(c, fwd, n, [0.025, 0.051, 0.021], 12, 7))
  })

  const ub = aboutPivot(new THREE.Vector3(0, 0.52, 0), new THREE.Euler(P.lean, P.twist, P.side, 'YXZ'))
  if (drop) ub.premultiply(new THREE.Matrix4().makeTranslation(0, -drop, 0))
  upper.forEach((g) => g.applyMatrix4(ub))

  const parts = [...upper, ...lower]
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

/**
 * A single merged, faceless mannequin about 1.0 tall, feet at y = 0, facing +z.
 * Indexed, with position / normal / uv (~3k triangles). Use it directly or in an InstancedMesh.
 */
export function makeFigureGeometry(pose: FigurePose): THREE.BufferGeometry {
  return buildFigure(POSES[pose])
}

/** Mirror a geometry across x and fix winding, for pose variety in a crowd. */
function mirrorX(g: THREE.BufferGeometry) {
  const m = g.clone()
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
  const idx = m.getIndex()!
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, b)
  }
  idx.needsUpdate = true
  return m
}

/* ------------------------------------------------------------------------------------------ */
/* Shared shader pieces                                                                        */
/* ------------------------------------------------------------------------------------------ */

const FIG_DECL = /* glsl */ `
  attribute float aSeed;
  attribute float aDelay;
  attribute float aEnergy;
  attribute float aDrop;
  uniform float uTime;
  uniform float uProgress;
  varying float vY;
  varying float vCut;
  varying float vReveal;
  varying float vEnergy;
  varying float vGhost;
  varying vec3 vLP;
  varying vec3 vLN;
  float easeOut(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
  // body fills in from the feet
  float figReveal() { return easeOut((uProgress - aDelay) / 0.36); }
  // the glowing silhouette fades in whole, a moment before the body fills it
  float figGhost() { return easeOut((uProgress - aDelay + 0.12) / 0.14); }
  vec3 figDeform(vec3 p) {
    float t = uTime;
    float br = sin(t * (1.1 + aSeed * 0.35) + aSeed * 6.2831);
    // body-relative height, so seated figures breathe and nod with their chests and heads
    float y = p.y + aDrop;
    float chest = smoothstep(0.56, 0.7, y) * (1.0 - smoothstep(0.8, 0.86, y));
    p.x *= 1.0 + 0.02 * br * chest;
    p.y += 0.0035 * br * smoothstep(0.7, 0.95, y);
    float h = max(p.y - aDrop * 0.8, 0.0);
    h *= h;
    float sw = 0.007 + 0.01 * aEnergy;
    p.x += sin(t * (0.55 + aSeed * 0.2) + aSeed * 11.0) * sw * h;
    p.z += sin(t * (0.41 + aSeed * 0.15) + aSeed * 7.0) * sw * 0.8 * h;
    // slow listening nods
    float headW = smoothstep(0.85, 0.95, y) * (1.0 - aEnergy);
    p.z += headW * 0.007 * sin(t * (0.7 + aSeed * 0.4) + aSeed * 13.0);
    // the speaker's hands move a little, like phrases being shaped
    float hands = aEnergy * smoothstep(0.64, 0.74, y) * smoothstep(0.12, 0.18, abs(p.x)) * smoothstep(0.08, 0.15, p.z);
    float ph = p.x > 0.0 ? 0.0 : 1.9;
    p.y += hands * 0.014 * sin(t * 1.5 + ph);
    p.z += hands * 0.01 * sin(t * 1.05 + ph);
    p.x += hands * 0.008 * sign(p.x) * sin(t * 0.8 + ph);
    return p;
  }
`

const FIG_FRAG_DECL = /* glsl */ `
  uniform vec3 uFire;
  uniform float uKindle;
  uniform float uFlick;
  uniform vec3 uEmber;
  uniform vec3 uIce;
  varying float vY;
  varying float vCut;
  varying float vReveal;
  varying float vEnergy;
  varying float vGhost;
  varying vec3 vLP;
  varying vec3 vLN;
  varying vec3 vFireV;
  // how much this surface faces the fire, with falloff by distance
  float fireFacing() {
    vec3 toF = uFire - vLP;
    float d = length(toF);
    float f = clamp(dot(normalize(vLN), toF / d), 0.0, 1.0);
    return f / (1.0 + d * d * 1.2);
  }
  float fireHalfLambert() {
    vec3 toF = uFire - vLP;
    float d = length(toF);
    float f = dot(normalize(vLN), toF / d) * 0.5 + 0.5;
    return f * f / (1.0 + d * d * 2.2);
  }
  // backlight: how much the fire sits behind this point as seen from the camera (view space),
  // with the falloff taken from model-space distance so it holds at any slide scale
  float fireBehind(vec3 viewPos) {
    vec3 L = normalize(vFireV - viewPos);
    float b = clamp(dot(L, normalize(viewPos)), 0.0, 1.0);
    float d = length(uFire - vLP);
    return b * b / (1.0 + d * d * 1.4);
  }
`

type Uniforms = {
  uTime: { value: number }
  uProgress: { value: number }
  uFire: { value: THREE.Vector3 }
  uKindle: { value: number }
  uFlick: { value: number }
  uEmber: { value: THREE.Color }
  uIce: { value: THREE.Color }
}

function makeBodyMaterial(U: Uniforms) {
  const m = new THREE.MeshStandardMaterial({
    // matte, warm-black cloth: the figures are silhouettes shaped by the fire, not showroom gloss
    color: new THREE.Color('#141016'),
    metalness: 0.08,
    roughness: 0.82,
    envMapIntensity: 0.14,
  })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${FIG_DECL}\nuniform vec3 uFire;\nvarying vec3 vFireV;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvFireV = (viewMatrix * modelMatrix * vec4(uFire, 1.0)).xyz;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vec3 ln = objectNormal;
        #ifdef USE_INSTANCING
          ln = mat3(instanceMatrix) * ln;
        #endif
        vLN = ln;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = figDeform(position);
        vY = position.y;
        vReveal = figReveal();
        vGhost = figGhost();
        vEnergy = aEnergy;
        vCut = mix(-0.04, 1.08, vReveal);
        vec4 lp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lp4 = instanceMatrix * lp4;
        #endif
        vLP = lp4.xyz;`,
      )
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIG_FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n if (vGhost <= 0.001) discard;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Vd = normalize(vViewPosition);
          float fr0 = clamp(1.0 - abs(dot(normal, Vd)), 0.0, 1.0);
          float fres = pow(fr0, 2.4);
          float face = fireFacing();
          float warm = uKindle * uFlick;
          float boost = 1.0 + 0.7 * vEnergy;
          vec3 fireCol = uEmber * vec3(1.0, 0.68, 0.42);
          // the speaker's warmth gathers on the face, chest and open hands, not the legs
          float upper = smoothstep(0.42, 0.72, vY);
          {
            // a warm key on the speaker's face, chest and hands, independent of distance: the focal figure
            vec3 toF = normalize(uFire - vLP);
            float facing = clamp(dot(normalize(vLN), toF), 0.0, 1.0);
            totalEmissiveRadiance += fireCol * 0.16 * pow(facing, 1.4) * vEnergy * mix(0.2, 1.0, upper) * warm;
          }
          // soft firelight on faces, chests and palms that turn toward the fire (the speaker most of all)
          totalEmissiveRadiance += fireCol * ((0.012 + 0.03 * vEnergy * upper) * fireHalfLambert() + 0.2 * pow(face, 1.5)) * (1.0 + vEnergy * (0.15 + 1.5 * upper)) * warm;
          // rim on the fire side (kept off down-facing surfaces so the pelvis doesn't outline)
          float notDown = smoothstep(-0.35, 0.05, normalize(vLN).y);
          totalEmissiveRadiance += uEmber * pow(fr0, 3.0) * (0.03 + 1.6 * face) * warm * boost * notDown;
          // backlit halo: figures between us and the fire glow along their silhouettes
          totalEmissiveRadiance += uEmber * pow(fr0, 2.2) * 1.5 * fireBehind(-vViewPosition) * warm * notDown;
          // the barest cool sky rim on the dark side, just enough to separate them from the night
          totalEmissiveRadiance += uIce * pow(fr0, 3.0) * 0.06 * (1.0 - clamp(face * 4.0, 0.0, 1.0));
          // build-in: above the fill line the figure is still a dark ghost with a glowing outline
          float building = 1.0 - step(0.999, vReveal);
          float above = smoothstep(vCut - 0.025, vCut + 0.008, vY) * building;
          vec3 ghostE = uEmber * (0.02 + 0.95 * pow(fr0, 3.5)) * vGhost;
          totalEmissiveRadiance = mix(totalEmissiveRadiance, ghostE, above);
          diffuseColor.rgb *= 1.0 - above;
          // a soft, feathered ember seam where the body fills in
          float seam = exp(-pow((vY - vCut) / 0.011, 2.0)) * building;
          totalEmissiveRadiance += uEmber * 0.6 * seam;
        }`,
      )
  }
  return m
}

function makeHullMaterial(U: Uniforms) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...U, uWidth: { value: 0.0032 } },
    vertexShader: /* glsl */ `
      ${FIG_DECL}
      uniform vec3 uFire;
      uniform float uWidth;
      varying float vFres;
      varying vec3 vFireV;
      varying vec3 vViewP;
      void main() {
        vec3 p = figDeform(position) + normal * uWidth;
        vY = position.y;
        vReveal = figReveal();
        vGhost = figGhost();
        vEnergy = aEnergy;
        vCut = 2.0;
        vec4 lp = vec4(p, 1.0);
        vec3 ln = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          ln = mat3(instanceMatrix) * ln;
        #endif
        vLP = lp.xyz;
        vLN = ln;
        vec4 mv = modelViewMatrix * lp;
        vec3 vn = normalize(mat3(modelViewMatrix) * ln);
        vFres = 1.0 - abs(dot(vn, normalize(-mv.xyz)));
        vFireV = (viewMatrix * modelMatrix * vec4(uFire, 1.0)).xyz;
        vViewP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${FIG_FRAG_DECL}
      varying float vFres;
      varying vec3 vViewP;
      void main() {
        if (vGhost <= 0.001) discard;
        float face = fireFacing();
        float warm = uKindle * uFlick;
        float boost = 1.0 + 0.8 * vEnergy;
        vec3 rim = uEmber * (0.1 + 4.2 * face + 2.6 * fireBehind(vViewP)) * warm * boost;
        rim += uIce * 0.05 * (1.0 - clamp(face * 5.0, 0.0, 1.0));
        // feet sit in their shadows instead of glowing all round the soles, and the pelvis underside stays dark
        rim *= smoothstep(0.012, 0.1, vY) * smoothstep(-0.7, -0.15, normalize(vLN).y);
        // while arriving, the outer contour glows evenly
        vec3 ghost = uEmber * 1.1 * vGhost;
        float settle = smoothstep(0.82, 1.0, vReveal);
        gl_FragColor = vec4(mix(ghost, rim, settle), 1.0);
      }
    `,
    toneMapped: false,
  })
}

/* ------------------------------------------------------------------------------------------ */
/* Scene layout                                                                                */
/* ------------------------------------------------------------------------------------------ */

const SPEAKER = { x: 0.2, z: -0.98, s: 1.07 }

type ListenerSpec = { pose: AnyPose; mirror: boolean; look: FigureLook; x: number; z: number; s: number; w: number; j: number; order: number }
// A closed ring around the fire. The speaker stands across the fire, facing it (and us); the rest
// turn in toward speaker and fire. Two people sit on logs in the foreground with their backs to
// the camera, so we look past their backlit shoulders into the circle. Taller standing figures
// sit on the right so the composition's weight leans away from the slide text.
const LISTENERS: ListenerSpec[] = [
  { pose: 'cross', mirror: false, look: { coat: 'long', hair: 'long' }, x: 0.78, z: -0.74, s: 0.97, w: 1.0, j: 0.05, order: 3 },
  { pose: 'pockets', mirror: false, look: { coat: 'long' }, x: 0.86, z: -0.2, s: 1.06, w: 1.06, j: 0.0, order: 4 },
  { pose: 'chin', mirror: false, look: { coat: 'short' }, x: 0.9, z: 0.64, s: 1.0, w: 1.0, j: 0.1, order: 6 },
  { pose: 'sit', mirror: false, look: { coat: 'short', hair: 'bun' }, x: 0.38, z: 0.86, s: 0.98, w: 1.0, j: -0.05, order: 1 },
  { pose: 'sitGesture', mirror: true, look: { coat: 'short' }, x: -0.74, z: 0.56, s: 1.02, w: 1.05, j: 0.05, order: 0 },
  { pose: 'listen', mirror: true, look: { coat: 'long', hair: 'long' }, x: -1.0, z: -0.14, s: 0.93, w: 0.96, j: -0.05, order: 5 },
  { pose: 'behind', mirror: true, look: { coat: 'short' }, x: -0.6, z: -0.68, s: 1.0, w: 1.04, j: 0.0, order: 2 },
]

type Placement = {
  x: number
  z: number
  yaw: number
  s: number
  w: number
  delay: number
  seed: number
  energy: number
  drop: number
}
type Group = { key: string; pose: AnyPose; mirror: boolean; look: FigureLook; list: Placement[] }

function layout(): { groups: Group[]; all: Placement[] } {
  // the speaker faces the fire and the near side of the ring
  const speaker: Placement = {
    x: SPEAKER.x,
    z: SPEAKER.z,
    yaw: Math.atan2(-SPEAKER.x, -SPEAKER.z) - 0.05,
    s: SPEAKER.s,
    w: 1.04,
    delay: 0.16,
    seed: 0.37,
    energy: 1,
    drop: 0,
  }
  const groups = new Map<string, Group>()
  groups.set('talk', { key: 'talk', pose: 'talk', mirror: false, look: { coat: 'short' }, list: [speaker] })
  const all = [speaker]
  LISTENERS.forEach((l, i) => {
    const { x, z } = l
    // look somewhere between the fire and the speaker
    const tx = SPEAKER.x * 0.55
    const tz = SPEAKER.z * 0.55
    const yaw = Math.atan2(tx - x, tz - z) + l.j
    const p: Placement = {
      x,
      z,
      yaw,
      s: l.s,
      w: l.w,
      delay: 0.26 + l.order * 0.05,
      seed: (i * 0.618 + 0.13) % 1,
      energy: 0,
      drop: (POSES[l.pose].drop ?? 0) * l.s,
    }
    const key = `${l.pose}${l.mirror ? '-m' : ''}-${l.look.coat ?? ''}-${l.look.hair ?? ''}`
    if (!groups.has(key)) groups.set(key, { key, pose: l.pose, mirror: l.mirror, look: l.look, list: [] })
    groups.get(key)!.list.push(p)
    all.push(p)
  })
  return { groups: [...groups.values()], all }
}

function buildInstanced(geo: THREE.BufferGeometry, list: Placement[]) {
  const seed = new Float32Array(list.length)
  const delay = new Float32Array(list.length)
  const energy = new Float32Array(list.length)
  const drop = new Float32Array(list.length)
  const mats: THREE.Matrix4[] = []
  list.forEach((p, i) => {
    seed[i] = p.seed
    delay[i] = p.delay
    energy[i] = p.energy
    drop[i] = p.drop / p.s
    mats.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, 0, p.z),
        new THREE.Quaternion().setFromAxisAngle(UP, p.yaw),
        new THREE.Vector3(p.s * p.w, p.s, p.s * (0.5 + 0.5 * p.w)),
      ),
    )
  })
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
  geo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1))
  geo.setAttribute('aEnergy', new THREE.InstancedBufferAttribute(energy, 1))
  geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(drop, 1))
  return mats
}

function Crowd({ geo, list, body, hull }: { geo: THREE.BufferGeometry; list: Placement[]; body: THREE.Material; hull: THREE.Material }) {
  const mats = useMemo(() => buildInstanced(geo, list), [geo, list])
  const setup = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    mats.forEach((mx, i) => m.setMatrixAt(i, mx))
    m.instanceMatrix.needsUpdate = true
  }
  return (
    <>
      <instancedMesh ref={setup} args={[geo, body, list.length]} frustumCulled={false} />
      <instancedMesh ref={setup} args={[geo, hull, list.length]} frustumCulled={false} />
    </>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Ground rings (the outlines the figures rise from)                                           */
/* ------------------------------------------------------------------------------------------ */

function makeRings(all: Placement[]) {
  const SEG = 72
  const pos: number[] = []
  const t: number[] = []
  const d: number[] = []
  for (const p of all) {
    const r = 0.17 * p.s
    for (let i = 0; i < SEG; i++) {
      for (const k of [i, i + 1]) {
        const a = (k / SEG) * Math.PI * 2 + p.yaw
        pos.push(p.x + Math.sin(a) * r, 0.003, p.z + Math.cos(a) * r * 0.85)
        t.push(k / SEG)
        d.push(p.delay)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1))
  g.setAttribute('aDelay', new THREE.Float32BufferAttribute(d, 1))
  return g
}

const ringVert = /* glsl */ `
  attribute float aT;
  attribute float aDelay;
  uniform float uProgress;
  varying float vT;
  varying float vDraw;
  varying float vRev;
  void main() {
    vT = aT;
    vDraw = clamp((uProgress - aDelay + 0.2) / 0.09, 0.0, 1.0);
    vRev = clamp((uProgress - aDelay) / 0.36, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const ringFrag = /* glsl */ `
  uniform vec3 uEmber;
  varying float vT;
  varying float vDraw;
  varying float vRev;
  void main() {
    float drawn = 1.0 - smoothstep(vDraw - 0.02, vDraw, vT);
    if (drawn <= 0.0) discard;
    float head = smoothstep(vDraw - 0.12, vDraw, vT) * (1.0 - step(0.999, vDraw));
    float hot = sin(3.14159 * min(vRev * 1.6, 1.0));
    // bright while its figure arrives, then gone: nothing UI-like remains in the finished state
    float k = (0.4 + 0.9 * hot) * (1.0 - smoothstep(0.1, 0.4, vRev)) + 1.8 * head;
    if (k <= 0.001) discard;
    gl_FragColor = vec4(uEmber * k * drawn, 1.0);
  }
`

/* ------------------------------------------------------------------------------------------ */
/* Fire                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const flameProfile = [
  [0.004, 0.0],
  [0.24, 0.035],
  [0.38, 0.12],
  [0.42, 0.26],
  [0.36, 0.44],
  [0.24, 0.64],
  [0.11, 0.84],
  [0.004, 1.0],
].map(([r, y]) => new THREE.Vector2(r, y))

const flameVert = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uKindle;
  varying float vH;
  varying float vFres;
  varying float vAng;
  void main() {
    vec3 p = position;
    vAng = uv.x * 6.2831853;
    float h = p.y;
    float t = uTime + uSeed * 10.0;
    float flick = 1.0 + 0.14 * sin(t * 8.0) + 0.08 * sin(t * 13.3 + 1.3) + 0.05 * sin(t * 21.0);
    p.y *= flick * uKindle;
    p.xz *= sqrt(uKindle) * (1.0 - 0.15 * h);
    p.x += (sin(t * 5.6 + h * 4.0) * 0.07 + sin(t * 3.1) * 0.04) * h * h;
    p.z += cos(t * 4.9 + h * 3.0) * 0.05 * h * h;
    vH = h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalMatrix * normal;
    n = n / max(length(n), 1e-4);
    vFres = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`
const flameFrag = /* glsl */ `
  uniform vec3 uHot;
  uniform vec3 uDeep;
  uniform vec3 uCore;
  uniform float uKindle;
  uniform float uAlpha;
  uniform float uTime;
  uniform float uSeed;
  varying float vH;
  varying float vFres;
  varying float vAng;
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float f = clamp(vFres, 0.0, 1.0);
    // licking tongues: noise scrolling upward erodes the upper flame
    float n = vnoise(vec2(vAng * 1.6 + uSeed * 9.0, vH * 3.2 - uTime * 2.4)) * 0.65 + vnoise(vec2(vAng * 3.5, vH * 7.0 - uTime * 3.8)) * 0.35;
    float erode = smoothstep(0.0, 0.25, (1.0 - vH) * 1.15 - n * 0.75 * vH + 0.05);
    float core = pow(f, 1.6);
    vec3 col = mix(uDeep, uHot, core);
    col = mix(col, uCore, pow(core, 3.0) * (1.0 - vH * 0.7));
    float a = clamp(pow(f, 0.7) * 1.3, 0.0, 1.0) * (1.0 - pow(clamp(vH, 0.0, 1.0), 2.2)) * erode * uKindle * uAlpha;
    gl_FragColor = vec4(col, a);
  }
`

function Flame({ U, seed, h, r, pos, alpha = 1, rotZ = 0, rotX = 0 }: { U: Uniforms; seed: number; h: number; r: number; pos: V; alpha?: number; rotZ?: number; rotX?: number }) {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.LatheGeometry(flameProfile, 20)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime,
        uKindle: U.uKindle,
        uSeed: { value: seed },
        uAlpha: { value: alpha },
        uHot: { value: glow(palette.ember, 0.85) },
        uDeep: { value: glow(palette.emberDeep, 0.72) },
        uCore: { value: glow('#ffb24a', 1.05) },
      },
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    return { geo, mat }
  }, [U, seed, alpha])
  return <mesh geometry={geo} material={mat} position={pos} scale={[r, h, r]} rotation={[rotX, 0, rotZ]} renderOrder={3} />
}

const emberVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSpark;
  uniform float uKindle;
  uniform float uScale;
  varying float vA;
  float h(float x) { return fract(sin(x) * 43758.5453); }
  void main() {
    float h1 = h(aSeed * 91.7);
    float h2 = h(aSeed * 47.3 + 1.0);
    float h3 = h(aSeed * 13.9 + 2.0);
    float speed = 0.1 + 0.09 * h1;
    float life = fract(uTime * speed + h2);
    // most sparks die around chest height; a few long-lived ones climb past the heads
    float tall = step(0.62, h3);
    float rise = mix(0.8, 1.9, tall) * mix(0.35, 1.0, uKindle);
    float ang = h3 * 6.2831 + life * 2.0 * (h1 - 0.5);
    float rad = 0.04 + 0.3 * life * (0.3 + 0.7 * h2);
    vec3 p = vec3(cos(ang) * rad, 0.3 + life * rise, sin(ang) * rad * 0.7);
    // a light breeze carries the plume off to the side, away from the speaker
    p.x += 0.26 * life * (0.6 + 0.4 * h1);
    p.z -= 0.06 * life;
    p.x += sin(uTime * 1.3 + h1 * 20.0) * 0.035 * life;
    float flick = 0.7 + 0.3 * sin(uTime * (7.0 + h1 * 9.0) + h2 * 30.0);
    float hero = step(0.88, h1);
    vA = smoothstep(0.36, 0.5, p.y) * pow(max(1.0 - life, 0.0), 1.3) * uSpark * flick * (0.8 + 0.5 * hero);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // sized in world units: most sparks ~1.4 cm, a few hero sparks ~3 cm
    gl_PointSize = mix(0.011 + 0.008 * h2, 0.03, hero) * (1.0 - 0.35 * life) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const emberFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d);
    gl_FragColor = vec4(uColor * a * vA, a * vA);
  }
`

/** Camera-facing soft halo around the fire, so the focal glow blooms as a round warm aura. */
const haloVert = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`
const haloFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uKindle;
  uniform float uFlick;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = exp(-r * r * 6.0) * 0.34 + exp(-r * r * 30.0) * 0.36;
    a *= smoothstep(1.0, 0.7, r) * uKindle * uFlick;
    gl_FragColor = vec4(uColor * a, a);
  }
`

const N_FIG = 8 // speaker + listeners
const coalVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const coalFrag = /* glsl */ `
  uniform float uTime;
  uniform float uCoal;
  uniform float uFlick;
  uniform vec3 uHot;
  uniform vec3 uDeep;
  varying vec2 vP;
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float r = length(vP) / 0.17;
    float n = vnoise(vP * 60.0 + vec2(0.0, uTime * 0.4)) * 0.6 + vnoise(vP * 140.0 - uTime * 0.7) * 0.4;
    // grows from a small glowing core outward as the fire kindles
    float reach = mix(0.25, 1.0, uCoal);
    float body = 1.0 - smoothstep(0.2 * reach, reach, r);
    float a = body * (0.45 + 0.55 * n) * uCoal * (0.85 + 0.15 * uFlick);
    vec3 col = mix(uDeep, uHot, smoothstep(0.35, 0.85, n) * (1.0 - r));
    gl_FragColor = vec4(col * a, a);
  }
`

const groundDecl = /* glsl */ `
  uniform float uKindle;
  uniform float uFlick;
  uniform float uGround;
  uniform float uProgress;
  uniform vec3 uEmber;
  uniform vec4 uFig[${N_FIG}];
  varying vec2 vGP;
  float segDist(vec2 p, vec2 a, vec2 b, out float t) {
    vec2 ab = b - a;
    t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    return length(p - a - ab * t);
  }
  // soft shadows thrown away from the fire, plus a contact patch under each figure
  float fireShadow(vec2 q) {
    float sh = 0.0;
    for (int i = 0; i < ${N_FIG}; i++) {
      vec4 f = uFig[i];
      float rev = clamp((uProgress - f.w) / 0.36, 0.0, 1.0);
      vec2 dir = normalize(f.xy + vec2(0.0001));
      float t;
      float d = segDist(q, f.xy, f.xy + dir * 0.62 * f.z, t);
      float w = 0.045 + 0.06 * t;
      float s = exp(-(d * d) / (w * w)) * (1.0 - t * 0.7) * 0.9;
      s = max(s, exp(-dot(q - f.xy, q - f.xy) / 0.006) * 0.85);
      sh = max(sh, s * rev);
    }
    return sh;
  }
`

function makeGroundMaterial(U: Uniforms, groundU: { value: number }, figs: THREE.Vector4[], R: number) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0c0f1c'),
    metalness: 0.2,
    roughness: 0.85,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.5,
  })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      uKindle: U.uKindle,
      uFlick: U.uFlick,
      uEmber: U.uEmber,
      uProgress: U.uProgress,
      uGround: groundU,
      uFig: { value: figs },
    })
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vGP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGP = position.xy;`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${groundDecl}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float gr = length(vGP) / ${R.toFixed(3)};
        // circle lies in xy, rotated onto the ground: local (x, 0, -y)
        float shade = 1.0 - fireShadow(vec2(vGP.x, -vGP.y)) * uKindle;
        totalEmissiveRadiance += uEmber * (0.3 * exp(-gr * gr * 9.0) + 0.21 * exp(-gr * gr * 3.2)) * uKindle * uFlick * shade;
        diffuseColor.rgb *= shade;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= (1.0 - smoothstep(0.58, 1.0, gr)) * uGround;`,
      )
  }
  return m
}

/* ------------------------------------------------------------------------------------------ */
/* Component                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const HEARTH = 1.3
const ease3 = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

export default function HumanGathering({ progress = 1, accent }: ModelProps) {
  const prog = useRef(progress)
  prog.current = progress
  const light = useRef<THREE.PointLight>(null)
  const hearth = useRef<THREE.Group>(null)

  const ember = accent ?? palette.ember

  const built = useMemo(() => {
    const U: Uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uFire: { value: new THREE.Vector3(0, 0.26, 0) },
      uKindle: { value: 0 },
      uFlick: { value: 1 },
      uEmber: { value: glow(ember, 1) },
      uIce: { value: glow(palette.ice, 1) },
    }
    const groundU = { value: 0 }
    const sparkU = { value: 0 }
    const { groups, all } = layout()
    const crowds = groups.map((g) => {
      const base = buildFigure(POSES[g.pose], g.look)
      return { key: g.key, list: g.list, geo: g.mirror ? mirrorX(base) : base }
    })
    const body = makeBodyMaterial(U)
    const hull = makeHullMaterial(U)
    const rings = makeRings(all)
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uProgress: U.uProgress, uEmber: U.uEmber },
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const GR = 1.85
    const groundGeo = new THREE.CircleGeometry(GR, 72)
    // seated people throw shorter shadows
    const figs = all.map((p) => new THREE.Vector4(p.x, p.z, p.s * (p.drop ? 0.62 : 1), p.delay))
    const groundMat = makeGroundMaterial(U, groundU, figs, GR)

    const N = 72
    const seeds = new Float32Array(N)
    for (let i = 0; i < N; i++) seeds[i] = (i * 0.61803 + 0.21) % 1
    const emberGeo = new THREE.BufferGeometry()
    emberGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime,
        uSpark: sparkU,
        uKindle: U.uKindle,
        uScale: { value: 1700 },
        uColor: { value: glow(ember, 2.6) },
      },
      vertexShader: emberVert,
      fragmentShader: emberFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    // teepee of logs
    const logParts: THREE.BufferGeometry[] = []
    const LOGS: [number, number, number][] = [
      [0.5, 0.155, 0.17], [2.05, 0.14, 0.15], [3.35, 0.16, 0.18], [4.75, 0.135, 0.14],
    ]
    LOGS.forEach(([a, r, top]) => {
      const base = new THREE.Vector3(Math.sin(a) * r, 0.012, Math.cos(a) * r)
      const tip = new THREE.Vector3(Math.sin(a + 0.6) * 0.022, top, Math.cos(a + 0.6) * 0.022)
      logParts.push(limb(base, tip, 0.022, 0.015, 8))
      logParts.push(ball(base, 0.022, 8, 5))
    })
    const logGeo = mergeGeometries(logParts, false)!
    logParts.forEach((g) => g.dispose())
    const logMat = new THREE.MeshStandardMaterial({
      color: '#0b0a0a',
      metalness: 0.4,
      roughness: 0.6,
      emissive: new THREE.Color(palette.emberDeep),
      emissiveIntensity: 0,
    })
    // a loose ring of hearth stones, dark satin catching the fire
    const stoneParts: THREE.BufferGeometry[] = []
    // an even ring of hearth stones
    const STONES: [number, number, number][] = Array.from({ length: 13 }, (_, i) => [
      (i / 13) * Math.PI * 2 + 0.12 * Math.sin(i * 2.3),
      0.218 + 0.008 * Math.sin(i * 1.7),
      0.9 + 0.18 * Math.sin(i * 3.1),
    ])
    STONES.forEach(([a, r, k], i) => {
      const g = new THREE.IcosahedronGeometry(0.03 * k, 1)
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(a) * r, 0.008, Math.cos(a) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.7, i * 1.3, i * 0.4)),
        new THREE.Vector3(1.35, 0.48, 1.0),
      )
      g.applyMatrix4(m)
      stoneParts.push(g)
    })
    const stoneGeo = mergeGeometries(stoneParts, false)!
    stoneParts.forEach((g) => g.dispose())
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#302d36', metalness: 0.25, roughness: 0.62 })
    // log benches under the seated figures
    const seatParts: THREE.BufferGeometry[] = []
    all.filter((p) => p.drop > 0).forEach((p) => {
      // a low, rounded boulder
      const g = new THREE.IcosahedronGeometry(1, 2)
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, 0.074 * p.s, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw + 0.3, 0.04)),
          new THREE.Vector3(0.125 * p.s, 0.072 * p.s, 0.105 * p.s),
        ),
      )
      seatParts.push(g)
    })
    const seatGeo = mergeGeometries(seatParts, false)!
    seatParts.forEach((g) => g.dispose())
    const seatMat = new THREE.MeshStandardMaterial({ color: '#2a201b', metalness: 0.05, roughness: 0.9, envMapIntensity: 0.15, transparent: true, opacity: 0 })
    const coalGeo = new THREE.CircleGeometry(0.17, 40)
    const coalMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime,
        uFlick: U.uFlick,
        uCoal: { value: 0 },
        uHot: { value: glow('#ffb04a', 1.15) },
        uDeep: { value: glow(palette.emberDeep, 0.55) },
      },
      vertexShader: coalVert,
      fragmentShader: coalFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const haloGeo = new THREE.PlaneGeometry(1, 1)
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uKindle: U.uKindle, uFlick: U.uFlick, uColor: { value: glow(ember, 1) }, uSize: { value: 1.15 } },
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { U, groundU, sparkU, seatGeo, seatMat, crowds, body, hull, rings, ringMat, groundGeo, groundMat, emberGeo, emberMat, logGeo, logMat, stoneGeo, stoneMat, haloGeo, haloMat, coalGeo, coalMat }
  }, [ember])

  const { U } = built

  useFrame((state, dt) => {
    const p = prog.current
    const cam = state.camera as THREE.PerspectiveCamera
    built.emberMat.uniforms.uScale.value = (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 35) / 2)))
    U.uTime.value += Math.min(dt, 0.1)
    U.uProgress.value = p
    // staged kindling: sparks first, then the flames and the light grow
    built.sparkU.value = ease3((p - 0.05) / 0.16)
    const kx = Math.min(1, Math.max(0, (p - 0.14) / 0.46))
    const kindle = kx * kx * (3 - 2 * kx)
    U.uKindle.value = kindle
    const tt = U.uTime.value
    const flick =
      0.86 + 0.07 * Math.sin(tt * 7.3) + 0.05 * Math.sin(tt * 12.9 + 1.7) + 0.04 * Math.sin(tt * 3.1 + 0.4) + 0.03 * Math.sin(tt * 21.7)
    U.uFlick.value = flick
    built.groundU.value = ease3(p / 0.3)
    built.seatMat.opacity = ease3((p - 0.2) / 0.25)
    if (light.current) light.current.intensity = 0.8 * kindle * flick
    built.logMat.emissiveIntensity = 0.16 * kindle * flick
    built.coalMat.uniforms.uCoal.value = ease3((p - 0.05) / 0.3)
    if (hearth.current) {
      const h = ease3((p - 0.01) / 0.2)
      hearth.current.scale.setScalar(Math.max(0.001, h * HEARTH))
      hearth.current.position.y = -0.04 * (1 - h)
    }
  })

  return (
    <group position={[0, -0.42, 0]} scale={0.88}>
      {/* ground, light pool and fire shadows */}
      <mesh geometry={built.groundGeo} material={built.groundMat} rotation-x={-Math.PI / 2} renderOrder={1} />
      <lineSegments geometry={built.rings} material={built.ringMat} renderOrder={2} />

      {/* fire */}
      <pointLight ref={light} position={[0, 0.44, 0]} color="#ff9a48" intensity={0} decay={2} distance={0} />
      <group ref={hearth} scale={0.001}>
        <mesh geometry={built.logGeo} material={built.logMat} />
        <mesh geometry={built.stoneGeo} material={built.stoneMat} />
      </group>
      <group scale={HEARTH}>
        <mesh geometry={built.coalGeo} material={built.coalMat} rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} renderOrder={3} />
        <Flame U={U} seed={0.1} h={0.403} r={0.15} pos={[0, 0.01, 0]} rotZ={0.08} />
        <Flame U={U} seed={0.53} h={0.329} r={0.115} pos={[0.07, 0.01, 0.025]} rotZ={-0.22} alpha={0.8} />
        <Flame U={U} seed={0.87} h={0.281} r={0.11} pos={[-0.07, 0.01, -0.01]} rotZ={0.28} alpha={0.8} />
        <Flame U={U} seed={0.67} h={0.244} r={0.1} pos={[0.0, 0.01, -0.07]} rotX={-0.24} alpha={0.65} />
        <Flame U={U} seed={0.31} h={0.22} r={0.1} pos={[0.01, 0.01, 0.065]} rotX={0.2} alpha={0.9} />
        <Flame U={U} seed={0.44} h={0.195} r={0.085} pos={[0.06, 0.01, -0.06]} rotX={-0.2} rotZ={-0.2} alpha={0.7} />
        <Flame U={U} seed={0.76} h={0.183} r={0.08} pos={[-0.06, 0.01, 0.055]} rotX={0.2} rotZ={0.22} alpha={0.7} />
        <mesh geometry={built.haloGeo} material={built.haloMat} position={[0, 0.14, 0]} renderOrder={5} frustumCulled={false} />
      </group>
      <points geometry={built.emberGeo} material={built.emberMat} frustumCulled={false} renderOrder={4} />

      {/* people */}
      <mesh geometry={built.seatGeo} material={built.seatMat} />
      {built.crowds.map((c) => (
        <Crowd key={c.key} geo={c.geo} list={c.list} body={built.body} hull={built.hull} />
      ))}
    </group>
  )
}
