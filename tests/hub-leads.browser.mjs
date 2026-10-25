/**
 * Drives the Leads tab against tests/hub-lead-fixture-server.mjs and the Vite app.
 * Not part of `npm test`. Run after both servers are up:
 *   node tests/hub-leads.browser.mjs
 */
import { chromium } from 'playwright'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

const base = process.env.HUB_APP_URL || 'http://127.0.0.1:3000'
const outDir = '/opt/cursor/artifacts'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

await mkdir(outDir, { recursive: true })
await writeFile('/tmp/powergenie-hub-bill.png', png)

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const recordVideo = process.env.HUB_RECORD_VIDEO === '1'
const context = await browser.newContext({
  viewport: { width: recordVideo ? 390 : 1280, height: recordVideo ? 844 : 900 },
  recordVideo: recordVideo ? { dir: outDir, size: { width: 390, height: 844 } } : undefined,
})
const page = await context.newPage()
const notes = []
const shot = async (name) => {
  if (recordVideo) return
  const path = `${outDir}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  notes.push(path)
}
const resize = async (width, height) => {
  if (!recordVideo) await page.setViewportSize({ width, height })
}
const beat = async () => {
  if (recordVideo) await page.waitForTimeout(700)
}

try {
  await page.goto(`${base}/dashboard?tab=leads`, { waitUntil: 'networkidle' })
  await page.locator('#s-email').fill('horace.lawrence@sunrun.com')
  await page.locator('#s-pass').fill('hub-test-pass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Add lead' }).waitFor({ timeout: 15000 })
  await page.getByText('Inbox Neighbor').waitFor()
  await page.getByText('Booking Guest').waitFor()
  await page.getByText('Gmail message 18abcdef123').waitFor()
  const booking = page.locator('li').filter({ hasText: 'Booking Guest' })
  if (await booking.getByRole('button', { name: 'Edit' }).count()) {
    throw new Error('Booking appointments should stay view-only')
  }
  await beat()
  await shot('leads-active-desktop')

  await resize(390, 844)
  await shot('leads-active-phone')
  await page.getByRole('button', { name: 'Add lead' }).click()
  await page.getByRole('dialog', { name: 'Add a lead' }).waitFor()
  await beat()
  await shot('leads-add-form-phone')

  await page.locator('#lead-bill').setInputFiles('/tmp/powergenie-hub-bill.png')
  await page.getByText('Numbers filled from the bill').waitFor({ timeout: 20000 })
  const filledName = await page.locator('#lead-name').inputValue()
  if (filledName !== 'Alex Morgan') throw new Error(`Bill reader filled ${filledName}`)
  const filledKwh = await page.locator('#lead-kwh').inputValue()
  if (filledKwh !== '1100') throw new Error(`Bill reader kWh ${filledKwh}`)
  await page.locator('#lead-name').fill('Casey Nguyen')
  await page.locator('#lead-phone').fill('713-555-0148')
  await beat()
  await shot('leads-add-form-corrected-phone')
  await page.getByRole('button', { name: 'Save lead' }).click()
  await page.getByText('Lead added.').waitFor({ timeout: 15000 })
  const casey = page.locator('li').filter({ hasText: 'Casey Nguyen' }).first()
  await casey.waitFor()
  await casey.getByText('1,100 kWh').waitFor()
  await beat()
  await shot('leads-added-phone')

  await resize(1280, 900)
  await casey.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#lead-stage').selectOption('signed')
  await page.locator('#lead-phone').fill('832-555-0177')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByText('Lead updated.').waitFor()
  await casey.getByText('Signed').waitFor()
  await casey.getByText('832-555-0177').waitFor()
  await beat()
  await shot('leads-edited-desktop')

  await casey.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('dialog', { name: 'Archive this lead?' }).waitFor()
  await beat()
  await shot('leads-archive-confirm')
  await page.getByRole('button', { name: 'Archive lead' }).click()
  await page.getByText('Lead archived.').waitFor()
  await page.getByText('Casey Nguyen').waitFor({ state: 'hidden' })

  await page.getByRole('tab', { name: /Archived/ }).click()
  await page.getByText('Casey Nguyen').waitFor()
  await beat()
  await shot('leads-archived')
  await casey.getByRole('button', { name: 'Restore' }).click()
  await page.getByText('Lead restored').waitFor()
  await page.getByRole('tab', { name: 'Active' }).waitFor()
  await casey.getByText('Signed').waitFor()

  const inbox = page.locator('li').filter({ hasText: 'Inbox Neighbor' }).first()
  await inbox.getByRole('button', { name: 'Edit' }).click()
  const notesValue = await page.locator('#lead-notes').inputValue()
  if (!notesValue.includes('Gmail message 18abcdef123')) {
    throw new Error(`Gmail note was not kept: ${notesValue}`)
  }
  await page.locator('#lead-stage').selectOption('savings_calc')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByText('Lead updated.').waitFor()
  await inbox.getByText('Gmail message 18abcdef123').waitFor()
  await inbox.getByText('Savings calc').waitFor()
  await beat()
  await shot('leads-gmail-kept')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const download = await downloadPromise
  const csvPath = `${outDir}/powergenie-all-leads.csv`
  await download.saveAs(csvPath)
  const csv = await readFile(csvPath, 'utf8')
  if (!csv.includes('ID,Name,Phone') || !csv.includes('Casey Nguyen') || !csv.includes('Inbox Neighbor') || !csv.includes('Booking Guest')) {
    throw new Error(`CSV export missing leads:\n${csv.slice(0, 500)}`)
  }
  if (!csv.includes('Gmail message 18abcdef123')) throw new Error('CSV dropped the Gmail note')

  await writeFile(`${outDir}/hub-leads-browser.log`, `ok\n${notes.join('\n')}\n`)
  console.log('browser flow ok')
} catch (error) {
  await shot('leads-failure').catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  const video = recordVideo ? page.video() : null
  await context.close()
  if (video) {
    const recorded = await video.path()
    await rename(recorded, `${outDir}/hub-leads-add-edit-archive.webm`)
    console.log(`${outDir}/hub-leads-add-edit-archive.webm`)
  }
  await browser.close()
}
