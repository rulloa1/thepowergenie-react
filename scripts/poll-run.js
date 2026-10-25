import { execSync } from 'child_process';
import fs from 'fs';

const runId = process.argv[2] || '01M5SQJC1AVRAPWMMQ2S6NKY7M';
console.log(`Polling run: ${runId}`);

let attempts = 0;
while (attempts < 60) {
  try {
    const raw = execSync(`monid runs get -r ${runId} -j`).toString();
    const data = JSON.parse(raw);
    console.log(`[Attempt ${attempts + 1}] Status: ${data.status}`);
    if (data.status === 'COMPLETED') {
      console.log('Run COMPLETED! Output:');
      console.log(JSON.stringify(data.output, null, 2));
      fs.writeFileSync(`scripts/run-${runId}.json`, JSON.stringify(data, null, 2));
      process.exit(0);
    }
    if (['FAILED', 'BLOCKED', 'STOPPED', 'TIME_OUT'].includes(data.status)) {
      console.error('Run ended with failure status:', data.status);
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (e) {
    console.error('Error polling:', e.message);
  }
  attempts++;
  execSync('node -e "setTimeout(()=>{}, 6000)"');
}
console.error('Timed out polling run:', runId);
process.exit(1);
