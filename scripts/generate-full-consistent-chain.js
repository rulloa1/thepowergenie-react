import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const sceneUrls = JSON.parse(fs.readFileSync('scripts/scene-urls.json', 'utf8'));

const jobs = [
  // 6 Dives
  {
    name: '01-sun-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_01 }, role: 'first_frame' },
        { type: 'text', text: 'Slow, smooth cinematic camera push-in toward modern Texas home 5309 in blazing Texas sunshine, immaculate Austin limestone and dark wood facade, clear lawn, bright sun flare, pristine architectural glide.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: '02-roof-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_02 }, role: 'first_frame' },
        { type: 'text', text: 'Smooth cinematic glide across sleek all-black rooftop solar panels on house 5309 with custom front skirt trim concealing mounting brackets, brilliant sunlight glinting across the glass showing the subtle Sunrun mark.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: '03-battery-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_03 }, role: 'first_frame' },
        { type: 'text', text: 'Smooth steady push-in along the limestone side wall of house 5309 toward dual ground-mounted white Tesla Powerwalls with clean metallic conduit in the afternoon Texas sun.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: '04-home-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_04 }, role: 'first_frame' },
        { type: 'text', text: 'Cinematic night push-in toward house 5309, warm interior lighting powered by battery backup, Level 2 EV charging station charging car in the driveway, peaceful residential Texas night.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: '05-community-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_05 }, role: 'first_frame' },
        { type: 'text', text: 'Slow macro cinematic push-in over leather wallet with cash and smartphone displaying Gas-Genie rewards and green credit deposits, through window of house 5309.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: '06-cta-dive',
    type: 'dive',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_06 }, role: 'first_frame' },
        { type: 'text', text: 'Slow, majestic cinematic drone flight toward the complete Texas solar sanctuary of house 5309 at twilight, illuminated pool, glowing interior lights and EV.' }
      ],
      resolution: '480p',
      duration: 5,
      ratio: '16:9',
      generate_audio: false
    }
  },
  // 5 Connectors
  {
    name: 'c01-sun-roof',
    type: 'connector',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_01 }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: sceneUrls.scene_02 }, role: 'last_frame' },
        { type: 'text', text: 'Smooth continuous camera flight rising from the front yard of house 5309 up to the standing seam roof with all-black solar panels and sleek front skirt trim.' }
      ],
      resolution: '480p',
      duration: 4,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: 'c02-roof-battery',
    type: 'connector',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_02 }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: sceneUrls.scene_03 }, role: 'last_frame' },
        { type: 'text', text: 'Smooth continuous camera motion descending from the solar roof of house 5309 down to the limestone utility side wall showing dual ground-mounted Tesla Powerwalls.' }
      ],
      resolution: '480p',
      duration: 4,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: 'c03-battery-home',
    type: 'connector',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_03 }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: sceneUrls.scene_04 }, role: 'last_frame' },
        { type: 'text', text: 'Smooth continuous transition from daytime Tesla Powerwall solar storage on house 5309 into night, showing whole-home backup illumination and Level 2 EV charging in driveway.' }
      ],
      resolution: '480p',
      duration: 4,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: 'c04-home-community',
    type: 'connector',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_04 }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: sceneUrls.scene_05 }, role: 'last_frame' },
        { type: 'text', text: 'Smooth cinematic camera glide transitioning from nighttime exterior of house 5309 through the window to the customer leather wallet and phone showing Gas-Genie fuel credits.' }
      ],
      resolution: '480p',
      duration: 4,
      ratio: '16:9',
      generate_audio: false
    }
  },
  {
    name: 'c05-community-cta',
    type: 'connector',
    payload: {
      content: [
        { type: 'image_url', image_url: { url: sceneUrls.scene_05 }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: sceneUrls.scene_06 }, role: 'last_frame' },
        { type: 'text', text: 'Smooth cinematic camera pullback through window rising high into the Texas twilight sky to reveal the entire energy sanctuary of house 5309.' }
      ],
      resolution: '480p',
      duration: 4,
      ratio: '16:9',
      generate_audio: false
    }
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runJob(job) {
  console.log(`\n========================================`);
  console.log(`Starting job: ${job.name} (${job.type})`);
  console.log(`========================================`);

  const cmd = `monid run -p bytedance -e /v1/video/seedance-2.0-fast -i ${JSON.stringify(JSON.stringify(job.payload))}`;
  const out = execSync(cmd).toString();
  const runIdMatch = out.match(/Run ID:\s*([A-Za-z0-9_]+)/);
  if (!runIdMatch) {
    throw new Error(`Failed to get runId from: ${out}`);
  }
  const runId = runIdMatch[1];
  console.log(`Launched run: ${runId}. Polling...`);

  let attempts = 0;
  let videoUrl = null;
  while (attempts < 60) {
    await sleep(6000);
    attempts++;
    try {
      const statusRaw = execSync(`monid runs get -r ${runId} -j`).toString();
      const statusData = JSON.parse(statusRaw);
      console.log(`[${job.name} - attempt ${attempts}] Status: ${statusData.status}`);
      if (statusData.status === 'COMPLETED') {
        videoUrl = statusData.output?.content?.video_url;
        console.log(`Video URL: ${videoUrl}`);
        break;
      }
      if (['FAILED', 'BLOCKED', 'STOPPED', 'TIME_OUT'].includes(statusData.status)) {
        throw new Error(`Run ${runId} failed with status ${statusData.status}`);
      }
    } catch (e) {
      if (e.message.includes('failed with status')) throw e;
      console.log(`Polling error (will retry): ${e.message}`);
    }
  }

  if (!videoUrl) {
    throw new Error(`Timed out waiting for ${job.name} (${runId})`);
  }

  const rawPath = `scripts/raw-${job.name}.mp4`;
  console.log(`Downloading ${job.name} to ${rawPath}...`);
  execSync(`curl.exe -fsSL "${videoUrl}" -o "${rawPath}"`);

  // Transcode desktop: 720p height, faststart, keyint 4 for smooth scrub
  const desktopOut = `public/assets/vid/encoded/${job.name}.mp4`;
  console.log(`Transcoding desktop: ${desktopOut}...`);
  execSync(`ffmpeg.exe -v error -y -i "${rawPath}" -an -vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${desktopOut}"`);

  // Transcode mobile: 720p height, faststart, keyint 4 for smooth scrub
  const mobileOut = `public/assets/vid/mobile/${job.name}.mp4`;
  console.log(`Transcoding mobile: ${mobileOut}...`);
  execSync(`ffmpeg.exe -v error -y -i "${rawPath}" -an -vf "scale=-2:720,unsharp=5:5:0.6:5:5:0.0" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "${mobileOut}"`);

  console.log(`Completed ${job.name} successfully!`);
}

async function main() {
  for (const job of jobs) {
    await runJob(job);
  }
  console.log('\nAll 11 video clips generated and transcoded for House 5309!');
}

main().catch(err => {
  console.error('Fatal error in video pipeline:', err);
  process.exit(1);
});
