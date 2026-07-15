import hashlib
import re
from pathlib import Path


root = Path(__file__).resolve().parent.parent
master_path = root / "docs" / "design" / "assets" / "media-dock-qidu-berth.svg"
master = master_path.read_text(encoding="utf-8")
digest = hashlib.sha256(master.encode("utf-8")).hexdigest()

(root / "public" / "favicon.svg").write_text(master, encoding="utf-8")

artwork = re.sub(r"\A<svg[^>]*>", "", master, count=1).strip()
artwork = re.sub(r"</svg>\s*\Z", "", artwork, count=1).strip()
artwork = re.sub(r"<title>.*?</title>\s*", "", artwork, count=1, flags=re.DOTALL)

hero = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="400" viewBox="0 0 1400 400" data-master-sha256="{digest}">
  <rect width="1400" height="400" fill="#F6F3ED"/>
  <path d="M0 0h1400v400H0z" fill="url(#wash)"/>
  <g transform="translate(92 44) scale(.305)">
{artwork}
  </g>
  <text x="430" y="152" fill="#242A31" font-family="SF Pro Display, Segoe UI, sans-serif" font-size="82" font-weight="650" letter-spacing="-2">Media Dock · 泊</text>
  <text x="434" y="218" fill="#616A73" font-family="SF Pro Text, Segoe UI, sans-serif" font-size="30">泊其所获，交其所成。</text>
  <text x="434" y="270" fill="#616A73" font-family="SF Pro Text, Segoe UI, sans-serif" font-size="24">Dock what is gathered, deliver what is made.</text>
  <text x="434" y="326" fill="#2B98A6" font-family="SF Pro Text, Segoe UI, sans-serif" font-size="18" font-weight="700" letter-spacing="5">A QIDU UTILITY</text>
  <defs><linearGradient id="wash" x1="0" y1="0" x2="1400" y2="400"><stop stop-color="#FFFFFF" stop-opacity=".68"/><stop offset=".7" stop-color="#9F8BD0" stop-opacity=".035"/><stop offset="1" stop-color="#78CDDB" stop-opacity=".07"/></linearGradient></defs>
</svg>
'''
(root / "build" / "readme-hero.svg").write_text(hero, encoding="utf-8")
