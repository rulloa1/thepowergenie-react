import {chromium} from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Users/roryulloa/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try {
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='preview.test')return r.abort();const f=path.join('dist',u.pathname==='/dashboard'?'index.html':u.pathname);if(!fs.existsSync(f))return r.fulfill({status:404});return r.fulfill({path:f});});
await page.goto('http://preview.test/dashboard?demo=true');
const intake=page.getByRole('region',{name:'Intake desk'});
await intake.getByText('Create a rep booking link').click();
await intake.getByLabel('Rep name or code').fill('Test Rep');
await intake.getByLabel('State code').fill('TX');
if(!(await intake.getByLabel('Referral booking link').inputValue()).includes('ref=Test+Rep&state=TX'))throw Error('Wrong link');
await intake.getByRole('button',{name:/Complete intake/}).click();
await intake.getByRole('button',{name:/Needs follow-up/}).click();
await intake.getByRole('combobox',{name:/Referral state/}).waitFor();
console.log('PASS mobile owner intake, filters and attributed link');
}finally{await browser.close()}

