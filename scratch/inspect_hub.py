import urllib.request
import re

url = "https://power-genie-hub.vercel.app/_next/static/chunks/webpack-869b3914144ed837.js"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    code = resp.read().decode('utf-8', errors='ignore')

# Next.js webpack defines chunk ids and hashes: e.g. e.u = function(e) { return "static/chunks/" + ... }
print("Webpack snippet:")
matches = re.findall(r'(\d+:\s*"[a-f0-9]+")', code)
print(f"Found {len(matches)} chunk mappings")
print(matches[:20])

# Find all chunk names referenced
names = re.findall(r'"([a-zA-Z0-9_\-\./]+)"', code)
static_chunks = [n for n in names if 'static/' in n or 'chunks/' in n]
print("Static chunk references:", set(static_chunks))
