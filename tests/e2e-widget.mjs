import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { startMockSupabase } from './mock-supabase.ts'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const outDir = '/opt/cursor/artifacts/screenshots'
const port = 4183

async function waitFor(url) {
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still booting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const mock = await startMockSupabase()
await mkdir(outDir, { recursive: true })
await writeFile('/tmp/powergenie-bill.png', png)

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: '/workspace',
  env: {
    ...process.env,
    SUPABASE_URL: mock.url,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_only',
    ASSISTANT_MOCK_AI: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
let viteLog = ''
vite.stdout.on('data', chunk => { viteLog += chunk })
vite.stderr.on('data', chunk => { viteLog += chunk })

let page
try {
  await waitFor(`http://127.0.0.1:${port}/`)
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', message => console.log('browser', message.type(), message.text()))
  page.on('pageerror', error => console.log('pageerror', error.message))
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('genie-launcher').click()
  await page.getByRole('dialog').getByText('Hi, I’m the Power Genie assistant').waitFor()
  await page.screenshot({ path: `${outDir}/widget-desktop.png` })

  await page.getByTestId('genie-panel').getByRole('button', { name: 'Close' }).click()
  await page.evaluate(() => document.getElementById('quote')?.scrollIntoView())
  await page.getByTestId('book-consult').waitFor()
  await page.screenshot({ path: `${outDir}/consult-cta-desktop.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('genie-launcher').click()
  await page.getByRole('dialog').getByText('Hi, I’m the Power Genie assistant').waitFor()
  await page.screenshot({ path: `${outDir}/widget-mobile.png` })

  await page.getByRole('button', { name: 'Upload my light bill' }).click()
  await page.getByTestId('bill-file').setInputFiles('/tmp/powergenie-bill.png')
  await page.getByTestId('bill-confirm').waitFor()
  await page.getByLabel('Name on the bill').waitFor()
  const billName = await page.getByLabel('Name on the bill').inputValue()
  if (billName !== 'Alex Morgan') throw new Error(`Expected extracted name, got ${billName}`)
  await page.screenshot({ path: `${outDir}/bill-confirm.png`, fullPage: false })

  await page.getByRole('button', { name: 'Use these details' }).click()
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('713-555-0100')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('alex@example.com')
  await page.getByRole('button', { name: /AM CT|PM CT/ }).first().click()
  await page.getByTestId('tcpa-consent').check()
  await page.getByRole('button', { name: 'Book my consult' }).click()
  await page.getByTestId('booking-confirmation').waitFor()
  await page.screenshot({ path: `${outDir}/booking-confirmation.png` })

  const calls = await (await fetch(`${mock.url}/__calls`)).json()
  const customer = calls.find(call => call.method === 'POST' && call.path.startsWith('/rest/v1/powergenie_customers'))
  if (!customer || customer.json.stage !== 'bill_received' || customer.json.acknowledged !== 0) {
    throw new Error('Lead was not saved with the hub stage')
  }
  if (customer.authorization) throw new Error('Service key was sent on Authorization')
  if (!String(customer.apikey).startsWith('sb_secret_')) throw new Error('Missing apikey header')

  await browser.close()
  console.log('screenshots saved')
} catch (error) {
  console.error(viteLog.slice(-4000))
  if (page) {
    const text = await page.getByTestId('genie-panel').innerText().catch(() => '')
    console.error('panel:', text.slice(0, 2500))
    await page.screenshot({ path: `${outDir}/e2e-failure.png` }).catch(() => {})
  }
  throw error
} finally {
  try { process.kill(-vite.pid, 'SIGTERM') } catch { vite.kill('SIGTERM') }
  await mock.close()
}
