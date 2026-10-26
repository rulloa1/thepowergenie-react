import type { RoofDesign, RoofPanel } from '../../shared/workflow.js'

/**
 * Roof data from Google's Solar API, the address lookup it needs, and the
 * satellite picture the proposal draws panels on. The key stays on the
 * server: the browser only ever sees our own image URL.
 *
 * Needs a Google Maps Platform key with the Solar API, Geocoding API and
 * Maps Static API turned on, saved on Vercel as GOOGLE_MAPS_API_KEY.
 */

export function googleKey(): string | null {
  const key = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_SOLAR_API_KEY || '').trim()
  return key || null
}

export type RoofLookup =
  | { status: 'ok'; design: RoofDesign }
  | { status: 'no_key' | 'no_address' | 'not_found' | 'error'; note: string }

type GeocodeResponse = {
  status?: string
  results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number }; location_type?: string } }>
}

type LatLng = { latitude?: number; longitude?: number }

type BuildingInsights = {
  center?: LatLng
  imageryDate?: { year?: number; month?: number; day?: number }
  imageryQuality?: string
  boundingBox?: { sw?: LatLng; ne?: LatLng }
  solarPotential?: {
    maxArrayPanelsCount?: number
    maxSunshineHoursPerYear?: number
    panelCapacityWatts?: number
    panelHeightMeters?: number
    panelWidthMeters?: number
    wholeRoofStats?: { areaMeters2?: number }
    roofSegmentStats?: Array<{ azimuthDegrees?: number; pitchDegrees?: number }>
    solarPanels?: Array<{ center?: LatLng; orientation?: string; yearlyEnergyDcKwh?: number; segmentIndex?: number }>
  }
}

const TIMEOUT = 12_000

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'PowerGenieWebsite/1.0' } })
    const body = (await response.json().catch(() => null)) as T | null
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function geocode(address: string, key: string): Promise<{ lat: number; lng: number; formatted: string | null } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=us&key=${encodeURIComponent(key)}`
  const { body } = await getJson<GeocodeResponse>(url)
  const first = body?.status === 'OK' ? body.results?.[0] : undefined
  const lat = num(first?.geometry?.location?.lat)
  const lng = num(first?.geometry?.location?.lng)
  if (lat == null || lng == null) return null
  return { lat, lng, formatted: first?.formatted_address || null }
}

async function insights(lat: number, lng: number, key: string): Promise<{ status: number; body: BuildingInsights | null }> {
  let last: { status: number; body: BuildingInsights | null } = { status: 0, body: null }
  for (const quality of ['HIGH', 'MEDIUM']) {
    const url =
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}` +
      `&location.longitude=${lng}&requiredQuality=${quality}&key=${encodeURIComponent(key)}`
    last = await getJson<BuildingInsights>(url)
    if (last.status === 200 && last.body?.solarPotential) return last
    if (last.status !== 404) return last
  }
  return last
}

/** Zoom 21 for a small roof, 20 otherwise, so the whole roof fits the 640px picture. */
function pickZoom(box: BuildingInsights['boundingBox'], lat: number): number {
  const sw = box?.sw
  const ne = box?.ne
  const swLat = num(sw?.latitude)
  const swLng = num(sw?.longitude)
  const neLat = num(ne?.latitude)
  const neLng = num(ne?.longitude)
  if (swLat == null || swLng == null || neLat == null || neLng == null) return 20
  const height = (neLat - swLat) * 111_320
  const width = (neLng - swLng) * 111_320 * Math.cos((lat * Math.PI) / 180)
  return Math.max(height, width) < 32 ? 21 : 20
}

export async function lookupRoof(address: string | null): Promise<RoofLookup> {
  const key = googleKey()
  if (!key) return { status: 'no_key', note: 'Add a Google Maps API key to design on the real roof.' }
  if (!address || address.trim().length < 6) return { status: 'no_address', note: 'The lead needs a full street address.' }
  const place = await geocode(address, key)
  if (!place) return { status: 'not_found', note: 'Google could not find that address.' }
  const found = await insights(place.lat, place.lng, key)
  if (found.status === 404) return { status: 'not_found', note: 'Google has no roof imagery for this address yet.' }
  if (found.status !== 200 || !found.body?.solarPotential) {
    return { status: 'error', note: found.status === 403 ? 'The Google key is missing the Solar API.' : 'The roof lookup did not answer. It will try again.' }
  }
  const body = found.body
  const potential = body.solarPotential!
  const segments = potential.roofSegmentStats || []
  const panels: RoofPanel[] = []
  for (const panel of potential.solarPanels || []) {
    const lat = num(panel.center?.latitude)
    const lng = num(panel.center?.longitude)
    const dc = num(panel.yearlyEnergyDcKwh)
    if (lat == null || lng == null || dc == null) continue
    const segment = typeof panel.segmentIndex === 'number' ? segments[panel.segmentIndex] : undefined
    panels.push({
      lat,
      lng,
      orientation: panel.orientation === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE',
      azimuth: Math.round(num(segment?.azimuthDegrees) ?? 180),
      dcKwh: Math.round(dc * 10) / 10,
    })
  }
  if (panels.length === 0) return { status: 'not_found', note: 'Google found the building but no usable roof area.' }
  const centerLat = num(body.center?.latitude) ?? place.lat
  const centerLng = num(body.center?.longitude) ?? place.lng
  const date = body.imageryDate
  return {
    status: 'ok',
    design: {
      center: { lat: centerLat, lng: centerLng },
      zoom: pickZoom(body.boundingBox, centerLat),
      formattedAddress: place.formatted,
      panelWidthM: num(potential.panelWidthMeters) ?? 1.045,
      panelHeightM: num(potential.panelHeightMeters) ?? 1.879,
      googlePanelWatts: num(potential.panelCapacityWatts) ?? 400,
      maxPanels: num(potential.maxArrayPanelsCount) ?? panels.length,
      imageryDate: date?.year ? `${date.year}-${String(date.month || 1).padStart(2, '0')}` : null,
      imageryQuality: body.imageryQuality || null,
      roofAreaM2: num(potential.wholeRoofStats?.areaMeters2),
      sunshineHours: num(potential.maxSunshineHoursPerYear),
      panels,
    },
  }
}

/** Satellite picture behind the panel drawing. Fetched per view, not stored. */
export async function fetchRoofImage(center: { lat: number; lng: number }, zoom: number): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const key = googleKey()
  if (!key) return null
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}` +
    `&zoom=${zoom}&size=640x640&scale=2&maptype=satellite&key=${encodeURIComponent(key)}`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
    const type = response.headers.get('content-type') || ''
    if (!response.ok || !type.startsWith('image/')) return null
    return { bytes: await response.arrayBuffer(), type }
  } catch {
    return null
  }
}
