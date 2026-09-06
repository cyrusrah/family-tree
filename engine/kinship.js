/* ============================================================================
   kinship.js — Persian kinship phrases over the archive.

   Pure: no DOM, no globals beyond what is passed in. Everything the app says
   about how two people are related comes from here.

   The rules are stated in SPEC.md §3. The short version:
     descent is measured by walking both people up to a common ancestor;
     marriage is resolved first, and never enters a descent walk.
   ============================================================================ */

export function createKinship(people) {
  const P = people;                              // id -> record

  /* ---- basics ------------------------------------------------------- */
  const nameOf = id => (P[id] && P[id].name) || '؟';
  const sexOf = id => (P[id] && P[id].sex) || null;
  const isSpouse = id => !!(P[id] && P[id].spouseOf);

  const childrenIndex = {};
  const wivesIndex = {};
  for (const id in P) {
    const r = P[id];
    if (r.parent) (childrenIndex[r.parent] = childrenIndex[r.parent] || []).push(id);
    if (r.spouseOf) (wivesIndex[r.spouseOf] = wivesIndex[r.spouseOf] || []).push(id);
  }
  const childrenOfBlood = id => childrenIndex[id] || [];
  const spousesOf = id => wivesIndex[id] || [];

  /* Ancestor chain, root first.
     - If this person has a parent (including a spouse with a natal line), walk blood.
     - Married-in with no parents recorded: hang on the partner's chain for placement. */
  function chain(id) {
    if (!P[id]) return [];
    if (P[id].parent || !P[id].spouseOf) {
      const out = [];
      let c = id, guard = 0;
      while (c && P[c] && guard++ < 30) { out.unshift(c); c = P[c].parent; }
      return out;
    }
    return chain(P[id].spouseOf).concat([id]);
  }

  /* Who was this person's mother? Stated wins; otherwise a single recorded
     wife of the father is the mother by elimination. Two or more wives and
     nothing stated stays unknown — the archive would rather say nothing than guess. */
  function motherOf(id) {
    const r = P[id];
    if (!r) return null;
    if (r.mother) return r.mother;
    if (r.spouseOf || !r.parent) return null;
    const w = spousesOf(r.parent);
    return w.length === 1 ? P[w[0]].name : null;
  }

  /* Children visible on this person's page: own blood kids, plus (for a spouse)
     the partner's kids attributed to them by mother name. */
  function childrenOf(id) {
    const r = P[id];
    if (!r) return [];
    const own = childrenOfBlood(id);
    if (!r.spouseOf) return own;
    const attributed = childrenOfBlood(r.spouseOf).filter(k => {
      const m = motherOf(k);
      return m ? m === r.name : false;
    });
    const seen = new Set(own);
    return own.concat(attributed.filter(k => !seen.has(k)));
  }

  /* ---- Persian morphology -------------------------------------------- */
  const KASRE = '\u0650', ZWNJ = '\u200c';
  /* ezafe, applied exactly once: ends in a vowel letter -> ی, ends in ه -> ‌ی,
     otherwise the kasre. Composing already-ezafe'd parts is how you get
     پدربزرگِِ, so everything funnels through here. */
  /* Idempotent: only the three endings ez itself produces count as "already
     ezafe'd". A plain ی (ناپسری, قدسی) is part of the word and still needs the
     kasre, which is why a simple endsWith('ی') test is wrong. */
  const hasEz = s => s.endsWith(KASRE) || s.endsWith(ZWNJ + 'ی') || /[اوآ]ی$/.test(s);
  function ez(s) {
    if (!s || hasEz(s)) return s;
    if (/[اوآ]$/.test(s)) return s + 'ی';
    if (/ه$/.test(s)) return s + ZWNJ + 'ی';
    return s + KASRE;
  }
  const ORD = ['', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم'];
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const fa = n => String(n).replace(/[0-9]/g, d => FA_DIGITS[d]);

  const DESC = ['', 'فرزند', 'نوه', 'نتیجه', 'نبیره', 'ندیده'];
  const descTerm = (k, g) =>
    k === 1 ? (g === 'f' ? 'دختر' : g === 'm' ? 'پسر' : 'فرزند')
      : (DESC[k] || (fa(k) + ' نسل پایین‌تر'));
  /* پدربزرگ counts as جد اول, so جد دوم is his father. Not universal — the
     about screen states which convention this archive uses. */
  const ancTerm = (k, g) =>
    k === 1 ? (g === 'f' ? 'مادر' : 'پدر')
      : k === 2 ? (g === 'f' ? 'مادربزرگ' : 'پدربزرگ')
        : (g === 'f' ? 'جده' : 'جد') + ' ' + (ORD[k - 1] || fa(k - 1) + 'م');
  const uncleTerm = (paternal, g) =>
    paternal ? (g === 'f' ? 'عمه' : 'عمو') : (g === 'f' ? 'خاله' : 'دایی');

  /* ---- blood --------------------------------------------------------- */
  function bloodPhrase(ego, target) {
    const ca = chain(ego), cb = chain(target);
    let i = 0;
    while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
    if (!i) return '';
    const u = ca.length - i, d = cb.length - i, tg = sexOf(target);

    if (u === 0) return ez(descTerm(d, tg));
    if (d === 0) return ez(ancTerm(u, tg));

    if (u === 1 && d === 1) {
      const ma = motherOf(ego), mb = motherOf(target);
      const half = ma && mb && ma !== mb;
      return (tg === 'f' ? 'خواهر' : 'برادر') + (half ? ' ناتنی' : '');
    }
    if (u === 1) {
      const sib = cb[i];
      const w = sexOf(sib) === 'f' ? 'خواهرزاده' : 'برادرزاده';
      return d === 2 ? ez(w) : ez(descTerm(d - 1, tg)) + ' ' + ez(w);
    }

    /* u >= 2: the uncle family. The side comes from the sex of the parent that
       connects the two lines, not from the viewer's own sex. */
    const s = u - 2;
    const linkParent = ca[ca.length - 1 - s - 1];
    const paternal = sexOf(linkParent) !== 'f';
    const U = cb[i];
    let base;
    if (d === 1) base = uncleTerm(paternal, tg);
    else if (d === 2) base = (tg === 'f' ? 'دختر' : 'پسر') + uncleTerm(paternal, sexOf(U));
    else base = ez(descTerm(d - 1, tg)) + ' ' + ez(uncleTerm(paternal, sexOf(U)));

    if (s === 0) return ez(base);
    return ez(base) + ' ' + ez(ancTerm(s, sexOf(ca[ca.length - 1 - s])));
  }

  /* ---- marriage, resolved before blood -------------------------------- */
  function marriagePhrase(ego, target) {
    const A = P[ego], B = P[target];
    if (!A || !B) return null;

    /* the viewer is themselves married in */
    if (A.spouseOf) {
      const h = A.spouseOf;
      if (target === h) return 'همسر';
      if (B.spouseOf === h) return 'هوو';                     // two wives of one man
      if (B.parent === h) {
        const om = motherOf(target);
        if (om && om !== A.name) return sexOf(target) === 'f' ? 'نادختری' : 'ناپسری';
      }
      /* down his line: her own descendants are hers; anyone else is «…ِ همسر» */
      const cb = chain(target), ih = cb.indexOf(h);
      if (ih >= 0 && ih < cb.length - 1) {
        const heir = cb[ih + 1], mo = motherOf(heir);
        if (mo && mo === A.name) return relate(h, target);
      }
      const core = relate(h, target);
      return core ? ez(core) + ' همسر' : null;
    }

    /* the target is married in */
    if (B.spouseOf) {
      const h = B.spouseOf;
      if (h === ego) return 'همسر';
      if (A.spouseOf === h) return 'هوو';

      const ca = chain(ego), idx = ca.indexOf(h);
      if (idx >= 0 && idx < ca.length - 1) {
        /* his wife, and the viewer descends from him: grandmother or co-wife */
        const u = ca.length - 1 - idx, heir = ca[idx + 1];
        const mo = motherOf(heir);
        if (mo && mo === B.name) return ez(ancTerm(u, 'f'));
        return 'همسر دیگرِ ' + ez(ancTerm(u, sexOf(h)));
      }
      const core = relate(ego, h);
      return 'همسر' + (core ? ' ' + ez(core) : '');
    }
    return null;
  }

  /* ---- public --------------------------------------------------------- */
  /* the phrase without the trailing "شما", e.g. پدربزرگِ */
  function relate(ego, target) {
    if (!ego || !target || !P[ego] || !P[target]) return '';
    if (ego === target) return '';
    const m = marriagePhrase(ego, target);
    const out = m != null ? m : bloodPhrase(ego, target);
    return (out || '').replace(new RegExp(KASRE + '{2,}', 'g'), KASRE);
  }

  /* the full sentence as shown to the reader */
  function relation(ego, target) {
    if (ego === target) return 'خودتان';
    const r = relate(ego, target);
    return r ? ez(r) + ' شما' : '';
  }

  /* X is the <phrase> of Y — used on the نسبت chart */
  function between(a, b) {
    const r = relate(a, b);
    return r ? nameOf(b) + '، ' + ez(r) + ' ' + nameOf(a) : '';
  }

  function commonAncestor(ids) {
    const chs = ids.map(chain);
    let i = 0;
    while (chs.every(c => i < c.length) && new Set(chs.map(c => c[i])).size === 1) i++;
    if (!i) return null;
    const set = new Set();
    chs.forEach(c => c.slice(i - 1).forEach(x => set.add(x)));
    return { lca: chs[0][i - 1], set };
  }

  function descendantCount(id, seen) {
    seen = seen || new Set();
    if (seen.has(id)) return 0;
    seen.add(id);
    let n = 0;
    for (const k of childrenOfBlood(id)) n += 1 + descendantCount(k, seen);
    return n;
  }

  return {
    nameOf, sexOf, isSpouse, chain, motherOf, childrenOf, childrenOfBlood,
    spousesOf, relate, relation, between, commonAncestor, descendantCount,
    ez, fa, ancTerm, descTerm,
  };
}
