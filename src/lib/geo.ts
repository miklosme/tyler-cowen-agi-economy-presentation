/**
 * World geometry for the globe and flat-map formations, from Natural Earth 110m
 * (world-atlas). Countries are painted into an equirectangular "region map" whose
 * pixel colors encode a category, then sampled by lat/lon.
 */
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'

export const enum Region {
  Ocean = 0,
  Land = 1,
  Emerging = 2,
  US = 3,
  China = 4,
  Europe = 5,
}

/** Region codes are painted as code*STEP so antialiased border pixels can be told apart. */
const STEP = 50
const W = 2048
const H = 1024
let regionData: Uint8ClampedArray | null = null

/**
 * Low- and lower-middle-income countries (ISO 3166-1 numeric), the talk's "biggest gainers".
 * Sub-Saharan Africa, South and Southeast Asia, parts of Latin America, MENA and Central Asia.
 */
const EMERGING_IDS = new Set([
  // Sub-Saharan Africa
  '024', '204', '072', '854', '108', '120', '140', '148', '178', '180', '384', '226', '232', '231', '266', '270', '288', '324',
  '624', '404', '426', '430', '450', '454', '466', '478', '508', '516', '562', '566', '646', '686', '694', '706', '710', '728',
  '729', '748', '834', '768', '800', '894', '716', '262',
  // South & Southeast Asia
  '356', '050', '586', '524', '144', '004', '064', '104', '116', '418', '704', '608', '360', '626', '598',
  // Latin America & Caribbean
  '068', '340', '558', '320', '222', '332',
  // MENA & Central Asia
  '887', '818', '504', '762', '417', '860',
])

/** EU-27 (ISO 3166-1 numeric): the bloc that "has to choose" on the geopolitics slide. */
const EU_IDS = new Set([
  '040', '056', '100', '191', '196', '203', '208', '233', '246', '250', '276', '300', '348', '372', '380', '428', '440', '442',
  '470', '528', '616', '620', '642', '703', '705', '724', '752',
])

function paint() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = 'rgb(0,0,0)'
  ctx.fillRect(0, 0, W, H)
  const topo = countries110 as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
  const fc = feature(topo, topo.objects.countries)
  const project = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]
  for (const f of fc.features) {
    const id = String(f.id ?? '')
    let code = Region.Land
    if (id === '840') code = Region.US
    else if (id === '156') code = Region.China
    else if (EMERGING_IDS.has(id)) code = Region.Emerging
    else if (EU_IDS.has(id)) code = Region.Europe
    ctx.fillStyle = `rgb(${code * STEP},0,0)`
    const geom = f.geometry
    if (!geom) continue
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
    for (const poly of polys) {
      ctx.beginPath()
      for (const ring of poly) {
        // Split rings that cross the antimeridian (e.g. Russia, Fiji) to avoid smears.
        let prevLon: number | null = null
        ring.forEach(([lon, lat], i) => {
          const [x, y] = project(lon, lat)
          if (i === 0 || (prevLon !== null && Math.abs(lon - prevLon) > 180)) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          prevLon = lon
        })
        ctx.closePath()
      }
      ctx.fill('evenodd')
    }
  }
  regionData = ctx.getImageData(0, 0, W, H).data
}

export function regionAt(lat: number, lon: number): Region {
  if (!regionData) paint()
  const x = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)))
  const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)))
  const v = regionData![(y * W + x) * 4]
  const code = Math.round(v / STEP)
  // Antialiased border pixel between two regions: call it plain land (or ocean if mostly ocean).
  if (Math.abs(v - code * STEP) > 12) return v > STEP / 2 ? Region.Land : Region.Ocean
  return code as Region
}

/** Unit-sphere position for lat/lon in degrees. Longitude 0 faces +z, east is +x. */
export function latLonToVec(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = (lat * Math.PI) / 180
  const lam = (lon * Math.PI) / 180
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)]
}
