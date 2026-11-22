const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const { randomUUID } = require('node:crypto');
const keyFile = path.join(process.env.LOCALAPPDATA || require('node:os').homedir(), 'CocinaVoice', 'voice-key.dpapi');
async function transformKey(value, decrypt) {
  const init = "[void][Reflection.Assembly]::LoadWithPartialName('System.Security');$value=[Console]::In.ReadToEnd();";
  const command = init + (decrypt
    ? '[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($value),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
    : '[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($value),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command', "$ErrorActionPreference='Stop';"+command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    let result='';
    child.stdout.on('data',chunk=>{result+=chunk;});
    child.on('error',reject);child.stdin.on('error',reject);
    child.on('close',code=>code===0 && result ? resolve(result) : reject(Error('Windows key protection unavailable')));
    child.stdin.end(value);
  });
}
const host = '127.0.0.1';
const server = http.createServer(async (req, res) => {
  const origin = 'http://' + host + ':' + server.address().port;
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== new URL(origin).host) return res.writeHead(403).end();
  if (req.method === 'GET' && req.url === '/') return res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(page);
  if (req.method !== 'POST' || !['/speak','/key/load','/key/save'].includes(req.url) || req.headers.origin !== origin) return res.writeHead(403).end();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  res.on('close', () => controller.abort());
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk.toString('latin1');
      if (raw.length > 12000) return res.writeHead(413).end('Please use a shorter phrase.');
    }
    const {text, key} = JSON.parse(Buffer.from(raw,'latin1').toString('utf8'));
    if (req.url.startsWith('/key/')) {
      try {
        if(req.url==='/key/load'){
          let encrypted;
          try { encrypted=await fs.promises.readFile(keyFile,'utf8'); }
          catch(error){if(error.code!=='ENOENT')throw error;}
          const value=encrypted ? await transformKey(encrypted,true) : '';
          return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({key:value}));
        }
        if(typeof key!=='string'||!key.trim()||key.length>512)return res.writeHead(400).end();
        const encrypted=await transformKey(key.trim(),false);
        await fs.promises.mkdir(path.dirname(keyFile),{recursive:true});
        const temp=keyFile+'.'+randomUUID();
        try{await fs.promises.writeFile(temp,encrypted,{flag:'wx'});await fs.promises.rename(temp,keyFile);}
        finally{await fs.promises.rm(temp,{force:true});}
        return res.writeHead(204).end();
      } catch {return res.writeHead(500).end('Windows could not access the saved key.');}
    }
    if (typeof key !== 'string' || !key.trim() || typeof text !== 'string' || !text.trim() || text.length > 2000)
      return res.writeHead(400).end('Enter a key and use a shorter phrase.');
    const upstream = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-estrella-es&encoding=linear16&sample_rate=24000&container=none', {
      method:'POST', headers:{Authorization:'Token ' + key.trim(), 'Content-Type':'application/json'},
      body:JSON.stringify({text}), signal:controller.signal
    });
    if (!upstream.ok) return res.writeHead(upstream.status).end('Deepgram returned ' + upstream.status + '. Check your API key, credits, or connection.');
    res.writeHead(200, {'Content-Type':'application/octet-stream'});
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent) res.writeHead(502).end('Could not reach the voice service. Check your connection and try again.');
    else res.destroy();
  } finally { clearTimeout(timeout); }
});
server.on('error', e => {console.error(e.message);process.exitCode=1;});
server.listen(0, host, () => {
  const url = 'http://' + host + ':' + server.address().port;
  console.log('Cocina Voice is open at ' + url + '\nUse desktop Google Chrome. Close this window to quit.');
  if (process.platform !== 'win32' || process.argv.includes('--no-open')) return;
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const chrome = roots.map(root => path.join(root,'Google','Chrome','Application','chrome.exe')).find(p => fs.existsSync(p));
  if (chrome) spawn(chrome,['--app='+url],{detached:true,stdio:'ignore'}).unref();
});

