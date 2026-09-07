#!/usr/bin/env python3
"""Build dist/index.html (GitHub Pages reader) + favicon/manifest.

Theme packs are visuals only (no translated copy):
  theme.css, theme.json
  assets/emblem.(png|svg), assets/mark-legend.(png|svg)
  marks/{male,female,unknown,root}-{master,small}.(png|svg)
  All UI text lives in locales/*.json — adding a language never touches themes.
"""

from __future__ import annotations

import base64
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLES = ("male", "female", "unknown", "root")
SIZES = ("master", "small")


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_url(path: Path) -> str:
    suf = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
    }.get(suf, "application/octet-stream")
    return f"data:{mime};base64,{b64(path)}"


def find_asset(folder: Path, stem: str) -> Path | None:
    for ext in (".png", ".svg", ".jpg", ".jpeg", ".webp"):
        p = folder / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def load_marks(theme_dir: Path) -> dict[str, str]:
    marks_dir = theme_dir / "marks"
    out: dict[str, str] = {}
    for role in ROLES:
        for size in SIZES:
            key = role if size == "master" else f"{role}Small"
            path = find_asset(marks_dir, f"{role}-{size}")
            if path:
                out[key] = data_url(path)
    return out



def main():
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    locale = config.get("locale") or "fa"
    theme = config.get("theme") or "default"
    theme_dir = ROOT / "themes" / theme
    if not theme_dir.is_dir():
        raise SystemExit(f"missing theme pack: {theme_dir}")

    i18n = json.loads((ROOT / "locales" / f"{locale}.json").read_text(encoding="utf-8"))
    theme_meta = {}
    meta_path = theme_dir / "theme.json"
    if meta_path.exists():
        theme_meta = json.loads(meta_path.read_text(encoding="utf-8"))

    archive = json.loads((ROOT / "data" / "people.json").read_text(encoding="utf-8"))
    css = (ROOT / "engine" / "styles.css").read_text(encoding="utf-8")
    css += "\n" + (theme_dir / "theme.css").read_text(encoding="utf-8")
    kinship = (ROOT / "engine" / "kinship.js").read_text(encoding="utf-8")
    app = (ROOT / "engine" / "app.js").read_text(encoding="utf-8")

    marks = load_marks(theme_dir)
    emblem_path = find_asset(theme_dir / "assets", "emblem")
    legend_path = find_asset(theme_dir / "assets", "mark-legend")
    if not emblem_path or not legend_path:
        raise SystemExit(f"theme {theme} needs assets/emblem and assets/mark-legend")
    emblem = data_url(emblem_path)
    legend = data_url(legend_path)

    shield_path = (ROOT / "assets" / "shield-path.txt").read_text(encoding="utf-8").strip()
    shield_clip = (ROOT / "assets" / "shield-clip.txt").read_text(encoding="utf-8").strip()

    photos: dict[str, str] = {}
    photos_dir = ROOT / "data" / "photos"
    # Trust files on disk — keeps UI in sync after fetch/sample photos
    if photos_dir.exists():
        for r in archive["people"]:
            r["photo"] = (photos_dir / f"{r['id']}.jpg").exists()
            if r["photo"]:
                # Pages build links to photos/; offline embed path unused now
                pass
    else:
        for r in archive["people"]:
            r["photo"] = False

    docs_dir = ROOT / "data" / "docs"
    docs_base = "docs/" if docs_dir.exists() and any(docs_dir.iterdir()) else None

    def font_face(family, weight, file):
        return (
            f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
            f"font-display:swap;src:url(data:font/woff2;base64,{b64(ROOT / 'assets' / 'fonts' / file)}) format('woff2')}}"
        )

    fonts = "\n".join(
        [
            font_face("Vazirmatn", "300 800", "vaz.woff2"),
            font_face("Noto Naskh Arabic", "400 700", "naskh.woff2"),
        ]
    )

    bundle = re.sub(r"^export ", "", kinship, count=1, flags=re.M)
    bundle = bundle.replace("export function", "function")
    app2 = re.sub(r"^import[^\n]*\n", "", app, count=1, flags=re.M)
    app2 = app2.replace("export function", "function")
    bundle = bundle + "\n" + app2

    title = config.get("familyName") or i18n.get("title") or "Family tree"
    short = config.get("familyNameShort") or i18n.get("appTitleShort") or title
    footer = (i18n.get("footer") or title) + (
        f" — {config['subtitle']}" if config.get("subtitle") else ""
    )
    paper = "#F7F3EA"
    # try to read --paper from theme.css
    m = re.search(r"--paper:\s*([^;]+);", (theme_dir / "theme.css").read_text(encoding="utf-8"))
    if m:
        paper = m.group(1).strip()

    def build_html(embed_photos: bool) -> str:
        photo_payload = photos if embed_photos else {}
        photo_base = None if embed_photos else "photos/"
        return f"""<!DOCTYPE html>
<html lang="{i18n.get('lang', locale)}" dir="{i18n.get('dir', 'rtl')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>{title}</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{short}">
<meta name="theme-color" content="{paper}">
<link rel="icon" href="favicon.png">
<link rel="apple-touch-icon" href="favicon.png">
<link rel="manifest" href="manifest.webmanifest">
<style>{fonts}</style>
<style>{css}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<clipPath id="shieldClip" clipPathUnits="objectBoundingBox">
<path d="{shield_clip}"/>
</clipPath></defs></svg>

<header class="top"><div class="in">
  <img class="emb" src="{emblem}" alt="{i18n.get('emblemAlt', '')}">
  <button class="who" id="whoBtn"><small>{i18n.get('you', 'You')}</small><b id="whoName">{i18n.get('youUnset', '')}</b></button>
  <button class="tb" id="findBtn">{i18n.get('find', 'Find')}</button>
</div></header>

<div class="phead" id="phead"></div>
<main class="app" id="app"></main>
<div class="pfoot" id="pfoot" style="display:none">{footer}</div>

<div class="finder" id="finder"><div class="fin">
  <div class="fhead">
    <div class="r1">
      <input class="fq" id="fq" type="search" placeholder="{i18n.get('findPlaceholder', '')}">
      <button class="fclose" id="fclose" aria-label="{i18n.get('close', 'Close')}">×</button>
    </div>
    <div class="ftrail" id="ftrail"></div>
  </div>
  <div id="fbody"></div>
</div></div>

<script>
{bundle}
start({json.dumps(archive, ensure_ascii=False)}, {{
  shieldPath: {json.dumps(shield_path)},
  marks: {json.dumps(marks)},
  emblem: {json.dumps(emblem)},
  legend: {json.dumps(legend)},
  photos: {json.dumps(photo_payload)},
  photoBase: {json.dumps(photo_base)},
  docsBase: {json.dumps(docs_base)},
  i18n: {json.dumps(i18n, ensure_ascii=False)},
  config: {json.dumps(config, ensure_ascii=False)},
  theme: {json.dumps(theme_meta, ensure_ascii=False)}
}});
</script>
</body></html>"""

    dist = ROOT / "dist"
    dist.mkdir(parents=True, exist_ok=True)
    dist_photos = dist / "photos"
    if dist_photos.exists():
        shutil.rmtree(dist_photos)
    dist_photos.mkdir()

    pages = build_html(False)
    (dist / "index.html").write_text(pages, encoding="utf-8")
    # drop legacy offline twin if present
    legacy = dist / "family-tree-reader.html"
    if legacy.exists():
        legacy.unlink()

    if photos_dir.exists():
        for f in photos_dir.iterdir():
            if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                shutil.copy2(f, dist_photos / f.name)

    dist_docs = dist / "docs"
    if dist_docs.exists():
        shutil.rmtree(dist_docs)
    if docs_base and docs_dir.exists():
        dist_docs.mkdir()
        for f in docs_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, dist_docs / f.name)

    manifest = {
        "name": title,
        "short_name": short,
        "start_url": "./",
        "display": "standalone",
        "background_color": paper,
        "theme_color": paper,
        "lang": i18n.get("lang", locale),
        "dir": i18n.get("dir", "rtl"),
        "icons": [
            {
                "src": "favicon.png",
                "sizes": "any",
                "type": "image/png",
                "purpose": "any",
            }
        ],
    }
    (dist / "manifest.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Site icon = theme emblem (clear old names)
    for stale in ("icon-192.png", "icon.svg", "favicon.png", "favicon.svg"):
        p = dist / stale
        if p.exists():
            p.unlink()
    if emblem_path.suffix.lower() == ".png":
        shutil.copy2(emblem_path, dist / "favicon.png")
    else:
        # Prefer a png favicon when possible; svg themes still get favicon.svg + rewrite link
        shutil.copy2(emblem_path, dist / "favicon.svg")
        # HTML/manifest above assume favicon.png — rewrite for svg themes
        pages = pages.replace('href="favicon.png"', 'href="favicon.svg"')
        (dist / "index.html").write_text(pages, encoding="utf-8")
        manifest["icons"] = [
            {
                "src": "favicon.svg",
                "sizes": "any",
                "type": "image/svg+xml",
                "purpose": "any",
            }
        ]
        (dist / "manifest.webmanifest").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    print(
        f"built {len(pages)//1024}KB pages | "
        f"{len(archive['people'])} people | locale {locale} | theme {theme} | marks {sorted(marks)}"
    )


if __name__ == "__main__":
    main()
