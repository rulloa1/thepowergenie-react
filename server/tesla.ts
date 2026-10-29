/**
/**
 * Tesla Gateway & Telemetry API Handler
 * Reconstructs the Tesla Energy Gateway (TEG) / Powerwall API specifications:
 * - /api/tesla/live (Real-time energy flow, battery state of charge, operating mode)
 * - /api/tesla/meters (Aggregated instant power meters for solar, battery, load, and grid)
 */

import { json } from './http.js'

export interface TeslaMeters {
  solar: { instant_power: number; status: string }
  battery: { instant_power: number; status: string }
  load: { instant_power: number; status: string }
  site: { instant_power: number; status: string }
}

export interface TeslaLiveStatus {
  site_name: string
  gateway_id: string
  firmware_version: string
  grid_status: 'SystemGridConnected' | 'SystemIslandedActive' | 'SystemTransitionToGrid'
  battery_charge_percentage: number
  backup_reserve_percent: number
  storm_mode_active: boolean
  operation_mode: 'self_consumption' | 'autonomous' | 'backup'
  meters: TeslaMeters
  battery_spec: {
    model: string
    pack_count: number
    nominal_full_pack_energy_kwh: number
    current_pack_energy_kwh: number
    continuous_power_kw: number
    peak_surge_kw: number
  }
}

export function computeTeslaTelemetry(params: {
  outage?: boolean
  storm?: boolean
  mode?: 'self_consumption' | 'autonomous' | 'backup'
  reserve?: number
  solarKw?: number
  loadKw?: number
}): TeslaLiveStatus {
  const isOutage = params.outage === true
  const isStorm = params.storm === true
  const mode = params.mode || (isStorm ? 'backup' : 'self_consumption')
  const reserve = params.reserve != null ? params.reserve : (isStorm ? 100 : 25)

  const solarPower = isOutage ? (params.solarKw ?? 6.2) : (params.solarKw ?? 8.4)
  const homeLoad = params.loadKw ?? 2.1
  const batteryPct = isStorm ? 100 : (isOutage ? 82 : 88)
  const totalCapacityKwh = 27.0 // Dual Powerwall 3

  let batteryPower = 0
  let gridPower = 0

  if (isOutage) {
    // Islanded: Solar powers home first; shortfall comes from battery; excess charges battery
    if (solarPower >= homeLoad) {
      batteryPower = -(solarPower - homeLoad) // charging
      gridPower = 0
    } else {
      batteryPower = +(homeLoad - solarPower) // discharging
      gridPower = 0
    }
  } else if (mode === 'backup') {
    // Battery stays full, solar powers home and exports rest to grid
    batteryPower = 0
    gridPower = -(solarPower - homeLoad) // negative = export
  } else {
    // Self-consumption: solar charges battery if under 100%, else exports
    const chargeHeadroom = totalCapacityKwh * (1 - batteryPct / 100)
    if (solarPower > homeLoad) {
      const excess = solarPower - homeLoad
      const batteryCharge = Math.min(excess, 5.0, chargeHeadroom > 0 ? 5.0 : 0)
      batteryPower = -batteryCharge
      gridPower = -(excess - batteryCharge)
    } else {
      const deficit = homeLoad - solarPower
      batteryPower = +deficit
      gridPower = 0
    }
  }

  return {
    site_name: 'Oakland Hills Estate',
    gateway_id: 'TEG-GW3-982410',
    firmware_version: '26.12.4-lfp',
    grid_status: isOutage ? 'SystemIslandedActive' : 'SystemGridConnected',
    battery_charge_percentage: batteryPct,
    backup_reserve_percent: reserve,
    storm_mode_active: isStorm,
    operation_mode: mode,
    meters: {
      solar: {
        instant_power: Number((solarPower * 1000).toFixed(1)),
        status: solarPower > 0 ? 'generating' : 'idle',
      },
      load: {
        instant_power: Number((homeLoad * 1000).toFixed(1)),
        status: 'consuming',
      },
      battery: {
        instant_power: Number((batteryPower * 1000).toFixed(1)),
        status: batteryPower > 0 ? 'discharging' : batteryPower < 0 ? 'charging' : 'idle',
      },
      site: {
        instant_power: Number((gridPower * 1000).toFixed(1)),
        status: isOutage ? 'contactor_open' : gridPower < 0 ? 'exporting' : 'importing',
      },
    },
    battery_spec: {
      model: 'Tesla Powerwall 3 (Dual LFP Architecture)',
      pack_count: 2,
      nominal_full_pack_energy_kwh: totalCapacityKwh,
      current_pack_energy_kwh: Number(((totalCapacityKwh * batteryPct) / 100).toFixed(2)),
      continuous_power_kw: 11.5,
      peak_surge_kw: 18.5,
    },
  }
}

export function handleTeslaLive(request: Request): Response {
  const url = new URL(request.url)
  const outage = url.searchParams.get('outage') === 'true'
  const storm = url.searchParams.get('storm') === 'true'
  const mode = (url.searchParams.get('mode') as 'self_consumption' | 'autonomous' | 'backup') || undefined
  const reserve = url.searchParams.get('reserve') ? Number(url.searchParams.get('reserve')) : undefined
  const solar = url.searchParams.get('solar') ? Number(url.searchParams.get('solar')) : undefined
  const load = url.searchParams.get('load') ? Number(url.searchParams.get('load')) : undefined

  const data = computeTeslaTelemetry({ outage, storm, mode, reserve, solarKw: solar, loadKw: load })
  return json(data)
}

