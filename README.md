# The AGI Economy

A cinematic, 20-scene 3D presentation of Tyler Cowen's talk
[“The AGI economy: how AI could stabilize public debt”](https://www.youtube.com/watch?v=aJlg6o0A_Js)
(Sana AI Summit, New York, May 21, 2026). Built with three.js, React Three Fiber and drei.

## Run

```sh
bun install
bun run dev          # http://127.0.0.1:5199
```

Controls:

- → / Space / click: next slide
- ← / click on the left third: previous slide
- **F**: fullscreen
- **N**: speaker notes
- Deep link to a slide with `#/N`, e.g. `#/10`.

## How it's built

- **One persistent particle swarm** (80k points, `src/three/Swarm.tsx`). It flies between slide "stations" with the camera and re-forms into each slide's shape (`src/three/formations.ts`).
- **Slides** live in `src/slides/act1–4.tsx`: the HTML typography overlay plus a 3D set piece per slide. `src/deck/` holds the engine (navigation, camera flights, HUD).
- **3D models** in `src/models/` are procedural (code-only) and were each built by a dedicated agent against `docs/MODEL_BRIEF.md`. You can preview one at `/?model=<Name>`.
- **Shared look** lives in `src/stage/Look.tsx`: sky, star dust, lightformer environment, bloom, aberration, grain and tone mapping.

## Source material

- `bun run fetch-source` downloads the talk with yt-dlp (git-ignored) and rebuilds `source/transcript.md` from the English captions.

## Screenshots

- `scripts/snapshot-build.sh` builds a frozen snapshot on :5198.
- `node scripts/shot.mjs deck all` renders every slide on the GPU (headless Chrome).
- `node scripts/shot.mjs model <Name>` renders a model's contact sheet.
- The review history is in `docs/COUNCIL.md`.
