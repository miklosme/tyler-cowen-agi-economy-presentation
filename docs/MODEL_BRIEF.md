# 3D model brief

Shared guidance for every model in `src/models/`. The deck is a cinematic, React Three Fiber
presentation of a talk on the AGI economy. Models are props that appear on specific slides.
The models are procedural (code-only): there are no external model files.

## Stack

- three 0.187, @react-three/fiber 9.8, @react-three/drei 10.7, @react-three/postprocessing 3.2, React 19, TypeScript.
- Package manager: bun. Dev server: `bun run dev` → http://127.0.0.1:5199 (probably already
  running; check with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5199/` before starting one).
- Design tokens: `src/theme.ts` (`palette`, `glow(hex, boost)`). The shared render look is in
  `src/stage/Look.tsx`: sky, star dust, lightformer environment (cool ice key light from the left,
  warm ember ring from the right), bloom (mipmap, threshold 0.62), chromatic aberration, vignette,
  grain and ACES tone mapping. Read both files before you start.

## Contract (see `src/models/types.ts`)

- One file per model: `src/models/<Name>.tsx`. Default export is the component, taking
  `ModelProps` (`progress`, `accent`, `variant`). There is also a named export `meta: ModelMeta`
  for harness framing.
- Center the model on the origin. At scale 1 it should fit in about a 2.4-unit cube.
- `progress` (0..1) drives the build-in. 0 means invisible and 1 means fully assembled. The slide
  may change `progress` every frame for about 2 s, so never rebuild geometry or materials when it
  changes. Create them in `useMemo`, and let progress move only transforms, uniforms, drawRange and opacity.
- At progress 1 the model must look finished and alive, with subtle idle motion in `useFrame`.
- Only create or edit your own files: `src/models/<Name>.tsx`, plus an optional
  `src/models/<name>-parts/` folder. Do not touch shared files (`theme.ts`, `Look.tsx`,
  `types.ts`, `ModelPreview.tsx`, `scripts/`). Other agents are working in this checkout at the same time.
- Do not commit. Do not run `git checkout`, `git stash` or anything else that touches other people's files.
- Type-check with `bunx tsc --noEmit -p . 2>&1 | grep "src/models/<Name>"`. You only own errors in your own files.

## Visual language: "luminous instrument"

The whole deck uses one material language. Every model must belong to it.

- **Bodies**: dark satin metal or ceramic (`#0d1020`–`#1a2036`, metalness 0.5–0.9, roughness
  0.25–0.45). They read as elegant silhouettes catching cool and warm reflections from the environment.
  No bright diffuse albedo.
- **Linework**: thin glowing lines on the *key silhouette and feature edges only*. Use
  EdgesGeometry with a 20–35° threshold, or hand-placed lines. Colors are ember gold (human / growth) or
  ice cyan (machine / AI), with `glow(hex, 3..5)` and `toneMapped={false}`. Avoid full noisy wireframes.
- **Focal light**: one to three emissive focal points (`glow` 4–8) that bloom, such as liquid,
  a screen, a laser or a filament. This is where the eye goes.
- **Life**: small particle systems (additive Points, soft round sprites) for sparks, bubbles,
  steam and data motes are encouraged where they add meaning.
- **Glass**: never use `transmission` or MeshTransmissionMaterial, because it is too costly next to the
  post stack. Fake glass with a fresnel-rim ShaderMaterial (transparent, additive or normal blend,
  depthWrite false) plus faint linework.
- **Stylized, iconic, instantly readable.** On a slide the model may fill only 15–30% of the
  screen height. Exaggerate iconic features and drop realistic clutter. Someone should name the object in
  under a second.
- **Build-in**: an elegant, staggered assembly. Parts rise into place and lines draw on
  (drawRange or dash offset). Use eased motion (cubic / expo out). No popping.
- **Budget**: under 60k triangles, a reasonable number of draw calls (instance repeated parts),
  no shadows, no postprocessing inside the model, and no text unless the brief asks for it.

## Harness and screenshots

- Live view: `http://127.0.0.1:5199/?model=<Name>`. URL params: `progress`, `variant`, `az`, `el`,
  `dist`, `azoff`, `eloff`, `animate=1`.
- Contact sheet: `node scripts/shot.mjs model <Name> [--variant v] [--out dir]`. It renders six
  1920×1080 frames on the real GPU: hero angle, +90°, +180°, a high angle, build at 0.35 and at 0.7. It then
  writes `shots/models/<Name>/<Name>-sheet.png` and prints page console errors as `[page:...]`
  (the THREE.Clock deprecation warning is harmless). Look at your own screenshots after every change.

## Council and hill-climbing (required)

When you have a strong first version, run a council review of the **visuals** and hill-climb until
every member scores the model **8/10 or higher**:

1. Call `orchestrator_capabilities` once, then `delegate_task` three reviewers in parallel
   (`role: "review"`, `mode: "async"`): **Claude Opus 5.5** (provider `claudeAgent`, model
   `claude-opus-5-5`, option `effort: high`), **GPT-6.2 Sol** (provider `codex`, model
   `gpt-6.2-sol`, option `reasoningEffort: high`) and **Gemini 4 Neon** (provider `antigravity`,
   model `gemini-4-neon`, option `thought_level: high`).
2. Give each reviewer: this brief's path, your model's purpose (copy it from your task), the
   absolute paths of your latest contact sheet and hero PNG, and your source file path. Tell them
   to stay read-only, open the PNGs (they are images) and score the visual 1–10. They should judge
   readability at small size, fit with the luminous-instrument language, craft and polish, how
   well the model serves its slide's message, and the build-in frames. They must list the top concrete
   changes that would raise the score.
3. While they review, do not edit the files they are looking at. When a result arrives, check
   each point against the screenshots yourself, apply the fixes you agree with, re-shoot, and start
   a fresh round with new `delegate_task` calls. Do not use `t3_thread_send`.
4. Stop when every member gives ≥ 8 in the same round. Fight scope creep: fix what the
   reviewers flag, don't gold-plate. Hard cap: 5 rounds. If you hit it, report the honest scores.

## What to hand back

Reply with:

- the file path(s) and a one-paragraph description of the model, its variants, idle motion and build-in;
- the recommended hero framing (`meta`), and how big it should be on screen;
- a council table:

| Delegate | Round 1 | Round 2 | … |
| --- | --- | --- | --- |
| Claude Opus 5.5 | x/10 | … |
| GPT-6.2 Sol | x/10 | … |
| Gemini 4 Neon | x/10 | … |

- the final contact sheet path.
