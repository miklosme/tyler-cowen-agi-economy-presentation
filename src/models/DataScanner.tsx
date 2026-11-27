/**
 * DataScanner: "Gather data." A dark satin basketball with ember seams hovers over the family
 * pedestal. A horizontal ice scanning ring sweeps up and down it; where the ring passes, the
 * surface briefly turns into an ice dot lattice whose nodes peel away and stream upward as
 * square data motes. The world turning into data.
 *
 * Build-in: pedestal and emitter hub, the ball rises, all four seams draw on together, the scan
 * ring ignites from the hub and starts sweeping, motes begin to stream. Idle: the ball rocks
 * gently around its classic face, the ring sweeps every 5.2 s, motes rise into a plume.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow } from '../theme'
import type { ModelMeta, ModelProps } from './types'
import {
  DECK_Y,
  EMBER,
  FAMILY_FRAME,
  GlowLines,
  ICE,
  Pedestal,
  T,
  circlePoints,
  interleave,
  makeBody,
  outCubic,
  outExpo,
  polyToSegments,
  seg,
  useSprites,
  type GlowLinesHandle,
} from './job-engine-parts/shared'

export const meta: ModelMeta = { title: 'Data scanner (gather data)', azimuth: 24, ...FAMILY_FRAME }

const R = 0.64
const CY = -0.08 // ball centre height
const AMP = R * 0.92 // scan sweep amplitude around CY
const PERIOD = 5.2
const N_MOTES = 420
const FACE_YAW = THREE.MathUtils.degToRad(24) // emoji face: meridian centred, '( )' side seams either side

/** Basketball seams as polylines on a unit sphere (axis X is the "side" axis). */
function seamCurves(): THREE.Vector3[][] {
  const curves: THREE.Vector3[][] = []
  const n = 160
  const h: THREE.Vector3[] = []
  const v: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    h.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
    v.push(new THREE.Vector3(0, Math.cos(a), Math.sin(a)))
  }
  curves.push(h, v)
  // Two side seams: loops around ±X, closer to X at the equator, bowing toward the poles.
  for (const sx of [1, -1]) {
    const c: THREE.Vector3[] = []
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * Math.PI * 2
      const th = THREE.MathUtils.degToRad(56 + 13 * Math.cos(2 * phi))
      const s = Math.sin(th)
      c.push(new THREE.Vector3(Math.cos(th) * sx, s * Math.sin(phi), s * Math.cos(phi)))
    }
    curves.push(c)
  }
  return curves
}

export default function DataScanner({ progress = 1, accent }: ModelProps) {
  const dataColor = accent ?? ICE

  // Ball body: warm satin with an injected scan band + dot lattice in a short trail.
  const ballGeo = useMemo(() => new THREE.SphereGeometry(R, 96, 64), [])
  const uniforms = useMemo(
    () => ({
      uScanY: { value: CY },
      uScanDir: { value: 1 },
      uScanOn: { value: 0 },
      uIce: { value: glow(dataColor, 1) },
      uEmber: { value: new THREE.Color(EMBER) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const ballMat = useMemo(() => {
    const m = makeBody('#2a1b12', 0.4, 0.52)
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vOP;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvOP = transformed;',
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWP; varying vec3 vOP;
          uniform float uScanY; uniform float uScanDir; uniform float uScanOn; uniform vec3 uIce; uniform vec3 uEmber;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float dd = (uScanY - vWP.y) * uScanDir; // >0 : already scanned
            float band = exp(-pow(dd / 0.0065, 2.0));
            float behind = step(0.0, dd);
            float dotTrail = behind * exp(-dd / 0.1);
            float lineTrail = behind * exp(-dd / 0.05);
            vec3 p = normalize(vOP);
            float th = acos(clamp(p.y, -1.0, 1.0));
            float ph = atan(p.z, p.x);
            vec2 g = vec2(ph / 6.2831853 * 40.0, th / 3.1415926 * 20.0);
            vec2 fg = fract(g);
            vec2 q = min(fg, 1.0 - fg);
            float st = max(sin(th), 0.05);
            float dotm = 1.0 - smoothstep(0.1, 0.16, max(q.x * st, q.y));
            vec2 w = fwidth(g);
            float gl = 1.0 - min(smoothstep(0.0, w.x * 1.2, q.x), smoothstep(0.0, w.y * 1.2, q.y));
            float fresh = exp(-max(dd, 0.0) / 0.07);
            totalEmissiveRadiance += uIce * uScanOn * (band * 3.6 + dotTrail * dotm * (0.9 + 2.6 * fresh) + lineTrail * gl * 1.1);
            float rimF = 1.0 - abs(dot(normal, normalize(vViewPosition)));
            totalEmissiveRadiance += uEmber * pow(rimF, 3.0) * 0.16 * (1.0 - dotTrail);
          }`,
        )
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seams = useMemo(() => {
    const segs = seamCurves().map((c) => polyToSegments(c.map((p) => p.clone().multiplyScalar(R * 1.006))))
    return { main: interleave(segs.slice(0, 2)), sides: interleave(segs.slice(2)) }
  }, [])

  // Scan ring: unit circle, scaled to hug the ball at the scan height.
  const ringSegs = useMemo(() => polyToSegments(circlePoints(1, 0, 128)), [])
  const ringH = useRef<GlowLinesHandle | null>(null)
  const haloH = useRef<GlowLinesHandle | null>(null)
  const ring = useRef<THREE.Group>(null)
  const ringScale = useRef<THREE.Group>(null)
  const sheetMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: glow(dataColor, 2.0) }, uOn: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `uniform vec3 uColor; uniform float uOn; varying vec2 vUv;
          void main(){ float r = length(vUv-0.5)*2.0; float a = smoothstep(0.6,1.0,r)*(1.0 - smoothstep(0.97,1.0,r));
          gl_FragColor = vec4(uColor, a*0.12*uOn); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const sheetGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(1, 96)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const beadGeo = useMemo(() => new THREE.SphereGeometry(0.02, 12, 8), [])
  const beadMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: glow('#e8fbff', 5), transparent: true })
    m.toneMapped = false
    return m
  }, [])
  const beads = useRef<THREE.Group>(null)

  // Emitter hub on the deck.
  const hubGeo = useMemo(() => {
    const prof = [
      [0.0, DECK_Y],
      [0.3, DECK_Y],
      [0.3, DECK_Y + 0.03],
      [0.26, DECK_Y + 0.06],
      [0.12, DECK_Y + 0.07],
      [0.0, DECK_Y + 0.07],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(prof, 64)
  }, [])
  const hubMat = useMemo(() => makeBody('#151a2c', 0.75, 0.32), [])
  const hubRings = useMemo(
    () =>
      interleave([
        polyToSegments(circlePoints(0.262, DECK_Y + 0.062, 64, Math.PI * 0.5, Math.PI * 2.5)),
        polyToSegments(circlePoints(0.36, DECK_Y + 0.003, 80, Math.PI * 0.5, Math.PI * 2.5)),
      ]),
    [],
  )
  const hubCoreGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.08, 32)
    g.rotateX(-Math.PI / 2)
    g.translate(0, DECK_Y + 0.072, 0)
    return g
  }, [])
  const hubCoreMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: glow(dataColor, 0.9), transparent: true })
    m.toneMapped = false
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Faint ice beam from the hub up to the ball's south pole.
  const BEAM_Y0 = DECK_Y + 0.07
  const BEAM_Y1 = CY - R + 0.02
  const beamGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.06, 0.1, BEAM_Y1 - BEAM_Y0, 32, 1, true)
    g.translate(0, (BEAM_Y0 + BEAM_Y1) / 2, 0)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: glow(dataColor, 0.9) }, uOn: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal);
          vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ float facing = abs(dot(normalize(vN), normalize(vV)));
            float core = pow(facing, 2.0);
            float flow = 0.75 + 0.25 * sin(vUv.y * 18.0 - uTime * 4.0);
            float fade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
            gl_FragColor = vec4(uColor, core * flow * fade * 0.35 * uOn); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Data motes
  const motes = useSprites(N_MOTES, glow(dataColor, 3.4), glow('#e6fbff', 3.0), true, false)
  const mote = useMemo(
    () =>
      Array.from({ length: N_MOTES }, () => ({
        age: 99,
        life: 1,
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        size: 0,
        hue: 0,
      })),
    [],
  )
  const spawnAcc = useRef(0)
  const next = useRef(0)

  const t = useRef(0)
  const spin = useRef<THREE.Group>(null)
  const warm = useRef(false)

  // Build timeline
  // line-first: seams draw on a ghosted ball, the satin body fills in after
  const pBody = outCubic(seg(progress, 0.28, 0.62))
  const pRise = outExpo(seg(progress, 0.08, 0.45))
  const pSeams = seg(progress, 0.12, 0.42)
  const pSides = seg(progress, 0.26, 0.55)
  const pHub = outExpo(seg(progress, 0.3, 0.6))
  const pScan = outCubic(seg(progress, 0.42, 0.8))
  const pLife = seg(progress, 0.62, 1.0)
  ballMat.opacity = pBody
  hubMat.opacity = pHub
  hubCoreMat.opacity = pScan * 0.45

  const step = (dt: number) => {
    t.current += dt
    const time = t.current
    if (spin.current) spin.current.rotation.y = FACE_YAW + Math.sin(time * 0.33 - 0.9) * 0.1

    // Scan position: eased sine sweep. During the build the ring rises out of the hub.
    const ph = (time / PERIOD) * Math.PI * 2 - 1.2
    const sweep = CY + AMP * -Math.cos(ph)
    const hubY = DECK_Y + 0.08
    const scanY = hubY + (sweep - hubY) * pScan
    const dir = pScan < 0.999 ? 1 : Math.sin(ph) >= 0 ? 1 : -1
    uniforms.uScanY.value = scanY
    uniforms.uScanDir.value = dir
    uniforms.uScanOn.value = pScan

    const h = scanY - CY
    const rr = Math.sqrt(Math.max(R * R - h * h, 0)) + 0.09
    const rs = Math.max(rr, 0.2)
    if (ring.current) {
      ring.current.position.y = scanY
      ring.current.visible = pScan > 0.001
    }
    if (ringScale.current) ringScale.current.scale.set(rs, 1, rs)
    if (beads.current) {
      beads.current.children.forEach((b, i) => {
        const a = -time * 0.9 + (i * Math.PI) / 2
        b.position.set(Math.cos(a) * rs, 0, Math.sin(a) * rs)
      })
    }
    sheetMat.uniforms.uOn.value = pScan
    beamMat.uniforms.uOn.value = pScan
    beamMat.uniforms.uTime.value = time
    beadMat.opacity = pScan
    if (ringH.current) ringH.current.mat.opacity = pScan
    if (haloH.current) haloH.current.mat.opacity = pScan * 0.18

    // Spawn motes from lattice nodes just behind the band, in short bursts.
    const coverage = Math.max(0, 1 - Math.abs(h) / R)
    const burst = 0.55 + 0.45 * Math.sin(time * 9.0)
    spawnAcc.current += dt * 240 * Math.sqrt(coverage) * burst * pLife
    while (spawnAcc.current >= 1) {
      spawnAcc.current -= 1
      const m = mote[next.current]
      next.current = (next.current + 1) % N_MOTES
      const y = h - dir * (0.02 + Math.random() * 0.08)
      const rad = Math.sqrt(Math.max(R * R - y * y, 0))
      // bias spawn toward the hero silhouette and the back so squares don't cover the front face
      const front = Math.atan2(Math.cos(FACE_YAW), Math.sin(FACE_YAW))
      // mostly from the back half, so the stream emerges over the crown instead of clumping at the ring ends
      const a = Math.random() < 0.75 ? front + Math.PI + (Math.random() - 0.5) * 1.9 : front + Math.PI / 4 + Math.random() * (Math.PI * 1.5)
      const nx = Math.cos(a)
      const nz = Math.sin(a)
      m.p.set(nx * (rad + 0.08), CY + y, nz * (rad + 0.08))
      const out = 0.03 + Math.random() * 0.06
      m.v.set(nx * out, 0.3 + Math.random() * 0.2, nz * out)
      m.age = 0
      m.life = 2.0 + Math.random() * 1.0
      m.size = 0.024 + Math.random() * 0.028
      m.hue = Math.random() < 0.22 ? 1 : 0
    }
    for (let i = 0; i < N_MOTES; i++) {
      const m = mote[i]
      m.age += dt
      const k = m.age / m.life
      if (k < 1) {
        // peel outward, then rise and gather into a plume above the ball
        // rise around the silhouette; only gather into the plume above the shoulder
        m.v.y += dt * 0.6
        const above = m.p.y > CY + R * 0.35
        const pull = above ? 2.2 : 0
        m.v.x += -m.p.x * dt * pull
        m.v.z += -m.p.z * dt * pull
        m.v.x *= 1 - dt * 0.9
        m.v.z *= 1 - dt * 0.9
        m.p.addScaledVector(m.v, dt)
        const dy = m.p.y - CY
        if (Math.abs(dy) < R) {
          const minR = Math.sqrt(R * R - dy * dy) + 0.08
          const r = Math.hypot(m.p.x, m.p.z)
          if (r < minR && r > 1e-4) {
            m.p.x *= minR / r
            m.p.z *= minR / r
          }
        }
      }
      motes.pos[i * 3] = m.p.x
      motes.pos[i * 3 + 1] = m.p.y
      motes.pos[i * 3 + 2] = m.p.z
      const fadeTop = THREE.MathUtils.clamp((1.1 - m.p.y) / 0.3, 0, 1)
      motes.alpha[i] = k < 1 ? Math.min(1, m.age * 0.9) * (1 - k * k) * fadeTop * 0.9 : 0
      motes.size[i] = m.size * (0.6 + 0.4 * Math.min(1, m.age * 1.5)) * (1 - 0.35 * k)
      motes.hue[i] = m.hue
    }
    motes.flush()
  }

  useFrame((_, dtRaw) => {
    if (!warm.current) {
      // Pre-roll so the emblem is already mid-sweep with a plume in the air.
      warm.current = true
      for (let i = 0; i < 120; i++) step(1 / 60)
    }
    step(Math.min(dtRaw, 0.05))
  })

  return (
    <group visible={progress > 0.001}>
      <Pedestal progress={progress} />

      <group position-y={(1 - pHub) * -0.2}>
        <mesh geometry={hubGeo} material={hubMat} renderOrder={0} />
        <mesh geometry={hubCoreGeo} material={hubCoreMat} renderOrder={1} />
        <mesh geometry={beamGeo} material={beamMat} renderOrder={3} />
        <GlowLines segments={hubRings} color={dataColor} boost={1.7} width={1.2} opacity={0.8} draw={seg(progress, 0.34, 0.62)} />
      </group>

      <group position-y={(1 - pRise) * -0.45} scale={0.9 + 0.1 * pRise}>
        <group position-y={CY} rotation-z={0.09}>
          <group ref={spin}>
            <mesh geometry={ballGeo} material={ballMat} renderOrder={0} />
            <GlowLines segments={seams.main} color={EMBER} boost={2.7} width={1.8} draw={pSeams} />
            <GlowLines segments={seams.sides} color={EMBER} boost={2.7} width={1.8} draw={pSides} />
          </group>
        </group>
      </group>

      <group ref={ring} visible={false}>
        <group ref={ringScale}>
          <mesh geometry={sheetGeo} material={sheetMat} renderOrder={3} />
          <GlowLines segments={ringSegs} color={dataColor} boost={6} width={2.4} handle={ringH} renderOrder={3} />
          <GlowLines segments={ringSegs} color={dataColor} boost={1.6} width={7} handle={haloH} renderOrder={3} />
        </group>
        <group ref={beads}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} geometry={beadGeo} material={beadMat} renderOrder={3} />
          ))}
        </group>
      </group>

      <primitive object={motes.points} />
    </group>
  )
}
