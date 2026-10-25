import urllib.request
import re

build_id = "zCtt6ab6_2C4_gwALn6GS"
# Try hyphen vs underscore
for bid in ["zCtt6ab6_2C4_gwALn6GS", "zCtt6ab6_2C4-gwALn6GS"]:
    for path in [f"/_next/static/{bid}/_buildManifest.js", f"/_next/static/{bid}/_ssgManifest.js"]:
        url = f"https://power-genie-hub.vercel.app{path}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
                print(f"=== {url} ===")
                print(content[:500])
        except Exception as e:
            print(f"Failed {url}: {e}")
