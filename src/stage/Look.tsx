/**
 * The shared "look" of the deck: sky, star dust, image-based lighting and the post stack.
 * Both the deck and the model preview harness render inside <Look>, so a model that looks
 * right in the harness looks right on its slide.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, ShaderPass, ToneMappingMode } from 'postprocessing'
import { palette } from '../theme'
import { fx } from './fx'

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uInk;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

  void main() {
    vec3 d = normalize(vDir);
    float horizon = 1.0 - abs(d.y);
    float band = pow(horizon, 6.0);
    float neb = fbm(d * 2.2 + vec3(0.0, 0.0, uTime * 0.01));
    float neb2 = fbm(d * 5.0 - vec3(uTime * 0.008));
    vec3 col = uInk;
    col += uTint * (0.35 * band + 0.55 * pow(neb, 2.6) * (0.4 + 0.6 * band));
    col += uTint * 0.12 * pow(neb2, 4.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function Sky() {
  const uniforms = useMemo(
    () => ({
      uTint: { value: fx.tintNow },
      uInk: { value: new THREE.Color(palette.ink) },
      uTime: { value: 0 },
    }),
    [],
  )
  useFrame((_, dt) => {
    fx.tintNow.lerp(fx.tint, 1 - Math.exp(-dt * 1.5))
    uniforms.uTime.value += dt
  })
  const material = useMemo(
    () => new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms, vertexShader: skyVertex, fragmentShader: skyFragment }),
    [uniforms],
  )
  return (
    <mesh scale={600} renderOrder={-10} frustumCulled={false} material={material}>
      <sphereGeometry args={[1, 48, 32]} />
    </mesh>
  )
}

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 40.0);
    // Fade and cap stars that drift close to the camera so they never balloon into bokeh blobs.
    vAlpha = tw * smoothstep(8.0, 40.0, -mv.z);
    gl_PointSize = min((1.2 + aSeed * 2.2) * uPixelRatio * (220.0 / -mv.z), 4.0 * uPixelRatio);
  }
`
const dustFragment = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vAlpha * 0.8);
  }
`

/** Far-field star dust. Gives the camera something to parallax against during flights. */
export function Dust({ count = 7000, radius = 260 }: { count?: number; radius?: number }) {
  const { geometry, uniforms } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const r = radius * (0.35 + 0.65 * Math.cbrt(Math.random()))
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = r * s * Math.cos(t)
      pos[i * 3 + 1] = r * u * 0.7
      pos[i * 3 + 2] = r * s * Math.sin(t)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return {
      geometry: g,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColor: { value: new THREE.Color('#b9c4ff').multiplyScalar(0.9) },
      },
    }
  }, [count, radius])
  useFrame((_, dt) => {
    uniforms.uTime.value += dt
  })
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: dustVertex,
        fragmentShader: dustFragment,
      }),
    [uniforms],
  )
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** Offline image-based lighting built from lightformers: cool key, warm rim, soft top. */
export function Lights() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} color="#dfe6ff" />
      <directionalLight position={[-6, 2, -4]} intensity={0.6} color={palette.ember} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color={palette.ice} position={[-6, 3, -4]} scale={[8, 2.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={2.5} color={palette.ember} position={[6, 2, 4]} scale={3.5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={0.4} color={palette.violet} position={[0, -6, 2]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
    </>
  )
}

/**
 * First pass of the post stack: replaces NaN/Inf pixels with black and clamps extreme HDR.
 * A single NaN pixel from any shader (an unguarded pow/normalize in a model) would otherwise be
 * smeared across the whole frame by bloom's mip blur and black out the screen.
 */
function makeSanitizePass() {
  const material = new THREE.ShaderMaterial({
    uniforms: { inputBuffer: { value: null } },
    vertexShader: `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D inputBuffer;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(inputBuffer, vUv);
        bool bad = any(isnan(c)) || any(isinf(c)) || !(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b);
        gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, vec4(0.0), vec4(48.0));
      }
    `,
    depthTest: false,
    depthWrite: false,
  })
  return new ShaderPass(material, 'inputBuffer')
}

/** Post stack. Transition energy (fx.warp) pushes chromatic aberration and bloom. */
export function Post({ enabled = true }: { enabled?: boolean }) {
  const offset = useMemo(() => new THREE.Vector2(0.0004, 0.0004), [])
  const bloom = useRef<{ intensity: number } | null>(null)
  useFrame((_, dt) => {
    fx.warp = Math.max(0, fx.warp - dt * 0.9)
    const w = fx.warp * fx.warp
    offset.set(0.0004 + w * 0.012, 0.0003 + w * 0.006)
    if (bloom.current) bloom.current.intensity = 1.05 + fx.bloomBoost + w * 1.4
  })
  const sanitize = useMemo(() => makeSanitizePass(), [])
  if (!enabled) return null
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <primitive object={sanitize} />
      <Bloom
        ref={bloom as never}
        mipmapBlur
        intensity={1.05}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.25}
        radius={0.78}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
        radialModulation
        modulationOffset={0.35}
      />
      <Vignette eskil={false} offset={0.22} darkness={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* Grain runs after tone mapping, on display-range values; before it, HDR glow turned into colored speckle. */}
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />
    </EffectComposer>
  )
}

/** Everything a scene needs to look like the deck. */
export function Look({ post = true }: { post?: boolean }) {
  return (
    <>
      <color attach="background" args={[palette.ink]} />
      <Sky />
      <Dust />
      <Lights />
      <Post enabled={post} />
    </>
  )
}
