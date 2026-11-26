const { chromium } = require('playwright');
const path = require('path');

const outDir = 'C:/Users/roryulloa/.gemini/antigravity/brain/db7078cb-0724-42af-bd61-656266da3167';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('1. Navigating to dashboard...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });

  console.log('2. Waiting for and clicking Explore demo desk...');
  const exploreBtn = page.getByRole('button', { name: /Explore demo desk|Preview a sample desk/i });
  await exploreBtn.waitFor({ state: 'visible', timeout: 15000 });
  await exploreBtn.click();
  await page.waitForTimeout(2500);

  // Take Dashboard Screenshot
  const p1 = path.join(outDir, 'dashboard_preview.png');
  await page.screenshot({ path: p1 });
  console.log('Saved dashboard preview:', p1);

  // Click top "Roof design" button
  console.log('3. Opening Roof Design Studio...');
  const topRoofBtn = page.getByRole('button', { name: 'Roof design' }).first();
  await topRoofBtn.waitFor({ state: 'visible', timeout: 15000 });
  await topRoofBtn.click();
  await page.waitForTimeout(2000);

  // Take Roof Design Studio screenshot
  const p2 = path.join(outDir, 'roof_studio_preview.png');
  await page.screenshot({ path: p2 });
  console.log('Saved roof studio preview:', p2);

  // Click 3D World (Genie 4)
  console.log('4. Clicking 3D World (Genie 4)...');
  const genieBtn = page.getByRole('button', { name: /3D World \(Genie 4\)/i });
  await genieBtn.waitFor({ state: 'visible', timeout: 10000 });
  await genieBtn.click();
  console.log('Rendering 3D solar canvas...');
  await page.waitForTimeout(4000);

  // Take 3D World Viewer Screenshot
  const p3 = path.join(outDir, 'genie_3d_world_preview.png');
  await page.screenshot({ path: p3 });
  console.log('Saved 3D world preview:', p3);

  // Click Close on 3D viewer
  const exitGenie = page.getByRole('button', { name: /Complete & Exit/i });
  if (await exitGenie.isVisible()) {
    await exitGenie.click();
    await page.waitForTimeout(1000);
  }

  // Close Roof Studio
  const closeBtn = page.getByRole('button', { name: /Close/i }).first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(1000);
  }

  // Click Top "Conference room" button
  console.log('5. Opening Conference Room...');
  const topConfBtn = page.getByRole('button', { name: 'Conference room' }).first();
  await topConfBtn.click();
  await page.waitForTimeout(2000);

  // Click Start Sample Call if present
  const startCall = page.getByRole('button', { name: /Start sample call|Join room/i }).first();
  if (await startCall.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Starting sample conference call...');
    await startCall.click();
    await page.waitForTimeout(3000);
  }

  // Project 3D World
  const conf3d = page.getByRole('button', { name: /3D World \(Genie 4\)/i });
  if (await conf3d.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Toggling 3D World to Center Stage in Conference Room...');
    await conf3d.click();
    await page.waitForTimeout(4000);
  }

  // Take Conference Stage Screenshot
  const p4 = path.join(outDir, 'genie_conference_stage_preview.png');
  await page.screenshot({ path: p4 });
  console.log('Saved conference stage preview:', p4);

  // Click 3D Solar side tab
  const solarTab = page.getByRole('button', { name: /3D Solar/i }).first();
  if (await solarTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Clicking 3D Solar side tab...');
    await solarTab.click();
    await page.waitForTimeout(2500);
  }

  // Take Conference Sidebar Screenshot
  const p5 = path.join(outDir, 'genie_conference_sidebar_preview.png');
  await page.screenshot({ path: p5 });
  console.log('Saved conference sidebar preview:', p5);

  await browser.close();
  console.log('SUCCESS! All 5 preview screenshots captured.');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
