#!/usr/bin/env python3
"""Fake tree for local testing. Template authors only.

  python3 devtools/seed_sample.py --people 100 --photos 20

Writes the same layout as real data:
  data/people.json
  data/photos/{id}.jpg

--photos N = download N faces (pravatar); everyone else keeps theme icons.

Spouses sometimes get a natal parent (in-law line). Blood kids sometimes
get a mother name when the father has recorded wives. Same fields as a real
tree — no special flags.
"""

from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = ROOT / "data" / "people.json"
PHOTOS = ROOT / "data" / "photos"

FIRST_M = "Hassan Omar Yusuf Karim Adam Noah Leo Daniel Sam Jordan Faris Ali".split()
FIRST_F = "Layla Amira Noor Sara Maya Hana Zara Lina Avery Riley Quinn Nadia".split()
LAST = "Nasser Hassan Ali Rahman Karim Saleh Faris Nour Martin Shah Costa Patel".split()


def person(pid, name, **kw):
    return {
        "id": pid,
        "name": name,
        "sex": kw.get("sex"),
        "parent": kw.get("parent"),
        "mother": kw.get("mother"),
        "spouseOf": kw.get("spouse_of"),
        "birth": kw.get("birth"),
        "death": None,
        "place": None,
        "family": None,
        "job": None,
        "note": None,
        "origin": "family",
        "flags": [],
        "photo": False,
    }


def build_tree(n: int, seed: int) -> dict:
    rng = random.Random(seed)
    people = [person("ROOT", "Root", sex="m", birth="1900")]
    by_id = {"ROOT": people[0]}
    gens = [["ROOT"]]
    next_idx: dict[str, int] = {}
    inlaw_n = 0
    kids_per = [5, 3, 2, 2, 1]
    births = [1900, 1930, 1960, 1988, 2012]

    def wives_of(pid: str) -> list:
        return [p for p in people if p.get("spouseOf") == pid and p.get("name")]

    def mother_name(parent_id: str) -> str | None:
        """Attribute a child to a wife when we know them — same as real archives."""
        w = wives_of(parent_id)
        if not w:
            return None
        if len(w) == 1:
            return w[0]["name"]
        # polygamy: usually name a mother, sometimes leave unknown
        return rng.choice(w)["name"] if rng.random() < 0.85 else None

    def attach_natal(spouse: dict) -> None:
        """Give some spouses their own father (and often mother + a sibling)."""
        nonlocal inlaw_n
        if rng.random() >= 0.4:
            return
        inlaw_n += 1
        fid = f"INLAW-{inlaw_n}"
        try:
            byear = int(spouse.get("birth") or "1950") - rng.randint(24, 32)
        except ValueError:
            byear = 1920
        father = person(
            fid,
            f"{rng.choice(FIRST_M)} {rng.choice(LAST)}",
            sex="m",
            birth=str(byear),
        )
        people.append(father)
        by_id[fid] = father
        spouse["parent"] = fid

        if rng.random() < 0.65:
            mname = f"{rng.choice(FIRST_F)} {rng.choice(LAST)}"
            mid = f"{fid}+1"
            mother = person(
                mid,
                mname,
                sex="f",
                spouse_of=fid,
                birth=str(byear + rng.randint(-2, 2)),
            )
            people.append(mother)
            by_id[mid] = mother
            spouse["mother"] = mname
            # occasional sibling on the in-law side
            if rng.random() < 0.45:
                ssex = rng.choice(["m", "f"])
                sib = person(
                    f"{fid}-x1",
                    f"{rng.choice(FIRST_M if ssex == 'm' else FIRST_F)} {rng.choice(LAST)}",
                    sex=ssex,
                    parent=fid,
                    mother=mname,
                    birth=str(int(spouse.get("birth") or byear + 28) + rng.randint(-5, 5)),
                )
                people.append(sib)
                by_id[sib["id"]] = sib

    def add_child(parent_id: str, birth: int) -> str:
        i = next_idx.get(parent_id, 1)
        next_idx[parent_id] = i + 1
        cid = f"{parent_id}-x{i}"
        sex = rng.choice(["m", "f"])
        first = rng.choice(FIRST_M if sex == "m" else FIRST_F)
        child = person(
            cid,
            f"{first} {rng.choice(LAST)}",
            sex=sex,
            parent=parent_id,
            mother=mother_name(parent_id),
            birth=str(birth),
        )
        people.append(child)
        by_id[cid] = child
        if rng.random() < 0.4:
            ssex = "f" if sex == "m" else "m"
            sid = f"{cid}+1"
            spouse = person(
                sid,
                f"{rng.choice(FIRST_F if ssex == 'f' else FIRST_M)} {rng.choice(LAST)}",
                sex=ssex,
                spouse_of=cid,
                birth=str(birth + rng.randint(-3, 3)),
            )
            people.append(spouse)
            by_id[sid] = spouse
            attach_natal(spouse)
        return cid

    g = 0
    while sum(1 for p in people if not p.get("spouseOf")) < max(2, n):
        if g >= len(gens) or g >= len(kids_per):
            break
        next_gen = []
        kmax, kmin = kids_per[g], (kids_per[g] if g == 0 else max(1, kids_per[g] - 1))
        birth = births[min(g + 1, len(births) - 1)]
        for pid in gens[g]:
            if sum(1 for p in people if not p.get("spouseOf")) >= n:
                break
            for _ in range(kmin if g == 0 else rng.randint(kmin, kmax)):
                if sum(1 for p in people if not p.get("spouseOf")) >= n:
                    break
                next_gen.append(add_child(pid, birth + rng.randint(-4, 4)))
        if not next_gen:
            break
        gens.append(next_gen)
        g += 1

    blood = sum(1 for p in people if not p.get("spouseOf"))
    return {
        "meta": {"root": "ROOT", "counts": {"total": blood - 1}},
        "people": people,
    }


def clear_photos() -> None:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    for f in PHOTOS.iterdir():
        if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            f.unlink()


def fetch_photos(people: list, limit: int) -> int:
    if limit <= 0:
        return 0
    targets = [p for p in people if p["id"] != "ROOT"][:limit]
    ok = 0
    for i, p in enumerate(targets, 1):
        pid = p["id"]
        url = f"https://i.pravatar.cc/320?u={urllib.request.quote(pid)}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "family-tree-sample/1.0"})
            data = urllib.request.urlopen(req, timeout=30).read()
            (PHOTOS / f"{pid}.jpg").write_bytes(data)
            p["photo"] = True
            ok += 1
            print(f"photo [{i}/{len(targets)}] {pid}")
        except Exception as e:
            print(f"photo [{i}/{len(targets)}] {pid} failed: {e}", file=sys.stderr)
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed a fake family tree for testing")
    ap.add_argument("--people", type=int, default=100, help="blood-line size incl. ROOT")
    ap.add_argument("--photos", type=int, default=20, help="how many faces to download")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    archive = build_tree(args.people, args.seed)
    clear_photos()
    n_photos = fetch_photos(archive["people"], args.photos)
    for p in archive["people"]:
        p["photo"] = (PHOTOS / f"{p['id']}.jpg").exists()

    PEOPLE.parent.mkdir(parents=True, exist_ok=True)
    PEOPLE.write_text(json.dumps(archive, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {PEOPLE.relative_to(ROOT)} ({len(archive['people'])} records)")
    print(f"wrote {n_photos} photos → {PHOTOS.relative_to(ROOT)}/")

    spouses = [p for p in archive["people"] if p.get("spouseOf")]
    with_natal = sum(1 for p in spouses if p.get("parent"))
    with_mo = sum(1 for p in archive["people"] if p.get("mother"))
    print(f"spouses with natal parent: {with_natal}/{len(spouses)}; people with mother name: {with_mo}")

    py = sys.executable
    subprocess.check_call([py, str(ROOT / "tools" / "build_editor.py")])
    subprocess.check_call([py, str(ROOT / "tools" / "build_site.py")])
    print("open dist/index.html or dist/editor.html")


if __name__ == "__main__":
    main()
