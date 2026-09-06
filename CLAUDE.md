# Family tree — guide for people & AI assistants

This repo is a static family tree site + browser editor.  
Someone can fork/clone it, put in their family data, and publish on GitHub Pages.

**Humans:** start with [README.md](README.md).  
**AI assistants (Claude, Cursor, etc.):** follow this file when the user asks how to set up, edit, publish, or change the tree.

## What this project is

- **Reader** — `dist/index.html` (browse the tree)
- **Editor** — `dist/editor.html` (edit in the browser; autosaves locally)
- **Source of truth on disk** — `data/people.json` + `data/photos/`
- **Publish** — GitHub Pages serves `dist/` via `.github/workflows/pages.yml`

No Node app server. Needs **Python 3** for build/apply scripts. Optional `npm run build` just wraps those scripts.

## First-time publish (GitHub Pages)

1. Put the repo on GitHub (new repo or fork).
2. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Edit `config.json` (family name, `locale`: `en` | `fa` | `ar`, `theme`: `default` | `iranian`).
4. Rebuild and push:

```bash
python3 tools/build_site.py && python3 tools/build_editor.py
git add config.json data dist
git commit -m "Configure family tree"
git push
```

5. Site: `https://YOURUSER.github.io/REPO/`  
   Editor: `https://YOURUSER.github.io/REPO/editor.html`

If Pages fails, check the Actions tab for the `pages` workflow.

## Day-to-day: update family data

Browser edits are **not** on GitHub until export + apply:

1. Open `editor.html` (local `dist/` or the live Pages URL).
2. Edit people / photos (saved in that browser’s IndexedDB).
3. Click **Export** → downloads `family-export.json`.
4. On a machine with this repo:

```bash
python3 tools/apply_export.py ~/Downloads/family-export.json --rebuild
git add data dist
git commit -m "Update family tree"
git push
```

`--rebuild` refreshes `dist/`. Pushing `main` also lets Actions publish Pages.

**Import** in the editor can reload a `family-export.json` in the browser.  
**Disk** (GitHub) still needs `apply_export.py`.

## Empty tree vs sample data

```bash
# Real family: start empty
python3 tools/reset_tree.py -y --rebuild

# Local testing only (fake names/photos) — do not ship as a real tree
python3 devtools/seed_sample.py --people 80 --photos 0
```

## Data model (keep it simple)

Each person in `data/people.json` uses the same fields:

| Field | Meaning |
|---|---|
| `id` | Stable id (`ROOT`, `ROOT-x1`, `ROOT-x1+1` for spouse slot 1, …) |
| `parent` | Blood parent id (anyone may have this, including a spouse) |
| `mother` | Mother’s **name** (for attributing children when there are several spouses) |
| `spouseOf` | Partner id if this record is a spouse — marriage only, not a separate “type” |
| `photo` | Whether `data/photos/{id}.jpg` exists |

Kids hang under the blood parent (`parent`). Spouses show those kids when `mother` matches their name (or when they are the only spouse).

Do **not** invent parallel schemas, side flags, or mother/father “modes.”

## Where to change what

| Goal | Touch |
|---|---|
| Family name / language / theme | `config.json` → rebuild |
| UI strings | `locales/{en,fa,ar}.json` → rebuild |
| Look (colors, marks) | `themes/<name>/` → rebuild |
| Reader behavior | `engine/app.js`, `engine/kinship.js`, `engine/styles.css` → `build_site.py` |
| Editor UI | `tools/_editor_shell.html` → `build_editor.py` |
| Family content | Editor → export → `apply_export.py` (or edit `data/` carefully) |

After code or config changes:

```bash
python3 tools/build_site.py && python3 tools/build_editor.py
```

## Commands cheat sheet

```bash
python3 tools/build_site.py                          # reader → dist/
python3 tools/build_editor.py                        # editor → dist/editor.html
python3 tools/apply_export.py PATH.json --rebuild    # apply export to data/ + dist/
python3 tools/reset_tree.py -y --rebuild             # wipe to ROOT only
python3 devtools/seed_sample.py --people 100 --photos 0   # fake data (dev only)
```

## Local preview

```bash
python3 tools/build_site.py && python3 tools/build_editor.py
# open dist/index.html and dist/editor.html in a browser
# (file:// works; a simple static server is fine too)
```

## What assistants should / shouldn’t do

**Do**

- Prefer the export → `apply_export.py` → commit `data/` (+ rebuilt `dist/`) workflow
- Rebuild after changing engine, editor shell, locales, themes, or config
- Keep spouses as normal people with optional `parent` / `mother`
- Keep README accurate if workflows change

**Don’t**

- Commit real private family data the user didn’t ask to publish
- Treat `devtools/` as production content
- Add a backend, database, or auth unless the user explicitly wants that
- Over-engineer maternal/paternal “modes” or duplicate person types

## If the user is stuck

1. **Pages 404** — Pages source must be GitHub Actions; wait for the workflow; confirm `dist/index.html` is on `main`.
2. **Editor shows old people** — data rev cleared browser edits when `people.json` changed; re-export/apply or hard-refresh after rebuild.
3. **Photos missing** — files live in `data/photos/{id}.jpg`; apply export embeds/updates them; rebuild copies into `dist/photos/`.
4. **Wrong language** — set `config.json` → `locale`, rebuild.
