import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\roryulloa\\.gemini\\antigravity-ide\\brain\\6e0eccaf-78f6-4994-96ab-6551d8fffbe5';
const scene01File = path.join(brainDir, 'scene_01_sun_texas_1792941889234.jpg');
const sceneUrls = JSON.parse(fs.readFileSync('scripts/scene-urls.json', 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadFile(filePath, remoteName) {
  const stat = fs.statSync(filePath);
  const putInput = JSON.stringify({ path: remoteName, sizeBytes: stat.size + 10000, ttl: '7d' });
  const putRes = execSync(`monid run -p sfs -e /put -i ${JSON.stringify(putInput)}`).toString();
  const jsonMatch = putRes.match(/\{[\s\S]*"uploadUrl"[\s\S]*\}/);
  const { uploadUrl } = JSON.parse(jsonMatch[0]);

  execSync(`curl.exe -s -T "${filePath}" "${uploadUrl}"`);

  const catInput = JSON.stringify({ path: remoteName, ttl: '7d' });
  const catRes = execSync(`monid run -p sfs -e /cat -i ${JSON.stringify(catInput)}`).toString();
  const catMatch = catRes.match(/\{[\s\S]*"url"[\s\S]*\}/);
  const { url } = JSON.parse(catMatch[0]);
  return url;
}

async function runSeedance(payload, jobName) {
  console.log(`\nStarting Seedance job: ${jobName}`);
  const cmd = `monid run -p bytedance -e /v1/video/seedance-2.0-fast -i ${JSON.stringify(JSON.stringify(payload))}`;
  const out = execSync(cmd).toString();
  const runIdMatch = out.match(/Run ID:\s*([A-Za-z0-9_]+)/);
  if (!runIdMatch) throw new Error(`Could not parse runId from: ${out}`);
  const runId = runIdMatch[1];
  console.log(`Launched ${jobName} run: ${runId}`);

  let attempts = 0;
  let videoUrl = null;
  while (attempts < 60) {
    await sleep(6000);
    attempts++;
    try {
      const raw = execSync(`monid runs get -r ${runId} -j`).toString();
      const data = JSON.parse(raw);
      console.log(`[${jobName} - ${attempts}] Status: ${data.status}`);
      if (data.status === 'COMPLETED') {
        videoUrl = data.output?.content?.video_url;
        break;
      }
      if (['FAILED', 'BLOCKED', 'STOPPED', 'TIME_OUT'].includes(data.status)) {
        throw new Error(`Run ${runId} failed with ${data.status}`);
      }
    } catch (e) {
      if (e.message.includes('failed with')) throw e;
    }
  }

  if (!videoUrl) throw new Error(`Timed out waiting for ${jobName}`);

  const rawPath = `scripts/raw-${jobName}.mp4`;
  console.log(`Downloading ${jobName}...`);
  execSync(`curl.exe -fsSL "${videoUrl}" -o "${rawPath}"`);

  // Transcode desktop
  const desktopOut = `public/assets/vid/encoded/${jobName}.mp4`;
  console.log(`Transcoding desktop: ${desktopOut}...`);
  execSync(`ffmpeg.exe -v error -y -i "${rawPath}" -an -vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${desktopOut}"`);

  // Transcode mobile
  const mobileOut = `public/assets/vid/mobile/${jobName}.mp4`;
  console.log(`Transcoding mobile: ${mobileOut}...`);
  execSync(`ffmpeg.exe -v error -y -i "${rawPath}" -an -vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${mobileOut}"`);

  console.log(`Completed ${jobName}!`);
}

async function main() {
  console.log('Uploading clean Scene 1 (no front meter) to SFS...');
  const newScene01Url = await uploadFile(scene01File, 'scenes/scene_01_clean.jpg');
  console.log(`New Scene 1 URL: ${newScene01Url}`);

  sceneUrls.scene_01 = newScene01Url;
  fs.writeFileSync('scripts/scene-urls.json', JSON.stringify(sceneUrls, null, 2));

  // 1. Generate 01-sun-dive
  await runSeedance({
    content: [
      { type: 'image_url', image_url: { url: newScene01Url }, role: 'first_frame' },
      { type: 'text', text: 'Gentle slow forward cinematic drone camera push toward stunning luxury modern Texas home under blazing high-noon summer sun, completely pristine architectural facade, warm sun flare, cinematic.' }
    ],
    resolution: '480p',
    duration: 5,
    ratio: '16:9',
    generate_audio: false
  }, '01-sun-dive');

  // 2. Generate c01-sun-roof
  await runSeedance({
    content: [
      { type: 'image_url', image_url: { url: newScene01Url }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: sceneUrls.scene_02 }, role: 'last_frame' },
      { type: 'text', text: 'Smooth continuous cinematic camera flight rising from suburban front lawn up to all-black rooftop solar panels with sleek front skirt trim.' }
    ],
    resolution: '480p',
    duration: 4,
    ratio: '16:9',
    generate_audio: false
  }, 'c01-sun-roof');

  console.log('\nSuccessfully regenerated 01-sun-dive and c01-sun-roof with no front meter!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
