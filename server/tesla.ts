/**
 * Tesla Gateway & Telemetry API Handler
 * Reconstructs the Tesla Energy Gateway (TEG) / Powerwall API specifications:
 * - /api/tesla/live (Real-time energy flow, battery state of charge, operating mode)
 * - /api/tesla/history (24-hour historical generation, consumption, battery charge/discharge, and grid import/export)
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

export interface HourlyEnergyPoint {
  hour: string
  solarKwh: number
  homeKwh: number
  batteryChargeKwh: number
  batteryDischargeKwh: number
  gridImportKwh: number
  gridExportKwh: number
  soePercent: number
}

export interface TeslaEnergyHistory {
  period: 'day' | 'week' | 'month'
  total_solar_kwh: number
  total_home_kwh: number
  total_grid_import_kwh: number
  total_grid_export_kwh: number
  self_powered_percent: number
  points: HourlyEnergyPoint[]
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

/**
 * Reconstructs 24-hour diurnally realistic hourly power flow curve:
 * - Solar curve: Bell curve starting ~6 AM, peaking ~1 PM (8-9 kW), ending ~7 PM.
 * - Home consumption: Morning baseline, afternoon lull, evening surge (dinner, HVAC, EV charging).
 * - Powerwall: Charges during solar peak; discharges during evening peak utility rates (4 PM - 9 PM).
 * - Grid: Minimal import; exports excess midday solar.
 */
export function generate24HourHistory(): TeslaEnergyHistory {
  const points: HourlyEnergyPoint[] = []
  let totalSolar = 0
  let totalHome = 0
  let totalGridImport = 0
  let totalGridExport = 0
  let batteryKwh = 18.0 // starting charge ~67%

  for (let h = 0; h < 24; h++) {
    const hourLabel = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

    // Solar generation bell curve (sun rises at 6 AM, peaks at 13:00, sets at 19:00)
    let solar = 0
    if (h >= 6 && h <= 18) {
      const x = (h - 6) / 12 // 0 to 1
      solar = Math.sin(x * Math.PI) * 9.2 // peak 9.2 kWh
      solar = Math.max(0, Number(solar.toFixed(2)))
    }

    // Home consumption: morning spike (7-9 AM), evening peak (17-22 PM), night baseline (0.8-1.2)
    let home = 1.1
    if (h >= 7 && h <= 9) home = 2.4
    else if (h >= 17 && h <= 21) home = 3.8
    else if (h >= 10 && h <= 16) home = 1.8
    home = Number(home.toFixed(2))

    let batteryCharge = 0
    let batteryDischarge = 0
    let gridImport = 0
    let gridExport = 0

    // Solar powers home first
    const solarToHome = Math.min(solar, home)
    const excessSolar = solar - solarToHome
    const homeDeficit = home - solarToHome

    if (excessSolar > 0) {
      // Charge battery up to 27 kWh max at up to 5 kW rate
      const chargeCap = Math.min(excessSolar, 5.0, 27.0 - batteryKwh)
      if (chargeCap > 0) {
        batteryCharge = Number(chargeCap.toFixed(2))
        batteryKwh += batteryCharge
      }
      gridExport = Number(Math.max(0, excessSolar - batteryCharge).toFixed(2))
    } else if (homeDeficit > 0) {
      // Discharge battery if above reserve (20% = 5.4 kWh)
      const reserveKwh = 5.4
      const availableDischarge = Math.max(0, batteryKwh - reserveKwh)
      const discharge = Math.min(homeDeficit, availableDischarge, 5.0)
      if (discharge > 0) {
        batteryDischarge = Number(discharge.toFixed(2))
        batteryKwh -= batteryDischarge
      }
      gridImport = Number(Math.max(0, homeDeficit - batteryDischarge).toFixed(2))
    }

    const soePct = Math.round((batteryKwh / 27.0) * 100)

    totalSolar += solar
    totalHome += home
    totalGridImport += gridImport
    totalGridExport += gridExport

    points.push({
      hour: hourLabel,
      solarKwh: solar,
      homeKwh: home,
      batteryChargeKwh: batteryCharge,
      batteryDischargeKwh: batteryDischarge,
      gridImportKwh: gridImport,
      gridExportKwh: gridExport,
      soePercent: soePct,
    })
  }

  const selfPoweredKwh = totalHome - totalGridImport
  const selfPoweredPercent = Math.min(100, Math.round((selfPoweredKwh / totalHome) * 100))

  return {
    period: 'day',
    total_solar_kwh: Number(totalSolar.toFixed(1)),
    total_home_kwh: Number(totalHome.toFixed(1)),
    total_grid_import_kwh: Number(totalGridImport.toFixed(1)),
    total_grid_export_kwh: Number(totalGridExport.toFixed(1)),
    self_powered_percent: selfPoweredPercent,
    points,
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

export function handleTeslaHistory(): Response {
  const history = generate24HourHistory()
  return json(history)
}
