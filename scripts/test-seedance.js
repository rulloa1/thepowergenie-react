import { execSync } from 'child_process';
import fs from 'fs';

const sceneUrls = JSON.parse(fs.readFileSync('scripts/scene-urls.json', 'utf8'));

const payload = {
  content: [
    {
      type: 'image_url',
      image_url: { url: sceneUrls.scene_03 },
      role: 'first_frame'
    },
    {
      type: 'text',
      text: 'Slow cinematic push-in toward dual Tesla Powerwall units with subtle glowing solar energy conduits, gentle sunlight ambience, ultra-smooth architectural video.'
    }
  ],
  resolution: '480p',
  duration: 5,
  ratio: '16:9',
  generate_audio: false
};

console.log('Sending run to bytedance /v1/video/seedance-2.0-fast...');
try {
  const cmd = `monid run -p bytedance -e /v1/video/seedance-2.0-fast -i ${JSON.stringify(JSON.stringify(payload))}`;
  const out = execSync(cmd, { stdio: 'pipe', timeout: 300000 }).toString();
  console.log('Result:');
  console.log(out);
  fs.writeFileSync('scripts/seedance-test-output.txt', out);
} catch (err) {
  console.error('Error running seedance:');
  if (err.stdout) console.log('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
}
