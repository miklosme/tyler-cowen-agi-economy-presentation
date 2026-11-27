#!/usr/bin/env node
/**
 * Headless screenshots of the deck and of individual models, rendered on the real GPU.
 * Requires the dev server (bun run dev) on http://127.0.0.1:5199.
 *
 *   node scripts/shot.mjs model <Name> [--out dir] [--variant v]
 *       6 frames: hero angle, +90°, +180°, high angle (progress 1), plus progress 0.35 and 0.7.
 *       Writes <dir>/<Name>-*.png and a contact sheet <dir>/<Name>-sheet.png.
 *   node scripts/shot.mjs deck <all|N|N,M,...> [--out dir] [--times 600,1800,4500]
 *       Per slide: frames at the given ms after the slide settles, plus a mid-transition
 *       frame sequence arriving from the previous slide. Writes <dir>/slide-NN-*.png and
 *       <dir>/slide-NN-sheet.png.
 *   node scripts/shot.mjs url "<query-and-hash>" [--out file.png] [--wait ms]
 *
 * Page console errors are printed, prefixed with [page].
 */
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const mode = args[0]
// Deck captures use the frozen snapshot build (scripts/snapshot-build.sh, :5198) so dev-server
// HMR reloads from other agents' edits can't reset a slide mid-capture. Models use the dev server.
const BASE = process.env.DECK_URL ?? (mode === 'deck' ? 'http://127.0.0.1:5198/' : 'http://127.0.0.1:5199/')
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : d
}
const W = Number(opt('w', 1920))
const H = Number(opt('h', 1080))

async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--hide-scrollbars'],
  })
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[page:${m.type()}]`, m.text().slice(0, 400))
  })
  page.on('pageerror', (e) => console.log('[page:exception]', e.message))
  return { browser, page }
}

async function waitReady(page, timeout = 30000) {
  await page.waitForFunction(() => window.__ready === true, null, { timeout })
}

function sheet(files, out, cols = 3) {
  if (files.length === 1) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', files[0], '-vf', 'scale=960:-1', out])
    return
  }
  const tileW = 960
  const tileH = Math.round((tileW * H) / W)
  const inputs = files.flatMap((f) => ['-i', f])
  const scaled = files.map((_, i) => `[${i}:v]scale=${tileW}:${tileH}[s${i}]`).join(';')
  const layout = files
    .map((_, i) => `${(i % cols) * tileW}_${Math.floor(i / cols) * tileH}`)
    .join('|')
  const stack = files.map((_, i) => `[s${i}]`).join('')
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', ...inputs,
    '-filter_complex', `${scaled};${stack}xstack=inputs=${files.length}:layout=${layout}:fill=black[out]`,
    '-map', '[out]', out,
  ])
}

async function shotModel(name) {
  const out = resolve(opt('out', `shots/models/${name}`))
  mkdirSync(out, { recursive: true })
  const variant = opt('variant')
  const v = variant ? `&variant=${encodeURIComponent(variant)}` : ''
  const frames = [
    ['hero', `progress=1`],
    ['az90', `progress=1&azoff=90`],
    ['az180', `progress=1&azoff=180`],
    ['high', `progress=1&eloff=35`],
    ['build35', `progress=0.35`],
    ['build70', `progress=0.7`],
  ]
  const { browser, page } = await launch()
  const files = []
  for (const [tag, q] of frames) {
    await page.goto(`${BASE}?model=${encodeURIComponent(name)}&capture=1&${q}${v}`)
    await waitReady(page)
    const f = join(out, `${name}${variant ? '-' + variant : ''}-${tag}.png`)
    await page.screenshot({ path: f })
    files.push(f)
    console.log('wrote', f)
  }
  await browser.close()
  const s = join(out, `${name}${variant ? '-' + variant : ''}-sheet.png`)
  sheet(files, s)
  console.log('sheet', s)
}

async function shotDeck(which) {
  const out = resolve(opt('out', 'shots/deck'))
  mkdirSync(out, { recursive: true })
  const times = opt('times', '700,2000,5000').split(',').map(Number)
  const { browser, page } = await launch()
  await page.goto(`${BASE}?capture=1#/0`)
  await waitReady(page, 60000)
  const count = await page.evaluate(() => window.__deck.count)
  const list = which === 'all' ? [...Array(count).keys()] : which.split(',').map(Number)
  for (const n of list) {
    const pad = String(n).padStart(2, '0')
    const files = []
    // Transition: settle on the previous slide, then advance and sample the flight.
    if (n > 0) {
      await page.evaluate((i) => window.__deck.go(i, { instant: true }), n - 1)
      await page.waitForTimeout(1500)
      await page.evaluate((i) => window.__deck.go(i), n)
      let last = 0
      for (const t of [250, 650]) {
        await page.waitForTimeout(t - last)
        last = t
        const f = join(out, `slide-${pad}-in${t}.png`)
        await page.screenshot({ path: f })
        files.push(f)
      }
      await page.evaluate((i) => window.__deck.go(i, { instant: true }), n)
    } else {
      await page.evaluate(() => window.__deck.go(0, { instant: true }))
    }
    let last = 0
    for (const t of times) {
      await page.waitForTimeout(t - last)
      last = t
      const f = join(out, `slide-${pad}-t${t}.png`)
      await page.screenshot({ path: f })
      files.push(f)
    }
    const diag = await page.evaluate(() => window.__diag)
    console.log('diag', n, JSON.stringify(diag))
    const s = join(out, `slide-${pad}-sheet.png`)
    sheet(files, s, files.length > 3 ? 3 : files.length)
    console.log('slide', n, '->', s)
  }
  await browser.close()
}

async function shotUrl(q) {
  const f = resolve(opt('out', 'shots/url.png'))
  const { browser, page } = await launch()
  await page.goto(`${BASE}${q}`)
  await waitReady(page, 60000).catch(() => console.log('warning: __ready never set'))
  await page.waitForTimeout(Number(opt('wait', 1200)))
  await page.screenshot({ path: f })
  console.log('wrote', f)
  await browser.close()
}

if (mode === 'model') await shotModel(args[1])
else if (mode === 'deck') await shotDeck(args[1] ?? 'all')
else if (mode === 'url') await shotUrl(args[1] ?? '')
else {
  console.log('usage: shot.mjs model <Name> | deck <all|N,...> | url "<query>"')
  process.exit(1)
}
