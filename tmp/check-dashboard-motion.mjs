import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({executablePath:'C:/Users/roryulloa/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try {
const page=await browser.newPage();
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname!=='dashboard.test')return route.abort();
 const f=path.join(process.cwd(),'dist',u.pathname==='/dashboard'?'index.html':u.pathname);
 if(!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404});
 await route.fulfill({path:f});
});
await page.goto('http://dashboard.test/dashboard?demo=true');
await page.locator('.customer-heading canvas').waitFor();
for(const width of [1440,390]){
 await page.setViewportSize({width,height:850});
 await page.waitForFunction(()=>document.querySelector('canvas.customer-heading-motion')?.getContext('2d').getImageData(300,170,1,1).data[3]===255);
 const first=await page.locator('.customer-heading canvas').evaluate(c=>c.toDataURL());
 await page.evaluate(()=>window.scrollTo(0,120));
 await page.waitForFunction(f=>document.querySelector('.customer-heading canvas').toDataURL()!==f,first);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow at '+width);
 await page.evaluate(()=>window.scrollTo(0,0));
 console.log('Passed scroll animation and layout at '+width);
}
await page.emulateMedia({reducedMotion:'reduce'});
if(await page.locator('.customer-heading canvas').isVisible())throw Error('Reduced motion');
console.log('Passed reduced motion');
await page.setViewportSize({width:1440,height:900});
await page.evaluate(()=>window.scrollTo(0,0));
await page.screenshot({path:'tmp/power-genie-dashboard-preview.png'});
const firstCustomer = page.locator('[data-lead-id] button[aria-expanded]').first();
await firstCustomer.focus();
await page.keyboard.press('Enter');
if(await firstCustomer.getAttribute('aria-expanded')!=='true')throw Error('Customer details did not open');
await page.keyboard.press('Enter');
const nav=page.getByRole('navigation',{name:'Dashboard sections'});
for(const label of ['Conference room','Chat','Appointments','Files','Customers']){
 const button=nav.getByRole('button',{name:new RegExp(label)});
 await button.focus(); await page.keyboard.press('Enter');
 await page.waitForFunction(label=>document.querySelector('nav[aria-label="Dashboard sections"] [aria-current="page"]')?.textContent.includes(label),label);
}
console.log('Passed keyboard customer expansion and all five main navigation controls');

}finally{await browser.close()}
