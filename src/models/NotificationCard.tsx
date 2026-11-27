/**
 * NotificationCard: a floating glass OS toast. "New model released" + a label subline.
 *
 * Built to be cheap because the "work harder" slide spins 30-60 of them in a vortex:
 * shared slab geometry/material, and one SDF shader quad that draws the glass, the rim
 * line, the shimmer sweep and the glowing app icon in a single draw call. Two troika texts.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { fonts, glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

/** Card face size in local units at scale 1: [width, height]. */
export const CARD_SIZE: [number, number] = [2.3, 0.66]
const [W, H] = CARD_SIZE
const RADIUS = 0.2
const DEPTH = 0.05
const BEVEL = 0.014
const ICON_X = -W / 2 + 0.36
const ICON_R = 0.15
const TEXT_X = -W / 2 + 0.64
const TEXT_W = W - 0.64 - 0.14
const SUB_Y = -0.125

export const meta: ModelMeta = {
  title: 'Notification card',
  distance: 3.9,
  elevation: 8,
  azimuth: 18,
}

export type NotificationCardProps = ModelProps & {
  /** Dim subline under the title. */
  label?: string
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

type Shared = { slab: THREE.BufferGeometry; glass: THREE.PlaneGeometry; slabMat: THREE.MeshStandardMaterial }
let shared: Shared | null = null
function getShared(): Shared {
  if (shared) return shared
  const slab = new THREE.ExtrudeGeometry(roundedRect(W - BEVEL * 2, H - BEVEL * 2, RADIUS - BEVEL), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 6,
  })
  slab.translate(0, 0, -DEPTH - BEVEL)
  const glass = new THREE.PlaneGeometry(W + 0.02, H + 0.02)
  const slabMat = new THREE.MeshStandardMaterial({ color: '#161d34', metalness: 0.75, roughness: 0.26 })
  shared = { slab, glass, slabMat }
  return shared
}

const glassVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const glassFragment = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uFace;
  uniform float uRadius;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uDraw;
  uniform float uIcon;
  uniform float uFlash;
  uniform vec2 uIconPos;
  uniform float uIconR;
  uniform vec3 uRim;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;

  float sdRound(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRound(p, uFace * 0.5, uRadius);
    float aa = fwidth(d) + 1e-4;
    float inside = (1.0 - smoothstep(-aa, aa, d));
    if (inside <= 0.0) discard;

    float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.5);

    // Rim line, drawn on from top-centre around both sides.
    float a = abs(atan(p.x, p.y)) / 3.14159265;
    float drawn = 1.0 - smoothstep(uDraw - 0.04, uDraw + 0.04, a);
    float line = 1.0 - smoothstep(aa * 0.6, aa * 1.6 + 0.002, abs(d + 0.007));
    float inner = exp(d / 0.045) * 0.35;

    // Frosted body: cool sheen from the top-left key, a faint ember wash at the bottom-right.
    vec2 n = p / (uFace * 0.5);
    float sheen = smoothstep(-1.0, 1.0, n.y * 0.8 - n.x * 0.35);
    float warm = smoothstep(0.1, 1.2, n.x * 0.7 - n.y * 0.6) * exp(d / 0.035);
    vec3 col = vec3(0.014, 0.02, 0.045) + vec3(0.05, 0.085, 0.14) * pow(sheen, 3.0);
    float alpha = 0.6 + 0.2 * sheen;

    // Edge light: hairline rim, a fainter second rim inset, soft inner fresnel.
    float line2 = 1.0 - smoothstep(aa * 0.5, aa * 1.4 + 0.001, abs(d + 0.03));
    vec3 rim = uRim * (line * (0.6 + 0.8 * fres) + line2 * 0.16 + inner * (0.2 + 0.6 * fres)) * drawn;
  #ifdef BACK
    rim *= 0.5;
    col *= 0.7;
    // A soft ice bloom where the icon sits on the other side, so flipped cards are not voids.
    vec2 gp = p - vec2(-uIconPos.x, 0.0);
    float ghost = 1.0 - smoothstep(-aa, aa, length(gp) - uIconR);
    col += uAccent * (0.16 * ghost + 0.06 * exp(-length(gp) / 0.3));
    // Faint smears where the two text lines sit on the other side.
    float t1 = sdRound(p - vec2(-0.25, 0.1), vec2(0.7, 0.045), 0.045);
    float t2 = sdRound(p - vec2(-0.3, -0.125), vec2(0.65, 0.032), 0.032);
    col += vec3(0.6, 0.7, 0.85) * 0.06 * (1.0 - smoothstep(-0.02, 0.02, min(t1, t2)));
  #endif
    // Reflected ember from the warm key: a thin warm tint hugging the bottom-right rim.
    rim += vec3(1.0, 0.55, 0.18) * warm * 0.55 * drawn;
    col += rim;
    alpha += (line + line2 * 0.3 + inner * 0.5 + warm * 0.4) * drawn;

    // Shimmer sweep: a diagonal highlight band passing every few seconds.
    float cyc = fract(uTime / 6.0 + uSeed);
    float c = mix(-1.9, 2.6, cyc) * uFace.x * 0.5;
    float s = p.x + p.y * 1.1;
    float band = exp(-pow((s - c) / 0.06, 2.0)) + 0.4 * exp(-pow((s - c + 0.16) / 0.025, 2.0));
    float flashC = mix(-1.3, 1.3, uFlash) * uFace.x * 0.5;
    float flash = exp(-pow((s - flashC) / 0.16, 2.0)) * step(0.001, uFlash) * (1.0 - uFlash);
    // Damp the sweep over the text block so the lines keep their contrast.
    float textZone = smoothstep(-0.62, -0.48, p.x) * (1.0 - smoothstep(0.17, 0.24, abs(p.y + 0.01)));
    band = (band * 0.55 + flash * 1.4) * (1.0 - 0.7 * textZone);
    col += vec3(0.75, 0.92, 1.0) * band * 0.2;
    alpha += band * 0.12;

  #ifndef BACK
    // App icon: glowing ice dot with a dark four-point sparkle glyph.
    vec2 ip = p - uIconPos;
    float ir = uIconR * uIcon;
    float di = length(ip) - ir;
    float disc = (1.0 - smoothstep(-aa, aa, di)) * step(0.001, uIcon);
    float halo = exp(-max(di, 0.0) / 0.05) * uIcon;
    vec2 q = ip / max(ir, 1e-4);
    // Smooth radial gradient: white-hot core, saturated ice edge. Kept near 1.0 per channel
    // (the grain pass speckles big surfaces above that); the thin outer ring + halo bloom.
    float rr = length(q - vec2(-0.18, 0.22));
    vec3 iconCol = mix(vec3(0.82, 1.1, 1.18), uAccent * vec3(0.55, 0.85, 1.05), smoothstep(0.0, 1.0, rr));
    iconCol *= 0.8 + 0.2 * (1.0 - smoothstep(0.7, 1.0, length(q)));
    float star = sqrt(abs(q.x)) + sqrt(abs(q.y));
    float glyph = 1.0 - smoothstep(0.84, 0.84 + fwidth(star) * 1.5, star);
    iconCol = mix(iconCol, vec3(0.01, 0.025, 0.06), glyph * 0.95);
    float ring = 1.0 - smoothstep(aa * 0.5, aa * 1.5 + 0.002, abs(di - 0.032));
    col = mix(col, iconCol, disc);
    col += uAccent * (ring * 1.2 + halo * 0.5) * (1.0 - disc);
    alpha = max(alpha, disc);
    alpha += (halo * 0.35 + ring) * (1.0 - disc);
  #endif

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * inside * uOpacity);
  }
`

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeOutBack = (x: number) => {
  const c = 1.5
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)))

type TroikaText = THREE.Mesh & { fillOpacity: number; clipRect: number[] | null }

export default function NotificationCard({
  progress = 1,
  accent = palette.ice,
  label = 'Available now · update today',
}: NotificationCardProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const title = useRef<TroikaText>(null)
  const sub = useRef<TroikaText>(null)
  const prog = useRef(progress)
  prog.current = progress
  const { slab, glass, slabMat } = getShared()
  const seed = useMemo(() => Math.random(), [])

  const uniforms = useMemo(
    () => ({
      uSize: { value: new THREE.Vector2(W + 0.02, H + 0.02) },
      uFace: { value: new THREE.Vector2(W, H) },
      uRadius: { value: RADIUS },
      uTime: { value: seed * 10 },
      uSeed: { value: seed },
      uOpacity: { value: 0 },
      uDraw: { value: 0 },
      uIcon: { value: 0 },
      uFlash: { value: 0 },
      uIconPos: { value: new THREE.Vector2(ICON_X, 0) },
      uIconR: { value: ICON_R },
      uRim: { value: glow(accent, 1.35) },
      uAccent: { value: new THREE.Color(accent) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  uniforms.uAccent.value.set(accent)
  uniforms.uRim.value.copy(glow(accent, 1.35))
  // Front and back faces share one uniforms object; the back drops the icon (define BACK).
  const [glassMat, backMat] = useMemo(() => {
    const base = { uniforms, vertexShader: glassVertex, fragmentShader: glassFragment, transparent: true, depthWrite: false }
    return [new THREE.ShaderMaterial(base), new THREE.ShaderMaterial({ ...base, defines: { BACK: 1 } })]
  }, [uniforms])

  useFrame((state, dt) => {
    const p = prog.current
    const t = state.clock.elapsedTime + seed * 20
    uniforms.uTime.value += dt
    if (!root.current || !body.current) return
    root.current.visible = p > 0.001

    // Build-in: card lifts and scales up, rim draws on, icon pops, text wipes in, then a flash.
    const k = easeOutBack(seg(p, 0, 0.42))
    const s = Math.max(0.0001, 0.55 + 0.45 * k) * Math.min(1, seg(p, 0, 0.12) * 4)
    body.current.scale.setScalar(s)
    body.current.position.y = (1 - easeOut(seg(p, 0, 0.45))) * -0.35
    uniforms.uOpacity.value = easeOut(seg(p, 0, 0.3))
    uniforms.uDraw.value = -0.05 + 1.1 * easeOut(seg(p, 0.05, 0.5))
    uniforms.uIcon.value = easeOutBack(seg(p, 0.22, 0.5))
    const f = seg(p, 0.8, 1)
    uniforms.uFlash.value = f >= 1 ? 0 : f

    // Title types on (soft wipe); the subline fades up as one piece.
    const tReveal = seg(p, 0.32, 0.8)
    const sReveal = easeOut(seg(p, 0.7, 0.96))
    if (title.current) {
      title.current.fillOpacity = Math.min(1, tReveal * 1.5)
      title.current.clipRect = [-0.1, -1, -0.1 + tReveal * (TEXT_W + 0.2), 1]
    }
    if (sub.current) {
      sub.current.fillOpacity = sReveal
      sub.current.position.y = SUB_Y - (1 - sReveal) * 0.05
    }

    // Idle: a gentle float with a little tilt, de-phased per card.
    const idle = easeOut(seg(p, 0.6, 1))
    root.current.position.y = Math.sin(t * 0.9) * 0.035 * idle
    root.current.rotation.x = Math.sin(t * 0.63 + 1.3) * 0.05 * idle
    root.current.rotation.y = Math.sin(t * 0.47 + 0.4) * 0.07 * idle
    root.current.rotation.z = Math.sin(t * 0.38 + 2.1) * 0.012 * idle
  })

  return (
    <group ref={root} dispose={null}>
      <group ref={body}>
        <mesh geometry={slab} material={slabMat} />
        <mesh geometry={glass} material={glassMat} position-z={0.004} renderOrder={1} />
        <mesh geometry={glass} material={backMat} position-z={-DEPTH - BEVEL * 2 - 0.004} rotation-y={Math.PI} renderOrder={1} />
        <Text
          ref={title as never}
          font={fonts.sansMedium}
          fontSize={0.156}
          letterSpacing={-0.01}
          anchorX="left"
          anchorY="middle"
          position={[TEXT_X, 0.1, 0.012]}
          maxWidth={TEXT_W}
          color="#e4ebf8"
          renderOrder={2}
        >
          New model released
        </Text>
        <Text
          ref={sub as never}
          font={fonts.sans}
          fontSize={0.132}
          anchorX="left"
          anchorY="middle"
          position={[TEXT_X, SUB_Y - 0.01, 0.012]}
          maxWidth={TEXT_W}
          color="#c2d1ea"
          renderOrder={2}
        >
          {label}
        </Text>
      </group>
    </group>
  )
}
