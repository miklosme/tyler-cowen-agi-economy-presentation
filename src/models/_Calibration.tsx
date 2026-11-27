/** Calibration model: proves the harness renders the deck look. Not used in slides. */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { glow, palette } from '../theme'
import type { ModelMeta, ModelProps } from './types'

export const meta: ModelMeta = { title: 'Calibration orb', distance: 6 }

export default function Calibration({ progress = 1 }: ModelProps) {
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.4
  })
  return (
    <group ref={g} scale={0.2 + 0.8 * progress}>
      <mesh>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial color={palette.ink3} metalness={0.9} roughness={0.25} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.IcosahedronGeometry(0.92, 1)]} />
        <lineBasicMaterial color={glow(palette.ember, 4)} toneMapped={false} />
      </lineSegments>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.35, 0.012, 8, 128]} />
        <meshBasicMaterial color={glow(palette.ice, 5)} toneMapped={false} />
      </mesh>
    </group>
  )
}
