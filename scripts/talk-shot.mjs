#!/usr/bin/env node
/**
 * Headless screenshots of the /watch player at given talk times, rendered on the real GPU.
 * Requires a server with the app (bun run dev on :5199, or set TALK_URL).
 *
 *   node scripts/talk-shot.mjs <times...> [--out dir] [--wait ms] [--w 1920 --h 1080]
 *       times are "m:ss.s" talk times, e.g. 0:03 2:16.5 8:09
 *   node scripts/talk-shot.mjs cues [--offset s]
 *       one frame per cue, `offset` seconds (default 6) after the cue starts.
 *
 * Writes <dir>/talk-<m-ss.s>.png and <dir>/talk-sheet.png. Page errors print as [page].
 */
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : d
}
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const BASE = process.env.TALK_URL ?? 'http://127.0.0.1:5199/watch/'
const W = Number(opt('w', 1920))
const H = Number(opt('h', 1080))
const OUT = resolve(opt('out', 'shots/talk'))
const WAIT = Number(opt('wait', 2200))
mkdirSync(OUT, { recursive: true })

const sec = (t) => String(t).split(':').reduce((a, p) => a * 60 + Number(p), 0)
const stamp = (s) => `${Math.floor(s / 60)}-${(s % 60).toFixed(1).padStart(4, '0')}`

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[page:${m.type()}]`, m.text().slice(0, 400))
})
page.on('pageerror', (e) => console.log('[page:exception]', e.message))
await page.goto(`${BASE}?capture`)
await page.waitForFunction(() => window.__ready === true && !!window.__talk, null, { timeout: 60000 })

let times
if (positional[0] === 'cues') {
  const offset = Number(opt('offset', 6))
  times = (await page.evaluate(() => window.__talk.cues.map((c) => c.start))).map((s) => s + offset)
} else times = positional.map(sec)

const files = []
for (const t of times) {
  // Arrive a little early so scenes have mounted and compiled, then land on the exact time.
  await page.evaluate((x) => window.__talk.seek(Math.max(0, x - 0.6)), t)
  await page.waitForTimeout(700)
  await page.evaluate((x) => window.__talk.seek(x), t)
  await page.waitForTimeout(WAIT)
  const f = join(OUT, `talk-${stamp(t)}.png`)
  await page.screenshot({ path: f })
  files.push(f)
  console.log(f)
}
await browser.close()

if (files.length > 1) {
  const cols = files.length >= 9 ? 4 : files.length >= 4 ? 3 : 2
  const tileW = 640
  const tileH = Math.round((tileW * H) / W)
  const inputs = files.flatMap((f) => ['-i', f])
  const scaled = files.map((_, i) => `[${i}:v]scale=${tileW}:${tileH}[s${i}]`).join(';')
  const layout = files.map((_, i) => `${(i % cols) * tileW}_${Math.floor(i / cols) * tileH}`).join('|')
  const filter = `${scaled};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black[out]`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', join(OUT, 'talk-sheet.png')])
  console.log(join(OUT, 'talk-sheet.png'))
}
