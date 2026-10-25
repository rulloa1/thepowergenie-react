import os

app_path = os.path.join('src', 'App.tsx')
with open(app_path, 'r', encoding='utf-8') as f:
    text = f.read()

text_norm = text.replace('\r\n', '\n')

old_links = """        <p className="mt-8 max-w-[1280px] text-[0.98rem] leading-relaxed text-[#4A5568] flex flex-wrap gap-4 items-center">
          <a href="/book" className="font-semibold text-[#0066CC] no-underline hover:underline focus-visible:underline">Book a one-hour call on Horace’s calendar</a>
          <span className="text-gray-300">·</span>
          <a href="/homeowner" className="inline-flex items-center gap-1.5 font-bold text-[#FF6B00] no-underline hover:underline focus-visible:underline">
            🔋 Homeowner App: Tesla Powerwall Monitor & $1,000 Referral Program →
          </a>
        </p>"""

new_links = """        <p className="mt-8 max-w-[1280px] text-[0.98rem] leading-relaxed text-[#4A5568] flex flex-wrap gap-4 items-center">
          <a href="/book" className="font-semibold text-[#0066CC] no-underline hover:underline focus-visible:underline">Book a one-hour call on Horace’s calendar</a>
          <span className="text-gray-300">·</span>
          <a href="/dashboard" className="inline-flex items-center gap-1.5 font-bold text-[#0066CC] no-underline hover:underline focus-visible:underline">
            📊 Referral Hub: Rep & Partner Dashboard →
          </a>
          <span className="text-gray-300">·</span>
          <a href="/homeowner" className="inline-flex items-center gap-1.5 font-bold text-[#FF6B00] no-underline hover:underline focus-visible:underline">
            🔋 Homeowner App: Tesla Powerwall Monitor & $1,000 Referral Program →
          </a>
        </p>"""

assert old_links in text_norm, 'old_links not found in App.tsx'
text_norm = text_norm.replace(old_links, new_links, 1)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(text_norm)

print('App.tsx successfully updated!')
