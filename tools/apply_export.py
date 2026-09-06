#!/usr/bin/env python3
"""Apply editor family-export.json into data/people.json + data/photos/.

Usage:
  python3 tools/apply_export.py ~/Downloads/family-export.json
  python3 tools/apply_export.py ~/Downloads/family-export.json --rebuild
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = ROOT / "data" / "people.json"
PHOTOS = ROOT / "data" / "photos"


def write_photo(pid: str, data_url: str | None) -> bool:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    path = PHOTOS / f"{pid}.jpg"
    if not data_url:
        if path.exists():
            path.unlink()
        return False
    m = re.match(r"data:image/[^;]+;base64,(.+)$", data_url, re.S)
    if not m:
        return False
    path.write_bytes(base64.b64decode(m.group(1)))
    return True


def apply(payload: dict) -> int:
    if "archive" in payload and "people" in payload["archive"]:
        archive = payload["archive"]
    elif "people" in payload:
        archive = payload
    else:
        raise SystemExit("expected family-export.json with archive.people or people[]")

    photos = payload.get("photos") or {}
    people = archive["people"]
    by = {p["id"]: p for p in people}

    for pid, url in photos.items():
        has = write_photo(pid, url)
        if pid in by:
            by[pid]["photo"] = has

    # mark photo flags from disk
    for p in people:
        p["photo"] = (PHOTOS / f"{p['id']}.jpg").exists()

    if "meta" not in archive:
        archive["meta"] = {"root": "ROOT"}
    archive["meta"].setdefault("counts", {})
    archive["meta"]["counts"]["total"] = len([p for p in people if p["id"] != "ROOT"])

    PEOPLE.write_text(json.dumps(archive, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(people)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export", type=Path)
    ap.add_argument("--rebuild", action="store_true", help="rebuild editor + reader")
    args = ap.parse_args()
    payload = json.loads(args.export.read_text(encoding="utf-8"))
    n = apply(payload)
    print(f"wrote {n} people → {PEOPLE.relative_to(ROOT)}")
    if args.rebuild:
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_editor.py")])
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_site.py")])


if __name__ == "__main__":
    main()
