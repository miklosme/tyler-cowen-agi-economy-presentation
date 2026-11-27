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

## Watch the talk (/watch)

`/watch/` plays Tyler Cowen's original audio and runs the deck's scenes as a film in sync with it:
http://127.0.0.1:5199/watch/. On-screen text is kept to what the ear can't hold (the speaker, the
numbers he says, the three job engines); the audio carries the argument.

- The audio is git-ignored, like the video. `bun run audio` extracts it from `source/talk.webm`
  into `public/audio/` (`bun run fetch-source` does both). Without it the film plays silently.
- Controls: Space/K play-pause, ← → ±5 s, J/L ±10 s, Shift+← → or [ ] previous/next chapter,
  0–9 jump, C captions, M mute, F fullscreen. Deep link to a moment with `#t=8:05`.
- `src/talk/program.tsx` is the edit: one cue per scene with its start time, camera shots, and
  time warps that move each scene's own beats (a needle, a label, an arc) onto the words.
- `node scripts/talk-shot.mjs cues` or `node scripts/talk-shot.mjs 8:09 10:30` renders frames.

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
