#!/usr/bin/env python3
"""Wipe family data back to an empty ROOT-only tree.

Usage:
  python3 tools/reset_tree.py
  python3 tools/reset_tree.py --rebuild
  python3 tools/reset_tree.py --yes          # skip confirmation
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = ROOT / "data" / "people.json"
PHOTOS = ROOT / "data" / "photos"
DIST_PHOTOS = ROOT / "dist" / "photos"
CONFIG = ROOT / "config.json"

EMPTY_ARCHIVE = {
    "meta": {
        "root": "ROOT",
        "counts": {"total": 0},
    },
    "people": [
        {
            "id": "ROOT",
            "name": "Root",
            "sex": "m",
            "parent": None,
            "mother": None,
            "spouseOf": None,
            "birth": None,
            "death": None,
            "place": None,
            "family": None,
            "job": None,
            "note": None,
            "origin": "family",
            "flags": [],
            "photo": False,
        }
    ],
}


def clear_photo_dir(folder: Path) -> int:
    if not folder.exists():
        return 0
    keep = {".gitignore", ".gitkeep"}
    n = 0
    for p in folder.iterdir():
        if p.name in keep or p.name.startswith("."):
            continue
        if p.is_file():
            p.unlink()
            n += 1
    return n


def clear_photos() -> int:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    return clear_photo_dir(PHOTOS) + clear_photo_dir(DIST_PHOTOS)


def reset() -> tuple[int, int]:
    before = 0
    if PEOPLE.exists():
        try:
            before = len(json.loads(PEOPLE.read_text(encoding="utf-8")).get("people") or [])
        except json.JSONDecodeError:
            before = 0

    # Keep theme mark legend note if present in config theme; otherwise omit
    archive = json.loads(json.dumps(EMPTY_ARCHIVE))
    if CONFIG.exists():
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
        archive["meta"]["root"] = cfg.get("rootId") or "ROOT"
        archive["people"][0]["id"] = archive["meta"]["root"]

    PEOPLE.parent.mkdir(parents=True, exist_ok=True)
    PEOPLE.write_text(
        json.dumps(archive, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    photos = clear_photos()
    return before, photos


def main() -> None:
    ap = argparse.ArgumentParser(description="Wipe tree to ROOT-only")
    ap.add_argument("--rebuild", action="store_true", help="rebuild editor + reader after wipe")
    ap.add_argument("-y", "--yes", action="store_true", help="skip confirmation")
    args = ap.parse_args()

    if not args.yes:
        print(
            "This will replace data/people.json with ROOT only and delete "
            "data/photos/* and dist/photos/*."
        )
        ans = input("Continue? [y/N] ").strip().lower()
        if ans not in {"y", "yes"}:
            print("aborted")
            sys.exit(1)

    before, photos = reset()
    print(f"reset → {PEOPLE.relative_to(ROOT)} (was {before} people, now 1 ROOT)")
    print(f"cleared {photos} photo(s) under data/photos and dist/photos")

    if args.rebuild:
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_editor.py")])
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_site.py")])


if __name__ == "__main__":
    main()
