/**
 * Shared helpers for the '90s pair: InventoryShelf + RetroComputer.
 * Draw-on linework (per-vertex reveal time), satin bodies, easing, and a faint floor grid.
 */
import * as THREE from 'three'

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)))
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

type V3 = [number, number, number]

/** Collects line segments, each vertex tagged with the build time (0..1) at which it is drawn. */
export class LineBuilder {
  pos: number[] = []
  t: number[] = []

  seg(a: V3, b: V3, t0: number, t1: number) {
    this.pos.push(...a, ...b)
    this.t.push(t0, t1)
    return this
  }

  /** Polyline drawn on progressively from t0 to t1, proportional to length. */
  poly(pts: V3[], t0: number, t1: number, closed = false) {
    const list = closed ? [...pts, pts[0]] : pts
    let total = 0
    const lens: number[] = []
    for (let i = 1; i < list.length; i++) {
      const l = Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1], list[i][2] - list[i - 1][2])
      lens.push(l)
      total += l
    }
    let acc = 0
    for (let i = 1; i < list.length; i++) {
      const ta = t0 + (t1 - t0) * (acc / total)
      acc += lens[i - 1]
      const tb = t0 + (t1 - t0) * (acc / total)
      this.seg(list[i - 1], list[i], ta, tb)
    }
    return this
  }

  /** The 12 edges of an axis-aligned box; verticals rise first, then the rings close. */
  box(min: V3, max: V3, t0: number, t1: number) {
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const m = t0 + (t1 - t0) * 0.5
    const corners: [number, number][] = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ]
    for (const [x, z] of corners) this.seg([x, y0, z], [x, y1, z], t0, m)
    this.poly(corners.map(([x, z]) => [x, y0, z] as V3), t0, m, true)
    this.poly(corners.map(([x, z]) => [x, y1, z] as V3), m, t1, true)
    return this
  }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.t, 1))
    return g
  }
}

/** Rounded rectangle outline in a local 2D plane, mapped to 3D by `map`. */
export function roundedRect(w: number, h: number, r: number, map: (x: number, y: number) => V3, steps = 6): V3[] {
  const pts: V3[] = []
  const cs: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cy, a0] of cs) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2)
      pts.push(map(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  }
  return pts
}

const lineVertex = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const lineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uOpacity;
  varying float vT;
  void main() {
    if (vT > uReveal + 0.0001) discard;
    // A hot draw head while the line is being drawn on.
    float head = (1.0 - step(0.999, uReveal)) * smoothstep(uReveal - 0.05, uReveal, vT);
    gl_FragColor = vec4(uColor * (1.0 + head * 2.0), uOpacity);
  }
`

/** Draw-on line material. Set `uniforms.uReveal.value` from progress (0..1). */
export function makeLineMaterial(color: THREE.Color, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uReveal: { value: 0 },
      uOpacity: { value: opacity },
    },
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Dark satin body; pushed back in depth so linework on its edges never z-fights. */
export function satin(color: string, metalness = 0.75, roughness = 0.32) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
  })
}

const gridVertex = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const gridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uCell;
  uniform vec2 uHalf;
  uniform float uReveal;
  varying vec2 vP;
  void main() {
    vec2 g = abs(fract(vP / uCell - 0.5) - 0.5) / max(fwidth(vP / uCell), vec2(1e-5));
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 q = vP / uHalf;
    float r = length(q);
    float fade = 1.0 - smoothstep(0.25, 1.0, r);
    float reveal = 1.0 - smoothstep(uReveal * 1.2 - 0.25, uReveal * 1.2, r);
    float glowPool = 0.06 * (1.0 - smoothstep(0.0, 0.9, r));
    gl_FragColor = vec4(uColor, (line * 0.55 + glowPool) * fade * reveal);
  }
`

/** Faint '90s floor grid with a radial fade, lying in the XZ plane. */
export function makeGridMaterial(color: THREE.Color, cell: number, halfX: number, halfZ: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uCell: { value: cell },
      uHalf: { value: new THREE.Vector2(halfX, halfZ) },
      uReveal: { value: 0 },
    },
    vertexShader: gridVertex,
    fragmentShader: gridFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

const satinVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying float vY;
  void main() {
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vW = wp.xyz;
    vY = clamp(position.y + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const satinFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform float uSheen;
  uniform float uWarm;
  varying vec3 vN;
  varying vec3 vW;
  varying float vY;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float f = 1.0 - max(dot(N, V), 0.0);
    float fres = f * f * f;
    float top = max(N.y, 0.0);
    float side = max(N.x, 0.0);
    vec3 c = uBase * (0.55 + 0.9 * vY);
    c += top * vec3(0.035, 0.04, 0.06) * uSheen;
    c += side * vec3(0.03, 0.017, 0.007) * uWarm;
    c += fres * vec3(0.05, 0.075, 0.12) * uSheen;
    gl_FragColor = vec4(c, 1.0);
  }
`

/**
 * Stylized dark satin: a top sheen, a cool fresnel rim and a warm catch on +x faces.
 * Reads as a solid object even where the environment reflection would go black.
 */
export function satinShader(
  _instanced = false,
  base = new THREE.Color(0.016, 0.014, 0.026),
  { sheen = 1, warm = 1 }: { sheen?: number; warm?: number } = {},
) {
  return new THREE.ShaderMaterial({
    uniforms: { uBase: { value: base }, uSheen: { value: sheen }, uWarm: { value: warm } },
    vertexShader: satinVertex,
    fragmentShader: satinFragment,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
  })
}
