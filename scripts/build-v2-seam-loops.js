import { execSync } from 'child_process';
import path from 'path';

const vidDir = 'public/assets-v2/vid';
const scenes = ['01-sun', '02-roof', '03-battery', '04-home', '05-community'];

console.log('Generating seam loops for consistent House 5309 videos...');

for (const s of scenes) {
  const src = `${vidDir}/encoded/${s}-dive.mp4`;
  const desktopLoop = `${vidDir}/encoded/${s}-loop.mp4`;
  const mobileLoop = `${vidDir}/mobile/${s}-loop.mp4`;

  console.log(`Building loop for ${s}...`);
  // Desktop: native size, forward + reverse concat
  execSync(`ffmpeg.exe -v error -y -i "${src}" -filter_complex "[0:v]split[f][r];[r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[b];[f][b]concat=n=2:v=1:a=0" -an -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart "${desktopLoop}"`);

  // Mobile: 720-wide, tighter GOP
  execSync(`ffmpeg.exe -v error -y -i "${desktopLoop}" -vf "scale=720:-2" -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${mobileLoop}"`);

  console.log(`Completed loop for ${s}!`);
}

// Ensure 06-cta-dive and connectors have 720-wide mobile encodes
const mobilePasses = ['06-cta-dive', 'c01-sun-roof', 'c02-roof-battery', 'c03-battery-home', 'c04-home-community', 'c05-community-cta'];
for (const f of mobilePasses) {
  const desktopSrc = `${vidDir}/encoded/${f}.mp4`;
  const mobileDest = `${vidDir}/mobile/${f}.mp4`;
  console.log(`Optimizing mobile encode for ${f}...`);
  execSync(`ffmpeg.exe -v error -y -i "${desktopSrc}" -vf "scale=720:-2" -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${mobileDest}"`);
}

console.log('All consistent House 5309 seam loops and mobile encodes complete!');
