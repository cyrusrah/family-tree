#!/usr/bin/env python3
"""Build editor.html from shell + people.json, injecting locale + theme data."""

from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = ROOT / "data" / "people.json"
PHOTOS = ROOT / "data" / "photos"
OUT = ROOT / "dist" / "editor.html"
SHELL = ROOT / "tools" / "_editor_shell.html"
CONFIG = ROOT / "config.json"

# Top-level locale keys the editor may reuse when editor.* omits them
SHARED_KEYS = (
    "familyName",
    "mother",
    "spouse",
    "spouseOf",
    "children",
    "family",
    "job",
)


def generation(people: list) -> dict[str, int]:
    g: dict[str, int] = {}

    def walk(pid, n):
        if pid in g and g[pid] <= n:
            return
        g[pid] = n
        for q in people:
            if q.get("parent") == pid:
                walk(q["id"], n + 1)
            if q.get("spouseOf") == pid:
                walk(q["id"], n)

    walk("ROOT", 0)
    for p in people:
        if p["id"] not in g:
            g[p["id"]] = 0
    return g


def build_base(archive: dict) -> tuple[dict, dict]:
    people = archive["people"]
    gens = generation(people)
    kids: dict[str, list] = {}
    wives: dict[str, list] = {}
    for p in people:
        if p.get("parent"):
            kids.setdefault(p["parent"], []).append(p)
        if p.get("spouseOf"):
            wives.setdefault(p["spouseOf"], []).append(p)

    def spouse_sort(w):
        m = re.search(r"\+(\d+)$", w["id"])
        return int(m.group(1)) if m else 99

    def pack(p, *, sp=None, sp_of=None):
        pid = p["id"]
        note = p.get("note")
        rec = {
            "id": pid,
            "n": p.get("name") or "?",
            "en": "",
            "p": p.get("parent") if pid != "ROOT" else None,
            "g": gens.get(pid, 0),
            "mo": p.get("mother") or "",
            "sp": sp if sp is not None else [],
            "no": [note] if note else [],
            "xr": None,
            "add": p.get("origin") == "family",
            "c": [
                {"id": k["id"], "name": k["name"], "listed": None, "mismatch": False}
                for k in kids.get(pid, [])
            ],
            "fl": list(p.get("flags") or []),
        }
        if sp_of:
            rec["spOf"] = sp_of
        if p.get("family"):
            rec["fam"] = p["family"]
        if p.get("sex"):
            rec["sex"] = p["sex"]
        if p.get("birth"):
            rec["b"] = p["birth"]
        if p.get("death"):
            rec["d"] = p["death"]
        if p.get("place"):
            rec["pl"] = p["place"]
        if p.get("job"):
            rec["job"] = p["job"]
        return rec

    base = {}
    gen0 = {}
    for p in people:
        pid = p["id"]
        if p.get("spouseOf"):
            continue
        sp = [w["name"] for w in sorted(wives.get(pid, []), key=spouse_sort) if w.get("name")]
        base[pid] = pack(p, sp=sp)
        if p.get("sex"):
            gen0[pid] = {"g": p["sex"], "how": "name"}

    # Spouses are full records too (natal parents / own children allowed)
    for p in people:
        if not p.get("spouseOf"):
            continue
        base[p["id"]] = pack(p, sp_of=p["spouseOf"])
        if p.get("sex"):
            gen0[p["id"]] = {"g": p["sex"], "how": "name"}
    return base, gen0


def list_photo_ids() -> list[str]:
    if not PHOTOS.exists():
        return []
    ids = []
    for f in sorted(PHOTOS.iterdir()):
        if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            ids.append(f.stem)
    return ids


def find_asset(folder: Path, stem: str) -> Path | None:
    for ext in (".png", ".svg", ".jpg", ".jpeg", ".webp"):
        p = folder / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def data_url(path: Path) -> str:
    mime = {
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(path.suffix.lower(), "application/octet-stream")
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def flatten_i18n(i18n: dict) -> dict:
    """Merge shared site keys + editor block into one runtime dictionary."""
    out = {}
    for k in SHARED_KEYS:
        if k in i18n and i18n[k] not in (None, ""):
            out[k] = i18n[k]
    ed = i18n.get("editor") or {}
    out.update(ed)
    if "digits" in i18n:
        out["digits"] = i18n["digits"]
    elif i18n.get("lang") in ("fa", "ar"):
        out.setdefault("digits", "eastern")
    else:
        out.setdefault("digits", "western")
    return out


def theme_editor_css(theme: str) -> str:
    """Theme :root plus editor aliases (--brand, --soft, --ok, --warn)."""
    theme_dir = ROOT / "themes" / theme
    css = (theme_dir / "theme.css").read_text(encoding="utf-8")
    # Map theme tokens → names the editor stylesheet already uses
    extras = """
:root{
  --brand:var(--accent);
  --soft:var(--muted);
  --ok:#3F6B3A;
  --warn:#8A6A12;
}
"""
    return css.strip() + "\n" + extras.strip() + "\n"


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    locale = config.get("locale") or "fa"
    theme = config.get("theme") or "default"
    i18n = json.loads((ROOT / "locales" / f"{locale}.json").read_text(encoding="utf-8"))

    people_raw = PEOPLE.read_bytes()
    archive = json.loads(people_raw.decode("utf-8"))
    base, gen0 = build_base(archive)
    photo_ids = list_photo_ids()
    photo_stamp = "|".join(
        f"{pid}:{(PHOTOS / f'{pid}.jpg').stat().st_size}"
        if (PHOTOS / f"{pid}.jpg").exists()
        else pid
        for pid in photo_ids
    )
    data_rev = hashlib.sha256(people_raw + b"\0" + photo_stamp.encode()).hexdigest()[:16]
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))

    flat = flatten_i18n(i18n)
    lang = i18n.get("lang") or locale
    direction = i18n.get("dir") or "rtl"
    title = flat.get("title") or i18n.get("title") or "Editor"
    short = config.get("familyNameShort") or ""
    full_title = f"{title}" + (f" — {short}" if short else "")

    emblem_path = find_asset(ROOT / "themes" / theme / "assets", "emblem")
    emblem = data_url(emblem_path) if emblem_path else ""

    if not SHELL.exists():
        raise SystemExit(f"missing {SHELL.relative_to(ROOT)} — editor shell required")
    html = SHELL.read_text(encoding="utf-8")
    html = (
        html.replace("__BASE__", dump(base))
        .replace("__GEN0__", dump(gen0))
        .replace("__DATA_REV__", json.dumps(data_rev))
        .replace("__PHOTO_IDS__", dump(photo_ids))
        .replace("__I18N__", dump(flat))
        .replace("__LANG__", lang)
        .replace("__DIR__", direction)
        .replace("__TITLE__", full_title)
        .replace("__THEME_CSS__", theme_editor_css(theme))
        .replace("__EMBLEM__", emblem)
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(
        f"editor BASE {len(base)} GEN0 {len(gen0)} → {OUT.relative_to(ROOT)} "
        f"({OUT.stat().st_size // 1024}KB) | locale {locale} | theme {theme}"
    )


if __name__ == "__main__":
    main()
