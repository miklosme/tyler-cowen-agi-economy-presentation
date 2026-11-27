/**
 * Loads a model from src/models by name. Renders nothing until the module exists and loads,
 * so slides work while models are still being built.
 */
import { useEffect, useState, type ComponentType } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import type { ModelProps } from '../models/types'

type Mod = { default?: ComponentType<ModelProps & Record<string, unknown>> } & Record<string, unknown>
const modules = import.meta.glob<Mod>('../models/*.tsx')

export function useModelModule(name: string): Mod | null {
  const [mod, setMod] = useState<Mod | null>(null)
  useEffect(() => {
    const loader = modules[`../models/${name}.tsx`]
    if (!loader) return
    let live = true
    loader()
      .then((m) => live && setMod(m))
      .catch((e) => console.warn(`model ${name} failed to load`, e))
    return () => {
      live = false
    }
  }, [name])
  return mod
}

type SlotProps = ThreeElements['group'] & {
  name: string
  progress?: number
  variant?: string
  accent?: string
  extra?: Record<string, unknown>
}

export function ModelSlot({ name, progress = 1, variant, accent, extra, ...group }: SlotProps) {
  const mod = useModelModule(name)
  const C = mod?.default
  if (!C) return null
  return (
    <group {...group}>
      <C progress={progress} variant={variant} accent={accent} {...extra} />
    </group>
  )
}
