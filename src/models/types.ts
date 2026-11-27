/**
 * Contract for every 3D model in src/models/<Name>.tsx.
 *
 * - default export: the component, taking ModelProps.
 * - named export `meta`: ModelMeta, used by the preview harness for framing.
 * - The model is centred on the origin and fits roughly inside a 2.4-unit cube at scale 1.
 * - `progress` drives the build-in animation: 0 = not yet visible, 1 = fully assembled.
 *   The model must look finished and alive (idle motion via useFrame) at progress 1.
 * - Procedural geometry only. No external files, no textures from the network.
 */
export type ModelProps = {
  /** 0..1 build-in progress. The slide animates it; the harness can pin it. */
  progress?: number
  /** Optional accent override (hex). Each model picks a sensible default from the palette. */
  accent?: string
  /** Optional variant switch for models that have states (e.g. "intact" | "collapsed"). */
  variant?: string
}

export type ModelMeta = {
  /** Human title shown in the harness. */
  title: string
  /** Camera distance that frames the model well at fov 35. */
  distance?: number
  /** Camera elevation in degrees for the hero angle. */
  elevation?: number
  /** Camera azimuth in degrees for the hero angle. */
  azimuth?: number
  /** Variants the harness should render in its contact sheet. */
  variants?: string[]
}
