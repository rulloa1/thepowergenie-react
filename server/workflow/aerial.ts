import type { PreparedRoofAerial } from '../../shared/roofAerial.js'
import { HttpError } from '../http.js'
import { fetchRoofImage, googleKey } from './google.js'

/** Prepare existing satellite imagery; never represent it as a newly flown photograph. */
export async function prepareRoofAerial(address: string | null): Promise<PreparedRoofAerial> {
  if (!address || address.trim().length < 10 || !/\d/.test(address)) throw new HttpError(422, 'Add the customer’s full street address before preparing the aerial.')
  const key = googleKey()
  if (!key) throw new HttpError(503, 'Aerial capture needs the Google Geocoding and Maps Static services configured. You can still review the address in Maps.')
  let response: Response
  try {
    const params = new URLSearchParams({ address: address.trim(), region: 'us', key })
    response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(12000) })
  } catch { throw new HttpError(502, 'The address lookup did not answer. Try preparing the aerial again.') }
  const payload = await response.json().catch(() => null) as {
    status?: string;
    results?: Array<{ partial_match?: boolean; formatted_address?: string; geometry?: { location_type?: string; location?: { lat?: number; lng?: number } } }>;
  } | null
  if (!response.ok || payload?.status === 'REQUEST_DENIED' || payload?.status === 'OVER_QUERY_LIMIT') throw new HttpError(503, 'The mapping service is unavailable. Check Google API access and billing, then retry.')
  if (!payload || !['OK', 'ZERO_RESULTS'].includes(payload.status || '')) throw new HttpError(502, 'The mapping service returned an incomplete address response. Try again later.')
  const place = payload?.status === 'OK' ? payload.results?.[0] : undefined
  const center = place?.geometry?.location
  if (!place || place.partial_match || place.geometry?.location_type !== 'ROOFTOP' || typeof center?.lat !== 'number' || typeof center.lng !== 'number' || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180) {
    throw new HttpError(422, 'That address did not resolve to one precise property. Check the street number, city, and ZIP before preparing the aerial.')
  }
  const image = await fetchRoofImage({ lat: center.lat, lng: center.lng }, 20, 'jpg')
  if (!image || !/^image\/(png|jpeg)(;|$)/i.test(image.type) || image.bytes.byteLength === 0 || image.bytes.byteLength > 2500000) throw new HttpError(503, 'Satellite imagery could not be prepared. Check Maps Static access or try again later.')
  return {
    address: address.trim(), formattedAddress: place.formatted_address || address.trim(),
    source: 'Google Maps satellite', preparedAt: new Date().toISOString(), zoom: 20,
    locationType: 'ROOFTOP', imageDataUrl: `data:${image.type.split(';')[0]};base64,${Buffer.from(image.bytes).toString('base64')}`,
  }
}
