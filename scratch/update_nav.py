import os

scroll_world_path = os.path.join('src', 'components', 'ScrollWorld.tsx')
with open(scroll_world_path, 'r', encoding='utf-8') as f:
    text = f.read()

text_norm = text.replace('\r\n', '\n')

old_desktop = """                <a
                  href="/brands"
                  onClick={(event) => followBrands(event, onNavigateBrands)}
                  className={navLinkClass}
                >
                  Our brands
                </a>
                <a
                  href="/homeowner"
                  className="sw-nav__item whitespace-nowrap font-inherit text-[0.82rem] no-underline px-3.5 py-1.5 rounded-full transition-colors duration-200 text-[#FF6B00] font-bold hover:bg-[#FF6B00]/10"
                >
                  🔋 Homeowner Portal
                </a>"""

new_desktop = """                <a
                  href="/brands"
                  onClick={(event) => followBrands(event, onNavigateBrands)}
                  className={navLinkClass}
                >
                  Our brands
                </a>
                <a
                  href="/dashboard"
                  className="sw-nav__item whitespace-nowrap font-inherit text-[0.82rem] no-underline px-3.5 py-1.5 rounded-full transition-colors duration-200 text-[#0066CC] font-bold hover:bg-[#0066CC]/10"
                >
                  📊 Referral Hub
                </a>
                <a
                  href="/homeowner"
                  className="sw-nav__item whitespace-nowrap font-inherit text-[0.82rem] no-underline px-3.5 py-1.5 rounded-full transition-colors duration-200 text-[#FF6B00] font-bold hover:bg-[#FF6B00]/10"
                >
                  🔋 Homeowner Portal
                </a>"""

old_mobile = """                  <a
                    href="/homeowner"
                    className="block w-full text-left px-5 py-3 text-[0.9rem] font-bold text-[#FF6B00] active:bg-orange-50 no-underline"
                  >
                    🔋 Homeowner & Referrals
                  </a>"""

new_mobile = """                  <a
                    href="/dashboard"
                    className="block w-full text-left px-5 py-3 text-[0.9rem] font-bold text-[#0066CC] active:bg-blue-50 no-underline"
                  >
                    📊 Referral Hub Dashboard
                  </a>
                  <a
                    href="/homeowner"
                    className="block w-full text-left px-5 py-3 text-[0.9rem] font-bold text-[#FF6B00] active:bg-orange-50 no-underline"
                  >
                    🔋 Homeowner & Referrals
                  </a>"""

assert old_desktop in text_norm, 'old_desktop not found'
text_norm = text_norm.replace(old_desktop, new_desktop, 1)

assert old_mobile in text_norm, 'old_mobile not found'
text_norm = text_norm.replace(old_mobile, new_mobile, 1)

with open(scroll_world_path, 'w', encoding='utf-8') as f:
    f.write(text_norm)

print('ScrollWorld.tsx successfully updated!')
