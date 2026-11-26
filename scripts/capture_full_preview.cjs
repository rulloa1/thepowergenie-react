const { chromium } = require('playwright');
const path = require('path');

const outDir = 'C:/Users/roryulloa/.gemini/antigravity/brain/db7078cb-0724-42af-bd61-656266da3167';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('1. Navigating to dashboard...');
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForTimeout(1000);

  const exploreBtn = page.getByRole('button', { name: /Explore demo desk/i });
  if (await exploreBtn.isVisible()) {
    console.log('2. Entering demo desk...');
    await exploreBtn.click();
    await page.waitForTimeout(2000);
  }

  // Screenshot 1: Dashboard Desk
  const dashPath = path.join(outDir, 'dashboard_preview.png');
  await page.screenshot({ path: dashPath });
  console.log('Saved dashboard preview:', dashPath);

  // Click Roof Design for Marcus Sterling
  console.log('3. Opening Roof Design for Marcus Sterling...');
  const roofButtons = page.getByRole('button', { name: 'Roof design' });
  await roofButtons.nth(1).click(); // Lead-specific button
  await page.waitForTimeout(1500);

  // Click "3D World (Genie 4)"
  console.log('4. Opening Genie 4 3D World...');
  const genieBtn = page.getByRole('button', { name: /3D World \(Genie 4\)/i });
  await genieBtn.waitFor({ state: 'visible', timeout: 5000 });
  await genieBtn.click();
  await page.waitForTimeout(3000);

  // Screenshot 2: Genie 4 3D World in Roof Design Studio
  const worldPath = path.join(outDir, 'genie_3d_world_preview.png');
  await page.screenshot({ path: worldPath });
  console.log('Saved 3D World preview:', worldPath);

  // Close 3D viewer
  console.log('5. Closing 3D viewer...');
  const exit3d = page.getByRole('button', { name: /Complete & Exit/i });
  await exit3d.click();
  await page.waitForTimeout(1000);

  // Close Roof Design dialog
  const closeRoof = page.getByRole('button', { name: /Close roof designer|Close/i }).first();
  if (await closeRoof.isVisible()) {
    await closeRoof.click();
    await page.waitForTimeout(1000);
  }

  // Open Conference Room for Marcus Sterling
  console.log('6. Opening Conference Room for Marcus Sterling...');
  const confButtons = page.getByRole('button', { name: 'Conference room' });
  await confButtons.nth(1).click();
  await page.waitForTimeout(1500);

  // In the Conference desk sheet, click "Start sample call"
  const startCallBtn = page.getByRole('button', { name: /Start sample call|Join room/i }).first();
  if (await startCallBtn.isVisible()) {
    console.log('7. Starting sample conference call...');
    await startCallBtn.click();
    await page.waitForTimeout(2500);
  }

  // Toggle "3D World (Genie 4)" in Conference Header
  console.log('8. Projecting 3D World to Center Stage in Conference Room...');
  const conf3dBtn = page.getByRole('button', { name: /3D World \(Genie 4\)/i });
  if (await conf3dBtn.isVisible()) {
    await conf3dBtn.click();
    await page.waitForTimeout(3000);
  }

  // Screenshot 3: Conference Room Stage with 3D Genie World and Video PIP
  const stagePath = path.join(outDir, 'genie_conference_stage_preview.png');
  await page.screenshot({ path: stagePath });
  console.log('Saved Conference Stage preview:', stagePath);

  // Click 3D Solar tab in aside
  console.log('9. Switching to 3D Solar sidebar tab...');
  const solarTab = page.getByRole('button', { name: /3D Solar/i }).first();
  if (await solarTab.isVisible()) {
    await solarTab.click();
    await page.waitForTimeout(2000);
  }

  // Screenshot 4: Conference Room with 3D Solar in Sidebar
  const asidePath = path.join(outDir, 'genie_conference_sidebar_preview.png');
  await page.screenshot({ path: asidePath });
  console.log('Saved Conference Sidebar preview:', asidePath);

  await browser.close();
  console.log('All previews captured successfully!');
}

capture().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
