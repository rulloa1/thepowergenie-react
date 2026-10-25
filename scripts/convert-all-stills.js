import { execSync } from 'child_process';
import path from 'path';

const brainDir = 'C:\\Users\\roryulloa\\.gemini\\antigravity-ide\\brain\\6e0eccaf-78f6-4994-96ab-6551d8fffbe5';

const stills = [
  { id: '01-sun', src: path.join(brainDir, 'scene_01_sun_texas_1792941889234.jpg') },
  { id: '02-roof', src: path.join(brainDir, 'scene_02_roof_real_skirt_1792942289428.jpg') },
  { id: '03-battery', src: path.join(brainDir, 'scene_03_battery_same_house_1792942043754.jpg') },
  { id: '04-home', src: path.join(process.cwd(), 'scripts', 'test-wan-scene-04.png') },
  { id: '05-community', src: path.join(brainDir, 'scene_05_wallet_same_house_1792942097361.jpg') },
  { id: '06-cta', src: path.join(brainDir, 'scene_06_hero_same_house_1792942120924.jpg') }
];

console.log('Writing stills (webp and png) for all 6 scenes...');
for (const s of stills) {
  // WebP
  execSync(`ffmpeg.exe -v error -y -i "${s.src}" -vf "scale=1800:-2" -q:v 85 "public/assets/stills/${s.id}.webp"`);
  execSync(`ffmpeg.exe -v error -y -i "${s.src}" -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" -q:v 85 "public/assets/stills/${s.id}-m.webp"`);
  
  // PNG fallbacks
  execSync(`ffmpeg.exe -v error -y -i "${s.src}" -vf "scale=1800:-2" "public/assets/stills/${s.id}.png"`);
  execSync(`ffmpeg.exe -v error -y -i "${s.src}" -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" "public/assets/stills/${s.id}-m.png"`);
  
  console.log(`Processed ${s.id}`);
}

console.log('All stills updated successfully!');
