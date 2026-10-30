import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTeslaTelemetry, generate24HourHistory } from '../server/tesla.js'

test('Tesla Telemetry returns normal self_consumption flow with solar charging battery and exporting', () => {
  const telemetry = computeTeslaTelemetry({
    outage: false,
    storm: false,
    mode: 'self_consumption',
    reserve: 20,
    solarKw: 9.0,
    loadKw: 2.0,
  })

  assert.equal(telemetry.grid_status, 'SystemGridConnected')
  assert.equal(telemetry.operation_mode, 'self_consumption')
  assert.equal(telemetry.storm_mode_active, false)
  assert.equal(telemetry.backup_reserve_percent, 20)
  assert.equal(telemetry.meters.solar.instant_power, 9000)
  assert.equal(telemetry.meters.load.instant_power, 2000)
  assert.ok(telemetry.meters.battery.instant_power < 0, 'Battery should be charging (negative power)')
  assert.ok(telemetry.meters.site.instant_power < 0, 'Grid should be exporting excess (negative power)')
  assert.equal(telemetry.battery_spec.nominal_full_pack_energy_kwh, 27.0)
})

test('Tesla Telemetry handles blackout islanding with open contactor and battery discharging', () => {
  const telemetry = computeTeslaTelemetry({
    outage: true,
    storm: false,
    solarKw: 1.0,
    loadKw: 3.5,
  })

  assert.equal(telemetry.grid_status, 'SystemIslandedActive')
  assert.equal(telemetry.meters.site.instant_power, 0)
  assert.equal(telemetry.meters.site.status, 'contactor_open')
  assert.ok(telemetry.meters.battery.instant_power > 0, 'Battery should discharge to cover deficit')
})

test('Tesla Storm Watch forces 100% reserve and backup mode', () => {
  const telemetry = computeTeslaTelemetry({
    storm: true,
  })

  assert.equal(telemetry.storm_mode_active, true)
  assert.equal(telemetry.operation_mode, 'backup')
  assert.equal(telemetry.backup_reserve_percent, 100)
  assert.equal(telemetry.battery_charge_percentage, 100)
})

test('Tesla 24-Hour Energy History models diurnal curves and high self-powered score', () => {
  const history = generate24HourHistory()

  assert.equal(history.period, 'day')
  assert.equal(history.points.length, 24)
  assert.ok(history.total_solar_kwh > 30, 'Total solar should be >30 kWh on a sunny day')
  assert.ok(history.self_powered_percent >= 85, 'Self-powered percentage should exceed 85% with Dual Powerwalls')
  assert.equal(history.points[0].hour, '12 AM')
  assert.equal(history.points[12].hour, '12 PM')
  assert.ok(history.points[13].solarKwh > 5.0, 'Peak midday solar generation at 1 PM')
})
