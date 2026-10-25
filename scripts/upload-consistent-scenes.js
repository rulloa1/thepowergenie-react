import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\roryulloa\\.gemini\\antigravity-ide\\brain\\6e0eccaf-78f6-4994-96ab-6551d8fffbe5';

const scenes = [
  { name: 'scene_01', path: path.join(brainDir, 'scene_01_sun_texas_1792941889234.jpg') },
  { name: 'scene_02', path: path.join(brainDir, 'scene_02_roof_real_skirt_1792942289428.jpg') },
  { name: 'scene_03', path: path.join(brainDir, 'scene_03_battery_same_house_1792942043754.jpg') },
  { name: 'scene_04', path: path.join(process.cwd(), 'scripts', 'test-wan-scene-04.png') },
  { name: 'scene_05', path: path.join(brainDir, 'scene_05_wallet_same_house_1792942097361.jpg') },
  { name: 'scene_06', path: path.join(brainDir, 'scene_06_hero_same_house_1792942120924.jpg') },
];

async function main() {
  const urls = {};
  for (const sc of scenes) {
    const stat = fs.statSync(sc.path);
    const ext = path.extname(sc.path);
    const sfsPath = `scenes-consistent/${sc.name}${ext}`;

    console.log(`\n--- Uploading ${sc.name} (${stat.size} bytes) from ${sc.path} ---`);
    // 1. Get put URL
    const putInput = JSON.stringify({ path: sfsPath, sizeBytes: stat.size + 10000, ttl: '7d' });
    const putResRaw = execSync(`monid run -p sfs -e /put -i ${JSON.stringify(putInput)}`).toString();
    const jsonMatch = putResRaw.match(/\{[\s\S]*"uploadUrl"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse uploadUrl from:', putResRaw);
      continue;
    }
    const { uploadUrl } = JSON.parse(jsonMatch[0]);

    // 2. Upload via curl
    execSync(`curl.exe -s -T "${sc.path}" "${uploadUrl}"`);
    console.log(`Uploaded ${sc.name} to SFS.`);

    // 3. Get shareable download URL via /cat
    const catInput = JSON.stringify({ path: sfsPath, ttl: '7d' });
    const catResRaw = execSync(`monid run -p sfs -e /cat -i ${JSON.stringify(catInput)}`).toString();
    const catMatch = catResRaw.match(/\{[\s\S]*"url"[\s\S]*\}/);
    if (!catMatch) {
      console.error('Failed to parse cat url from:', catResRaw);
      continue;
    }
    const { url } = JSON.parse(catMatch[0]);
    urls[sc.name] = url;
    console.log(`Signed public URL for ${sc.name}: ${url}`);
  }

  fs.writeFileSync('scripts/scene-urls.json', JSON.stringify(urls, null, 2));
  console.log('\nAll consistent scene URLs saved to scripts/scene-urls.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
