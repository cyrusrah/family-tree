# Family tree

Host on GitHub Pages. Edit in the browser → export → apply → push.

Handing this repo to someone (or an AI assistant)? See **[CLAUDE.md](CLAUDE.md)** for setup, publish, edit workflow, and data rules in one place.

## Setup (once)

1. Put this repo on your GitHub account.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push to `main`. Site: `https://YOURUSER.github.io/REPO/`  
   Editor: `…/editor.html`

Needs **Python 3** on your machine for the commands below.

## Update the tree

1. Open the editor, add people/photos (autosaves in the browser).
2. Click **Export** → `family-export.json`.
3. In this repo:

```bash
python3 tools/apply_export.py ~/Downloads/family-export.json --rebuild
git add data
git commit -m "Update family tree"
git push
```

GitHub rebuilds and publishes `dist/` automatically.

Export is the full `people.json` shape (including spouse `parent` / `mother`). Browser **Import** accepts that same file, or an older edits-only file. Disk updates still go through `apply_export.py`.

## Layout

| Path | Role |
|---|---|
| `data/people.json` | Family records |
| `data/photos/{id}.jpg` | Face photos for those records |
| `assets/` | Site chrome only (fonts, shield paths) |
| `dist/` | Built site + editor (what Pages serves) |

`people.json` and `photos/` stay together under `data/` — that is the family content.

Anyone can have a `parent` (including a spouse). `spouseOf` only marks the marriage; it does not block a natal line or children under that person.

## `config.json`

| Key | What it does | Example |
|---|---|---|
| `familyName` | Browser tab title + site name (manifest) | `"Al Nasser family"` |
| `familyNameShort` | Short name (home-screen / app title) | `"Nasser"` |
| `subtitle` | Optional line under the root emblem (leave `""` to hide) | `"Abu Dhabi"` or `""` |
| `locale` | UI language: `en`, `fa`, or `ar` | `"ar"` |
| `theme` | Visual pack under `themes/` | `"default"` or `"iranian"` |
| `rootId` | Id of the tree root person (usually leave as is) | `"ROOT"` |
| `githubPages` | Reserved for Pages setup docs (safe to leave `true`) | `true` |

After changing config, rebuild:

```bash
python3 tools/build_site.py && python3 tools/build_editor.py
```

Themes live in `themes/` (look only). Languages live in `locales/` (all UI text for site + editor). Add a language by copying a locale JSON and setting `config.locale` — no build-script changes.

## Other commands

```bash
python3 tools/build_site.py                 # reader
python3 tools/build_editor.py               # editor
python3 tools/reset_tree.py -y --rebuild    # empty tree
```

`devtools/` is only for fake test data — ignore it for a real family.
