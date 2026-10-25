import os

# 1. Update BrandPage.tsx
brand_path = os.path.join('src', 'components', 'BrandPage.tsx')
with open(brand_path, 'r', encoding='utf-8') as f:
    brand_text = f.read().replace('\r\n', '\n')

old_brand_nav = """        <a
          href="/brands"
          aria-current={brandsCurrent ? 'page' : undefined}
          onClick={(event) => {
            if (!shouldHandleClientNavigation(event)) return;
            event.preventDefault();
            onNavigate('brands');
          }}
          className="inline-flex items-center min-h-[44px] bg-transparent text-inherit no-underline cursor-pointer hover:text-[#f6cf85] transition-colors"
        >
          Our brands
        </a>
        <button onClick={() => onNavigate('journey')} className="md:flex hidden items-center min-h-[44px] bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-[#f6cf85] transition-colors">Explore solar ↗</button>"""

new_brand_nav = """        <a
          href="/brands"
          aria-current={brandsCurrent ? 'page' : undefined}
          onClick={(event) => {
            if (!shouldHandleClientNavigation(event)) return;
            event.preventDefault();
            onNavigate('brands');
          }}
          className="inline-flex items-center min-h-[44px] bg-transparent text-inherit no-underline cursor-pointer hover:text-[#f6cf85] transition-colors"
        >
          Our brands
        </a>
        <a
          href="/dashboard"
          className="inline-flex items-center min-h-[44px] bg-transparent text-[#95dbe9] no-underline cursor-pointer hover:text-white transition-colors font-medium"
        >
          📊 Referral Hub
        </a>
        <a
          href="/homeowner"
          className="inline-flex items-center min-h-[44px] bg-transparent text-[#f6cf85] no-underline cursor-pointer hover:text-white transition-colors font-medium"
        >
          🔋 Homeowner Portal
        </a>
        <button onClick={() => onNavigate('journey')} className="md:flex hidden items-center min-h-[44px] bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-[#f6cf85] transition-colors">Explore solar ↗</button>"""

assert old_brand_nav in brand_text, 'old_brand_nav not found'
brand_text = brand_text.replace(old_brand_nav, new_brand_nav, 1)

old_brand_footer = """function Footer({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <footer className="flex flex-wrap justify-between gap-6 mx-[7vw] py-8 border-t border-[#ffffff25] text-[13px] text-[#bacbd6]">
      <button onClick={() => onNavigate('journey')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">The Power Genie</button>
      <span>One connected energy journey.</span>
      <button onClick={() => onNavigate('brands')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">Explore all brands</button>
    </footer>
  );
}"""

new_brand_footer = """function Footer({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <footer className="flex flex-wrap justify-between items-center gap-6 mx-[7vw] py-8 border-t border-[#ffffff25] text-[13px] text-[#bacbd6]">
      <button onClick={() => onNavigate('journey')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">The Power Genie</button>
      <div className="flex items-center gap-4">
        <a href="/dashboard" className="text-inherit hover:text-white font-medium no-underline">📊 Referral Hub</a>
        <span className="opacity-40">·</span>
        <a href="/homeowner" className="text-[#f6cf85] hover:text-white font-medium no-underline">🔋 Homeowner Portal</a>
      </div>
      <button onClick={() => onNavigate('brands')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">Explore all brands</button>
    </footer>
  );
}"""

assert old_brand_footer in brand_text, 'old_brand_footer not found'
brand_text = brand_text.replace(old_brand_footer, new_brand_footer, 1)

with open(brand_path, 'w', encoding='utf-8') as f:
    f.write(brand_text)

print('BrandPage.tsx updated successfully!')

# 2. Update HomeownerPortalPage.tsx
portal_path = os.path.join('src', 'pages', 'HomeownerPortalPage.tsx')
with open(portal_path, 'r', encoding='utf-8') as f:
    portal_text = f.read().replace('\r\n', '\n')

old_portal_header = """          <div className="flex items-center gap-3">
            <a
              href="tel:+15102417007"
              className="inline-flex items-center gap-2 rounded-full border border-[#234567] bg-[#0E253B] px-3.5 py-1.5 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] transition shadow-sm"
            >
              <Phone className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span className="hidden md:inline">Advisor Horace Lawrence:</span> 510-241-7007
            </a>
          </div>"""

new_portal_header = """          <div className="flex items-center gap-2.5">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0066CC]/50 bg-[#0066CC]/20 px-3.5 py-1.5 text-xs font-bold text-[#64B5F6] hover:bg-[#0066CC]/30 transition shadow-sm no-underline"
              title="Open Sunrun Partner & Advisor Referral Hub"
            >
              📊 Rep Referral Hub
            </a>
            <a
              href="tel:+15102417007"
              className="inline-flex items-center gap-2 rounded-full border border-[#234567] bg-[#0E253B] px-3.5 py-1.5 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] transition shadow-sm"
            >
              <Phone className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span className="hidden md:inline">Advisor Horace Lawrence:</span> 510-241-7007
            </a>
          </div>"""

assert old_portal_header in portal_text, 'old_portal_header not found'
portal_text = portal_text.replace(old_portal_header, new_portal_header, 1)

with open(portal_path, 'w', encoding='utf-8') as f:
    f.write(portal_text)

print('HomeownerPortalPage.tsx updated successfully!')
