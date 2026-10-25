import { execSync } from 'child_process';
import fs from 'fs';

const refUrl = "https://sfs.monid.ai/nePcnaZA8FXyvvYc-APn1QwNAFEN6S_-mDerozQ1xFMBEVP5avO7LL8OTkz-wZXBenub6QE9Npw2JudBzRXKPN6HWdk8q2oZxvNIP6A3RLH4loNhfFkdBg3zlk48h6cDtmtI1-sQyEXZDVMcWYxoQms60Ed0how-Ofnl68YqlnfZG9dNoYUMplm3SyJnex17Oc9lM9vrTpg?e=1793546751";

const payload = {
  prompt: "Nighttime architectural photography of the exact same modern Texas home from the input image. It is deep twilight. The house is warmly illuminated from within through the large glass windows, powered by stored battery energy. The front facade is completely clean with NO meters, NO batteries, and NO glowing cyan lines on the exterior walls. In the driveway next to the garage, an authentic Level 2 wall-mounted EV car charger is mounted at waist height, charging a sleek electric vehicle parked in the driveway. Photorealistic luxury residential photography, deep navy night sky, warm interior lighting.",
  images: [refUrl],
  size: "2K",
  n: 1
};

console.log("Calling alibaba /v1/image/wan2.7-image...");
try {
  const cmd = `monid run -p alibaba -e /v1/image/wan2.7-image -i ${JSON.stringify(JSON.stringify(payload))}`;
  const out = execSync(cmd, { timeout: 120000 }).toString();
  console.log("Result:\n", out);
  fs.writeFileSync('scripts/wan-test-output.txt', out);
} catch (err) {
  console.error("Error:");
  if (err.stdout) console.log("STDOUT:", err.stdout.toString());
  if (err.stderr) console.error("STDERR:", err.stderr.toString());
}
