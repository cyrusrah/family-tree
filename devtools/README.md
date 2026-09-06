# Devtools (optional)

Fake data for local testing. Not needed to host a real tree.

```bash
python3 devtools/seed_sample.py --people 100 --photos 20
```

Writes into the same places as real data:

- `data/people.json`
- `data/photos/{id}.jpg`

Then rebuilds `dist/`. Open `dist/index.html` or `dist/editor.html`.

`--photos` = how many faces to download; the rest use theme icons.  
`--photos 0` = icons only.

Some spouses get an `INLAW-*` natal parent (and often a mother / sibling) so you can click into the other side of the family. Blood children often get a `mother` name when the father has wives recorded. Same schema as a real tree — no extra flags.

Wipe with `python3 tools/reset_tree.py -y --rebuild`.
