/**
 * CoolingTower: a nuclear cooling tower for "The world is sticky" slide.
 *
 * A heavy satin-concrete hyperboloid (throat at ~3/4 height, a gentle crown flare) standing on a
 * ring beam carried by a continuous zig-zag of A-frame legs over a low basin. The shell is a
 * custom shader: dark navy concrete, broad soft sheen bands (cool key on the left, a wide satin
 * band across the front, a thin warm kicker on the right), faint horizontal pour lifts, a cool
 * fresnel silhouette and warm spill from the pilot light.
 *
 * Variants (cross-faded in useFrame):
 *  - "dormant" (default, the one the deck uses): intentionally still. A quiet ice lip, one slow
 *    ember "pilot light" ring breathing on an 8 s cycle with a faint flame travelling around it,
 *    and cold mist: a thin collar clinging to the lip (the mouth stays a dark void) and a veil of
 *    low sideways sheets that ride over the lip and sag down off both shoulders, drifting with
 *    the wind. Cold air sinks; nothing rises.
 *  - "active": ember lip and silhouette, warm glow in the throat and a billowing steam column.
 *
 * Build-in: the basin draws on, the A-frame legs rise around it, the ring beam lands, the shell
 * grows upward behind an ice construction front (the pilot ring lights as the front passes),
 * then the lip lights and the mist settles in.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = {
  title: 'Cooling tower',
  distance: 9.2,
  elevation: 12,
  azimuth: 24,
  variants: ['dormant', 'active'],
}

// hyperboloid profile r(y) = A * sqrt(1 + ((y - YT) / C)^2); slightly tighter C above the throat
// for a gentle crown flare (~1.13x the throat), a broad base (~1.8x the throat)
const A = 0.5
const Y0 = -0.9 // shell bottom (on the ring beam)
const Y1 = 1.12 // shell top
const YT = Y0 + 0.705 * (Y1 - Y0) // throat
const C_TOP = 0.92
const C_BOT = 1.0
const BEAM = 0.065 // ring beam height under the shell
const YB = -1.22 // ground
const PLINTH = 0.075
const YF = YB + PLINTH // leg feet
const ROWS = 80
const COLS = 128
const LEG_PAIRS = 15
const STEAM = 420
const PILOT_Y = Y0 + 0.2 * (Y1 - Y0)

const cAt = (y: number) => (y >= YT ? C_TOP : C_BOT)
const radiusAt = (y: number) => A * Math.sqrt(1 + ((y - YT) / cAt(y)) ** 2)
const R0 = radiusAt(Y0)
const R1 = radiusAt(Y1)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const expoOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const cubicOut = (x: number) => 1 - Math.pow(1 - x, 3)
const smooth = (x: number) => x * x * (3 - 2 * x)
const f = (x: number) => x.toFixed(4)

const GLSL_NOISE = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
  }
`

/** Hyperboloid shell with triangles ordered bottom→top, so drawRange grows it upward. */
function shellGeometry() {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= ROWS; j++) {
    const y = Y0 + (j / ROWS) * (Y1 - Y0)
    const r = radiusAt(y)
    const c = cAt(y)
    const dr = (A * A * (y - YT)) / (c * c * r)
    for (let i = 0; i <= COLS; i++) {
      const a = (i / COLS) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      pos.push(r * ca, y, r * sa)
      const n = new THREE.Vector3(ca, -dr, sa).normalize()
      nor.push(n.x, n.y, n.z)
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i
      const b = a + COLS + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

function ringLine(radius: number, y: number, mat: THREE.Material, segments = 200) {
  const pts: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(Math.cos(a) * radius, y, Math.sin(a) * radius)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const line = new THREE.Line(g, mat)
  line.userData.count = segments + 1
  return line
}

/** A thin glowing tube ring lying flat at height y. */
function ringTube(radius: number, y: number, mat: THREE.Material, tube = 0.0045) {
  const g = new THREE.TorusGeometry(radius, tube, 8, 240)
  g.rotateX(Math.PI / 2)
  const m = new THREE.Mesh(g, mat)
  m.position.y = y
  return m
}

const shellVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = position.y;
    gl_Position = projectionMatrix * mv;
  }
`

/** Satin concrete: dark navy body, broad soft sheen bands, faint pour lifts, fresnel, pilot spill. */
const shellFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform vec3 uRim;
  uniform vec3 uEdge;
  uniform vec3 uPilot;
  uniform float uSheen;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = max(dot(n, v), 0.0);
    float h = clamp((vY - ${f(Y0)}) / ${f(Y1 - Y0)}, 0.0, 1.0);
    float dif = max(dot(n, normalize(vec3(-0.55, 0.2, 0.8))), 0.0);
    // ground occlusion darkens the skirt so the flared base sits heavy and reads as one with the shell
    float occ = 0.45 + 0.55 * smoothstep(0.0, 0.6, h);
    vec3 col = uBase * (0.4 + 0.6 * dif) * occ;
    // broad satin bands, following the curvature (view-space normal)
    float key = exp(-pow((n.x + 0.5) / 0.28, 2.0)) * 0.8;
    float body = exp(-pow((n.x - 0.05) / 0.48, 2.0)) * 0.24;
    float kick = exp(-pow((n.x - 0.74) / 0.19, 2.0)) * 0.2;
    col += (uCool * (key + body) * mix(0.55, 1.0, h) + uWarm * kick * mix(0.6, 1.0, h)) * uSheen;
    // faint horizontal pour lifts (the concrete was poured in rings); fade out before they alias
    float u = vY / 0.11;
    float fw = fwidth(u);
    float d = abs(fract(u + 0.5) - 0.5);
    float lift = (1.0 - smoothstep(0.0, fw * 1.3 + 0.02, d)) * (1.0 - smoothstep(0.12, 0.35, fw)) * smoothstep(0.03, 0.07, h);
    col *= 1.0 - 0.07 * lift;
    // warm spill from the pilot light ring
    float pd = vY - ${f(PILOT_Y)};
    col += uPilot * 0.56 * exp(-pd * pd / 0.0065) * (0.35 + 0.65 * ndv);
    col += uPilot * 0.12 * exp(-pd * pd / 0.05) * ndv;
    // the pilot ring sits in a recessed groove: a dark reveal either side of it
    col *= 1.0 - 0.75 * exp(-pd * pd / 0.0007);
    col += uCool * 0.6 * exp(-(pd + 0.034) * (pd + 0.034) / 0.00004) * ndv; // lit lower lip of the groove
    // cool silhouette
    float fr = pow(1.0 - ndv, 3.2);
    col += uRim * fr * mix(0.4, 1.0, smoothstep(0.1, 0.8, h));
    // crisp glowing silhouette line, about two pixels wide at any distance (the deck's line-art edge)
    float edge = 1.0 - smoothstep(0.0, fwidth(ndv) * 2.4 + 0.018, ndv);
    col += uEdge * edge;
    gl_FragColor = vec4(col, 1.0);
  }
`

/** Inside of the shell: near-black, with warm light pooling at the throat when active. */
const interiorFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uGlow;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float h = smoothstep(${f(Y1 - 1.2)}, ${f(Y1)}, vY);
    // the glow hugs the inside of the lip and falls off fast, so the mouth stays a dark opening
    float hl = smoothstep(${f(Y1 - 0.13)}, ${f(Y1)}, vY);
    vec3 col = uBase * (0.25 + 0.75 * h) + uGlow * hl * hl * hl;
    gl_FragColor = vec4(col, 1.0);
  }
`

/** Cold mist pooled over the mouth, spilling sideways off the lip and drooping as it goes. */
const poolVertex = /* glsl */ `
  uniform vec3 uCenter;
  varying vec3 vP;
  varying float vOver;
  void main() {
    vec3 p = position + uCenter;
    float r = length(p.xz);
    float over = max(r - ${f(R1)}, 0.0);
    p.y -= over * 0.12 + over * over * 0.3;
    vP = p;
    vOver = over;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const poolFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uColor;
  varying vec3 vP;
  varying float vOver;
  ${GLSL_NOISE}
  void main() {
    vec3 p = vP;
    float r = length(p.xz);
    // a thin cold collar clinging around the lip; the mouth itself stays a dark void
    float lid = smoothstep(${f(R1 * 0.72)}, ${f(R1 * 0.95)}, r) * (1.0 - smoothstep(${f(R1 * 1.0)}, ${f(R1 * 1.18)}, r));
    // a tongue that streams downwind (+x), widening as it goes
    float w = 0.34 + 0.22 * max(p.x, 0.0);
    vec2 q = vec2((p.x - 0.45) / 0.55, p.z / w);
    float tongue = exp(-dot(q, q) * 1.6);
    float m = max(lid * 0.5, tongue * smoothstep(${f(R1 * 0.6)}, ${f(R1 * 1.05)}, r)) * (1.0 - smoothstep(0.35, 0.85, vOver));
    float n = fbm3(vec3(p.x * 2.4 - uTime * 0.06 + uSeed, p.z * 3.2, uTime * 0.025 + uSeed));
    float dens = smoothstep(0.32, 0.78, n * 0.75 + m * 0.45) * m;
    float a = dens * uOpacity;
    gl_FragColor = vec4(uColor * (0.75 + 0.35 * n), a);
  }
`

/**
 * Cold mist veil: a persistent, camera-facing layer of low sideways sheets. Each sheet runs along
 * the lip and sags down off it (further on the downwind right, a little on the left), thickening
 * as it sinks, broken up by noise that scrolls with the wind. Nothing ever rises. Two layers: one
 * just in front of the shell, one just behind it (seen only past the silhouette), so the mist
 * wraps the crown without ever cutting through the concrete.
 */
const veilVertex = /* glsl */ `
  uniform float uFwd;
  varying vec2 vQ;
  void main() {
    vec2 q = vec2(mix(-1.5, 2.0, uv.x), mix(-1.05, 0.35, uv.y));
    vQ = q;
    vec4 mv = modelViewMatrix * vec4(0.0, ${f(Y1)}, 0.0, 1.0);
    float s = length(modelViewMatrix[0].xyz);
    mv.z += uFwd * s;
    mv.xy += q * s;
    gl_Position = projectionMatrix * mv;
  }
`
const veilFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uColor;
  uniform vec4 uS[4]; // per sheet: lane height, start, end, strength
  uniform float uMouth;
  varying vec2 vQ;
  ${GLSL_NOISE}
  float sheet(vec2 q, vec4 S, float seed) {
    float u = q.x;
    // sinks steadily off the downwind shoulder, hugging the shell; barely spills upwind
    float rate = 0.2 + 0.08 * fract(seed * 0.37);
    // capped at ~15% of the shell height, so a sheet never loops away from the body
    float sagR = min(rate * pow(max(u - 0.15, 0.0) / 0.9, 1.5), 0.3);
    float sagL = 0.12 * pow(max(-u - 0.3, 0.0) / 0.5, 1.5);
    // a slow low-frequency warp so the sheets are ragged strata, not parallel arcs
    float warp = (fbm3(vec3(u * 0.9 + seed, uTime * 0.02, seed * 0.5)) - 0.5) * 0.2;
    float yc = S.x - sagR - sagL + warp;
    float th = 0.05 + 0.06 * smoothstep(0.0, 1.2, u);
    float d = (q.y - yc) / th;
    float prof = exp(-d * d);
    float ends = smoothstep(S.y, S.y + 0.45, u) * (1.0 - smoothstep(S.z - 0.6, S.z, u));
    float n = fbm3(vec3(u * 1.5 - uTime * 0.05 + seed, (q.y - yc) * 2.6, uTime * 0.025 + seed));
    float w = fbm3(vec3(u * 3.0 - uTime * 0.08 + seed * 2.0, (q.y - yc) * 3.6, seed));
    // densest close to the lip, thinning as it sinks and drifts away
    float near = 1.0 - 0.5 * smoothstep(0.3, 1.0, u);
    return prof * ends * S.w * near * smoothstep(0.26, 0.68, n) * (0.6 + 0.6 * w);
  }
  void main() {
    float sum = 0.0;
    for (int i = 0; i < 4; i++) sum += sheet(vQ, uS[i], uSeed + float(i) * 3.1);
    float dens = 1.0 - exp(-sum * 2.8);
    // the front layer stays off the open mouth, so it reads as a dark void from any elevation
    dens *= 1.0 - uMouth * 0.9 * smoothstep(-0.03, 0.05, vQ.y) * (1.0 - smoothstep(${f(R1 * 0.55)}, ${f(R1 * 0.95)}, abs(vQ.x)));
    gl_FragColor = vec4(uColor * (0.85 + 0.2 * dens), dens * uOpacity);
  }
`

const steamVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uPhase;
  uniform float uTime;
  uniform float uPx;
  uniform float uTopR;
  varying float vAlpha;
  varying float vLife;
  varying float vSeed;
  void main() {
    float life = fract(uPhase * (0.75 + 0.5 * aSeed.x) + aSeed.y);
    float vis = 1.0 - smoothstep(0.25, 0.26, aSeed.z);
    float ang = aSeed.w * 6.2831853 + uTime * 0.04;
    float r0 = uTopR * 0.36 * sqrt(aSeed.x);
    float spread = pow(max(life, 0.0), 2.2) * 0.85 * (0.6 + 0.8 * aSeed.y);
    vec3 p = vec3(cos(ang) * (r0 + spread), ${f(Y1 + 0.02)} + life * (0.95 + 0.45 * aSeed.y), sin(ang) * (r0 + spread));
    p.x += life * life * 0.8 + sin(uTime * 0.35 + aSeed.w * 12.0 + life * 4.0) * 0.08 * life;
    p.z += cos(uTime * 0.3 + aSeed.x * 9.0 + life * 3.0) * 0.08 * life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (0.3 + 1.0 * life) * (0.6 + 0.8 * aSeed.x) * length(modelViewMatrix[0].xyz);
    gl_PointSize = size * uPx / -mv.z;
    vAlpha = smoothstep(0.0, 0.18, life) * pow(max(1.0 - life, 0.0), 1.2) * vis * 0.62;
    vLife = life;
    vSeed = aSeed.w;
  }
`
const steamFragment = /* glsl */ `
  uniform vec3 uWarm;
  uniform vec3 uWhite;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vLife;
  varying float vSeed;
  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    c.y = -c.y;
    float r = length(c);
    float ang = atan(c.y, c.x);
    float edge = 0.9 + 0.08 * sin(ang * 5.0 + vSeed * 40.0) + 0.05 * sin(ang * 9.0 - vSeed * 23.0);
    float mask = 1.0 - smoothstep(edge - 0.42, edge, r);
    if (mask <= 0.001) discard;
    vec3 n = normalize(vec3(c, sqrt(max(1.0 - r * r, 0.05))));
    float lit = 0.4 + 0.65 * max(dot(n, normalize(vec3(-0.55, 0.6, 0.6))), 0.0);
    float under = max(dot(n, vec3(0.0, -0.8, 0.6)), 0.0) * (1.0 - smoothstep(0.05, 0.45, vLife));
    vec3 col = mix(vec3(0.09, 0.12, 0.22), uWhite, smoothstep(0.4, 1.05, lit)) + uWarm * under * 1.3;
    col *= 0.92 / max(0.92, max(col.r, max(col.g, col.b)));
    float a = mask * vAlpha * uOpacity * (0.35 + 0.65 * smoothstep(0.35, 0.8, lit));
    gl_FragColor = vec4(col, a);
  }
`

export default function CoolingTower({ progress = 1, accent, variant }: ModelProps) {
  const root = useRef<THREE.Group>(null)
  const legsRef = useRef<THREE.InstancedMesh>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const target = variant === 'active' ? 1 : 0
  const active = useRef(target)
  const targetRef = useRef(target)
  targetRef.current = target

  const warm = accent ?? palette.ember

  const parts = useMemo(() => {
    const shellGeo = shellGeometry()
    const shellUniforms = {
      uBase: { value: new THREE.Color('#161c38') },
      uCool: { value: new THREE.Color('#8fb4d8').multiplyScalar(0.3) },
      uWarm: { value: new THREE.Color(warm).multiplyScalar(0.3) },
      uRim: { value: glow(palette.ice, 0.55) },
      uEdge: { value: glow(palette.ice, 3) },
      uPilot: { value: new THREE.Color(warm).multiplyScalar(0.3) },
      uSheen: { value: 1 },
    }
    const shellMat = new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexShader: shellVertex,
      fragmentShader: shellFragment,
      toneMapped: false,
    })
    const interiorUniforms = {
      uBase: { value: new THREE.Color('#04060c') },
      uGlow: { value: new THREE.Color(0, 0, 0) },
    }
    const interiorMat = new THREE.ShaderMaterial({
      uniforms: interiorUniforms,
      vertexShader: shellVertex,
      fragmentShader: interiorFragment,
      side: THREE.BackSide,
      toneMapped: false,
    })

    // the one ember pilot light
    // a slow brighter "flame" travels around the ring, so it reads as a live pilot, not a stripe
    const pilotUniforms = { uColor: { value: glow(warm, 1) }, uHead: { value: 0 }, uHeadGain: { value: 1.2 } }
    const pilotMat = new THREE.ShaderMaterial({
      uniforms: pilotUniforms,
      vertexShader: /* glsl */ `
        varying float vA;
        void main() {
          vA = atan(position.z, position.x);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uHead;
        uniform float uHeadGain;
        varying float vA;
        void main() {
          float d = abs(mod(vA - uHead + 3.14159265, 6.2831853) - 3.14159265);
          gl_FragColor = vec4(uColor * (1.0 + uHeadGain * exp(-d * d / 0.15)), 1.0);
        }
      `,
      toneMapped: false,
    })
    const pilot = ringTube(radiusAt(PILOT_Y) + 0.0005, PILOT_Y, pilotMat, 0.0042) // half sunk in its groove
    // faint ice contour rings up the shell: line-art that reads even at small size
    const contourMat = new THREE.MeshBasicMaterial({ color: glow(palette.ice, 0.3), toneMapped: false, transparent: true })
    const contours = [0.42, 0.6, 0.72, 0.84].map((fr) => {
      const y = Y0 + fr * (Y1 - Y0)
      const m = ringTube(radiusAt(y) + 0.002, y, contourMat.clone(), 0.0032)
      m.userData.y = y
      return m
    })

    // construction front
    const frontMat = new THREE.MeshBasicMaterial({ color: glow(palette.ice, 3), toneMapped: false, transparent: true })
    const front = ringTube(1, 0, frontMat, 0.009) // tube scales with the radius: ~0.0045 at the throat

    // crown: a dark cornice with a glowing ice line on its outer top edge
    const darkMat = new THREE.MeshStandardMaterial({ color: '#1a2140', metalness: 0.6, roughness: 0.4, transparent: true })
    const corniceGeo = new THREE.TorusGeometry(R1 + 0.006, 0.02, 10, 200)
    const lipMat = new THREE.MeshBasicMaterial({ color: glow(palette.ice, 3), toneMapped: false, transparent: true })
    const lipGeo = new THREE.TorusGeometry(R1 + 0.012, 0.0065, 8, 220)

    // ring beam under the shell, with a gold edge line along its foot
    const beamGeo = new THREE.CylinderGeometry(R0 + 0.001, R0 + 0.024, BEAM, 160, 1, true)
    beamGeo.translate(0, Y0 - BEAM / 2, 0) // at its true height, so the shell shader shades it as the base
    const beam = new THREE.Mesh(beamGeo, shellMat) // same satin concrete as the shell
    const beamEdgeMat = new THREE.MeshBasicMaterial({ color: glow('#6f93b8', 0.5), toneMapped: false, transparent: true })
    const beamEdge = ringTube(R0 + 0.026, Y0 - BEAM, beamEdgeMat, 0.0036)

    // A-frame legs: a continuous zig-zag. Each leg is a slim box whose outer face points out, so
    // its edge line can sit exactly on that face.
    const drdy = (A * A * (Y0 - YT)) / (C_BOT * C_BOT * R0) // negative: the base flares out going down
    const topY = Y0 - BEAM
    const rTop = R0 - 0.033 // the legs tuck under the ring beam
    const rFoot = rTop - drdy * (topY - YF) * 0.9
    const LEG_W = 0.084
    const LEG_D = 0.056
    const legGeo = new THREE.BoxGeometry(LEG_W, 1, LEG_D)
    legGeo.translate(0, 0.5, 0)
    const legs = Array.from({ length: LEG_PAIRS * 2 }, (_, i) => {
      const a0 = (Math.floor(i / 2) / LEG_PAIRS) * Math.PI * 2
      const sign = i % 2 === 0 ? 1 : -1
      const fa = a0 + (sign * Math.PI) / LEG_PAIRS // feet meet the neighbours' feet: one continuous zig-zag
      const top = new THREE.Vector3(Math.cos(a0) * rTop, topY, Math.sin(a0) * rTop)
      const foot = new THREE.Vector3(Math.cos(fa) * rFoot, YF, Math.sin(fa) * rFoot)
      const dir = top.clone().sub(foot)
      const len = dir.length()
      const yAx = dir.normalize()
      const am = (a0 + fa) / 2
      const radial = new THREE.Vector3(Math.cos(am), 0, Math.sin(am))
      const zAx = radial.sub(yAx.clone().multiplyScalar(radial.dot(yAx))).normalize()
      const xAx = new THREE.Vector3().crossVectors(yAx, zAx)
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx))
      return { foot, top, q, len, zAx, delay: Math.floor(i / 2) / LEG_PAIRS }
    })
    const legMat = new THREE.MeshStandardMaterial({ color: '#1a2238', metalness: 0.2, roughness: 0.7 })
    const legLinePos: number[] = []
    legs.forEach((l) => {
      const o = l.zAx.clone().multiplyScalar(LEG_D / 2 + 0.0008)
      legLinePos.push(l.foot.x + o.x, l.foot.y + o.y, l.foot.z + o.z, l.top.x + o.x, l.top.y + o.y, l.top.z + o.z)
    })
    const legLineGeo = new THREE.BufferGeometry()
    legLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(legLinePos, 3))
    const legLineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#7da0c4').multiplyScalar(0.55), toneMapped: false, transparent: true })
    const legLines = new THREE.LineSegments(legLineGeo, legLineMat)

    // basin: a low dark plinth around the feet, with a faint gold edge that draws on
    const rBasin = rFoot + 0.025
    const basinGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(rFoot - 0.12, PLINTH),
        new THREE.Vector2(rFoot - 0.12, 0),
        new THREE.Vector2(rBasin, 0),
        new THREE.Vector2(rBasin, PLINTH),
        new THREE.Vector2(rFoot - 0.12, PLINTH),
      ],
      160,
    )
    const basinMat = new THREE.MeshStandardMaterial({ color: '#161d38', metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true })
    // a near-black core inside the leg ring hides the far-side legs, so the front A-frames read crisply
    const coreGeo = new THREE.CylinderGeometry(rTop - 0.09, rFoot - 0.1, topY - YF, 96, 1, true)
    coreGeo.translate(0, (topY + YF) / 2, 0)
    const coreMat = new THREE.MeshBasicMaterial({ color: '#03050a', side: THREE.DoubleSide, transparent: true })
    // a faint cold halo on the ground so the tower stands on something
    const groundGeo = new THREE.RingGeometry(rBasin * 0.98, rBasin * 1.45, 128, 1)
    groundGeo.rotateX(-Math.PI / 2)
    const groundUniforms = { uColor: { value: new THREE.Color(palette.ice).multiplyScalar(0.5) }, uOpacity: { value: 0 } }
    const groundMat = new THREE.ShaderMaterial({
      uniforms: groundUniforms,
      vertexShader: /* glsl */ `
        varying float vR;
        void main() {
          vR = length(position.xz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vR;
        void main() {
          float t = clamp((vR - ${f(rBasin * 0.98)}) / ${f(rBasin * 0.47)}, 0.0, 1.0);
          float a = pow(1.0 - t, 2.2) * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const floorGeo = new THREE.CircleGeometry(rFoot - 0.1, 96)
    floorGeo.rotateX(-Math.PI / 2)
    const floorMat = new THREE.MeshBasicMaterial({ color: '#020308', transparent: true })
    const basinLineMat = new THREE.LineBasicMaterial({ color: glow('#6f93b8', 0.5), toneMapped: false, transparent: true })
    const basinLine = ringLine(rBasin, YB + PLINTH, basinLineMat)

    // --- dormant mist ---
    const mistColor = new THREE.Color('#a9bfd0') // grey-ice, quieter than the lip line
    const poolGeo = new THREE.PlaneGeometry(2.6, 1.8, 32, 24)
    poolGeo.rotateX(-Math.PI / 2)
    const pools = [0, 1].map((i) => {
      const uniforms = {
        uCenter: { value: new THREE.Vector3(0.55, Y1 + 0.02 + i * 0.035, 0) },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: i * 7.3 },
        uColor: { value: mistColor },
      }
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: poolVertex,
        fragmentShader: poolFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      return { mat, uniforms }
    })
    const veilGeo = new THREE.PlaneGeometry(1, 1)
    const veilSpec = [
      // in front of the shell: one long sheet riding the lip, a thinner one lower across the crown
      { fwd: 0.85, opacity: 0.36, mouth: 1, seed: 0.4, S: [[0.03, -0.62, 0.8, 0.9], [-0.11, -0.45, 0.75, 0.5], [-0.2, -0.25, 0.7, 0.35], [0, 0, 0, 0]] },
      // behind the shell: wider sheets that only show past the silhouette, spilling off both sides
      { fwd: -0.95, opacity: 0.46, mouth: 0, seed: 7.7, S: [[0.06, -0.66, 0.85, 0.8], [-0.07, -0.5, 0.78, 0.5], [0, 0, 0, 0], [0, 0, 0, 0]] },
    ]
    const veils = veilSpec.map((v) => {
      const base = v.S.map((x) => new THREE.Vector4(...(x as [number, number, number, number])))
      const uniforms = {
        uFwd: { value: v.fwd },
        uMouth: { value: v.mouth },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: v.seed },
        uColor: { value: mistColor },
        uS: { value: base.map((b) => b.clone()) },
      }
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: veilVertex,
        fragmentShader: veilFragment,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      return { mat, uniforms, base, opacity: v.opacity }
    })

    // --- active steam (not used by the deck; kept so the variant works) ---
    const seeds = new Float32Array(STEAM * 4)
    for (let i = 0; i < STEAM * 4; i++) seeds[i] = Math.random()
    const steamGeo = new THREE.BufferGeometry()
    steamGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(STEAM * 3), 3))
    steamGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const steamUniforms = {
      uPhase: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: 1000 },
      uTopR: { value: R1 },
      uWarm: { value: new THREE.Color(warm).multiplyScalar(1.6) },
      uWhite: { value: new THREE.Color('#e6ebf2').multiplyScalar(0.8) },
      uOpacity: { value: 0 },
    }
    const steamMat = new THREE.ShaderMaterial({
      uniforms: steamUniforms,
      vertexShader: steamVertex,
      fragmentShader: steamFragment,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })

    return {
      shellGeo, shellMat, shellUniforms, interiorMat, interiorUniforms, pilot, pilotMat, pilotUniforms, contours, contourMat, front, frontMat,
      darkMat, corniceGeo, lipMat, lipGeo, beam, beamEdge, beamEdgeMat, legGeo, legs, legMat,
      legLines, legLineMat, basinGeo, basinMat, floorGeo, floorMat, basinLine, basinLineMat, coreGeo, coreMat, groundGeo, groundMat, groundUniforms,
      poolGeo, pools, veilGeo, veils, steamGeo, steamMat, steamUniforms,
    }
  }, [warm])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const cIce = useMemo(() => new THREE.Color(palette.ice), [])
  const cWarm = useMemo(() => new THREE.Color(warm), [warm])
  const tmp = useMemo(() => new THREE.Color(), [])
  const tmp2 = useMemo(() => new THREE.Color(), [])
  const grp = useRef<THREE.Group>(null)

  useFrame((state, dt) => {
    const p = progressRef.current
    const t = state.clock.elapsedTime
    if (!root.current || !legsRef.current) return
    root.current.visible = p > 0.001

    active.current += (targetRef.current - active.current) * (1 - Math.exp(-dt * 2.2))
    const k = smooth(clamp01(active.current))

    // --- build-in ---
    const basinK = cubicOut(seg(p, 0.0, 0.18))
    parts.basinMat.opacity = basinK
    parts.floorMat.opacity = basinK
    parts.coreMat.opacity = basinK
    parts.groundUniforms.uOpacity.value = 0.22 * basinK
    parts.basinLine.geometry.setDrawRange(0, Math.floor(cubicOut(seg(p, 0.0, 0.2)) * parts.basinLine.userData.count))
    parts.basinLine.visible = p > 0.001

    for (let i = 0; i < parts.legs.length; i++) {
      const l = parts.legs[i]
      const kk = expoOut(seg(p, 0.04 + l.delay * 0.1, 0.14 + l.delay * 0.1))
      dummy.position.copy(l.foot)
      dummy.quaternion.copy(l.q)
      dummy.scale.set(kk > 0 ? 1 : 0, Math.max(1e-4, l.len * kk), kk > 0 ? 1 : 0)
      dummy.updateMatrix()
      legsRef.current.setMatrixAt(i, dummy.matrix)
    }
    legsRef.current.instanceMatrix.needsUpdate = true
    const legLineK = cubicOut(seg(p, 0.22, 0.36))
    parts.legLines.visible = legLineK > 0
    parts.legLineMat.opacity = legLineK

    const beamK = cubicOut(seg(p, 0.14, 0.22))
    parts.beam.visible = beamK > 0
    parts.beamEdgeMat.opacity = beamK
    parts.beamEdge.visible = beamK > 0

    const shellK = seg(p, 0.2, 0.84)
    const grow = 0.5 * shellK + 0.5 * smooth(shellK)
    const rows = Math.ceil(grow * ROWS)
    parts.shellGeo.setDrawRange(0, rows * COLS * 6)
    const topY = Y0 + (rows / ROWS) * (Y1 - Y0)
    const frontOn = shellK > 0 && shellK < 1 ? smooth(seg(shellK, 0, 0.08)) * (1 - smooth(seg(shellK, 0.93, 1))) : 0
    parts.front.visible = frontOn > 0.01
    parts.front.position.y = topY + 0.004
    parts.front.scale.set(radiusAt(topY) * 1.003, 1, radiusAt(topY) * 1.003)
    parts.frontMat.opacity = frontOn
    parts.frontMat.color.copy(cIce).lerp(cWarm, k).multiplyScalar(0.95 * (1 - 0.25 * smooth(seg(shellK, 0.85, 0.98))))

    const lit = cubicOut(seg(p, 0.8, 0.9))
    const crownOn = grow >= 0.97

    // --- the pilot light: lights with a flare as the front passes, then breathes on an 8 s cycle ---
    const passed = topY >= PILOT_Y
    const flare = passed && shellK < 1 ? 1 - clamp01((topY - PILOT_Y) / 0.35) : 0
    const sleep = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 8)
    const swell = smooth(seg(p, 0.88, 1))
    const pilotIn = smooth(clamp01((topY - PILOT_Y) / 0.08))
    const pilotLevel = pilotIn * ((1.0 + swell * (-0.2 + 1.15 * sleep)) * (1 - k) + k * 4.5)
    parts.pilot.visible = passed
    // contour rings light as the construction front passes them
    for (const c of parts.contours) {
      const fade = smooth(clamp01((topY - c.userData.y) / 0.08))
      c.visible = fade > 0
      ;(c.material as THREE.MeshBasicMaterial).opacity = fade
    }
    parts.shellUniforms.uEdge.value.copy(cIce).lerp(cWarm, k).multiplyScalar(3 * cubicOut(seg(shellK, 0, 0.2)))
    parts.pilotUniforms.uColor.value.copy(cWarm).multiplyScalar(pilotLevel + 1.5 * flare)
    parts.pilotUniforms.uHead.value = (t * Math.PI * 2) / 14
    parts.pilotUniforms.uHeadGain.value = swell * (1 - k) * (1.6 + 0.6 * sleep)
    parts.shellUniforms.uPilot.value.copy(cWarm).multiplyScalar(passed ? pilotIn * (0.08 + swell * (0.05 + 0.1 * sleep)) + 0.2 * k + 0.15 * flare : 0)

    // --- variant look ---
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.4)
    tmp.copy(cIce).lerp(cWarm, k)
    parts.shellUniforms.uRim.value.copy(tmp).multiplyScalar((0.35 + 0.15 * cubicOut(shellK)) * (1 + 0.6 * k))
    parts.shellUniforms.uWarm.value.copy(cWarm).multiplyScalar(0.22 + 0.25 * k)
    parts.lipMat.color.copy(tmp).multiplyScalar(((1 - k) * (1.0 + 0.2 * sleep) + k * (5 + 0.8 * breathe)) * lit + 0.001)
    parts.lipMat.opacity = lit
    // a cold glow pooled just inside the mouth while dormant; warm light in the throat when active
    parts.interiorUniforms.uGlow.value.copy(cIce).multiplyScalar(0.2 * (1 - k) * lit * (0.85 + 0.15 * sleep)).add(tmp2.copy(cWarm).multiplyScalar(0.5 * k * lit * (0.8 + 0.2 * breathe)))
    // the cornice fades in with the lip instead of popping
    if (grp.current) grp.current.visible = crownOn || lit > 0.001
    parts.darkMat.opacity = lit

    // --- dormant mist: a pool on the lip, and sheets sinking down the outside of the shell ---
    const mistIn = cubicOut(seg(p, 0.86, 1)) * (1 - k)
    for (let i = 0; i < parts.pools.length; i++) {
      const u = parts.pools[i].uniforms
      u.uTime.value = t
      u.uOpacity.value = mistIn * [0.26, 0.16][i] * (0.85 + 0.15 * Math.sin(t * 0.21 + i * 2.0))
      parts.pools[i].mat.visible = mistIn > 0.001
    }
    for (let i = 0; i < parts.veils.length; i++) {
      const v = parts.veils[i]
      v.uniforms.uTime.value = t
      v.uniforms.uOpacity.value = mistIn * v.opacity
      // each sheet breathes slowly on its own cycle, so the veil is never empty and never static
      for (let j = 0; j < 4; j++) {
        v.uniforms.uS.value[j].w = v.base[j].w * (0.65 + 0.35 * Math.sin(t * 0.13 + j * 1.9 + i * 0.8))
        v.uniforms.uS.value[j].x = v.base[j].x - 0.02 * (0.5 + 0.5 * Math.sin(t * 0.07 + j * 2.3))
      }
      v.mat.visible = mistIn > 0.001
    }

    // --- active steam ---
    const steamIn = cubicOut(seg(p, 0.9, 1)) * k
    parts.steamUniforms.uPhase.value += dt * 0.175
    parts.steamUniforms.uTime.value = t
    const cam = state.camera as THREE.PerspectiveCamera
    parts.steamUniforms.uPx.value = state.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 35) / 2))
    parts.steamUniforms.uOpacity.value = steamIn
    parts.steamMat.visible = steamIn > 0.001
  })

  return (
    <group ref={root} position-y={0.03}>
      <mesh geometry={parts.basinGeo} material={parts.basinMat} position-y={YB} />
      <mesh geometry={parts.floorGeo} material={parts.floorMat} position-y={YB + 0.01} />
      <primitive object={parts.basinLine} />
      <instancedMesh ref={legsRef} args={[parts.legGeo, parts.legMat, LEG_PAIRS * 2]} frustumCulled={false} />
      <primitive object={parts.legLines} />
      <mesh geometry={parts.coreGeo} material={parts.coreMat} />
      <mesh geometry={parts.groundGeo} material={parts.groundMat} position-y={YB + 0.003} renderOrder={1} />
      <primitive object={parts.beam} />
      <primitive object={parts.beamEdge} />
      <mesh geometry={parts.shellGeo} material={parts.shellMat} />
      <mesh geometry={parts.shellGeo} material={parts.interiorMat} />
      <primitive object={parts.pilot} />
      {parts.contours.map((c, i) => (
        <primitive key={`c${i}`} object={c} />
      ))}
      <primitive object={parts.front} />
      <group ref={grp}>
        <mesh geometry={parts.corniceGeo} material={parts.darkMat} rotation-x={Math.PI / 2} position-y={Y1} />
        <mesh geometry={parts.lipGeo} material={parts.lipMat} rotation-x={Math.PI / 2} position-y={Y1 + 0.016} />
      </group>
      {parts.pools.map((d, i) => (
        <mesh key={`p${i}`} geometry={parts.poolGeo} material={d.mat} frustumCulled={false} renderOrder={6} />
      ))}
      {parts.veils.map((d, i) => (
        <mesh key={`v${i}`} geometry={parts.veilGeo} material={d.mat} frustumCulled={false} renderOrder={6} />
      ))}
      <points geometry={parts.steamGeo} material={parts.steamMat} frustumCulled={false} renderOrder={7} />
    </group>
  )
}
