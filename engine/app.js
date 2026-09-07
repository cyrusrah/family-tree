/* ============================================================================
   app.js — views and interaction.

   Four surfaces of three kinds, which is the distinction the first build blurred:
     شخص   a place        the person
     تبار   a lens        on that same person
     یافتن  a finder      browse first, search as refinement
     نسبت   a mode        entered from a person, left by finishing

   Selection (نسبت) lives in exactly one place: the نسبت screen. History and
   selection are different sets and never share a control.
   ============================================================================ */

import { createKinship } from './kinship.js';

export function start(archive, assets) {
  const P = {};
  for (const r of archive.people) P[r.id] = r;
  const K = createKinship(P);
  const { nameOf: nameOfRaw, sexOf, motherOf, childrenOf, childrenOfBlood, spousesOf, chain } = K;
  const T = assets.i18n || {};
  const cfg = assets.config || {};
  const t = (k, fallback) => (T[k] != null && T[k] !== '' ? T[k] : (fallback != null ? fallback : k));
  const tFill = (k, vars) => {
    let s = t(k, '');
    Object.keys(vars || {}).forEach(key => { s = s.replace(new RegExp('\\{' + key + '\\}', 'g'), String(vars[key])); });
    return s;
  };
  /* Persian kinship morphology only when locale is fa; else use locale strings. */
  const useFaKinship = (T.lang || '') === 'fa';
  const fa = useFaKinship ? K.fa : (n => String(n));
  const nameOf = id => {
    const raw = nameOfRaw(id);
    const isRoot = id === 'ROOT' || id === (cfg.rootId || 'ROOT');
    /* Locale "Root"/"ریشه" only when the record has no real name yet. */
    if (isRoot && (!raw || /^root$/i.test(String(raw).trim()))) return t('rootName', raw || 'Root');
    return raw;
  };

  /* Gender-aware kinship for non-Persian locales (en / ar). Core phrases have
     no possessive; kinYour wraps them for the person badge; between uses core. */
  function kinPick(g, maleKey, femaleKey, neutralKey) {
    if (g === 'm') return t(maleKey);
    if (g === 'f') return t(femaleKey);
    return t(neutralKey);
  }
  function descCore(d, g) {
    if (d === 1) return kinPick(g, 'kinSon', 'kinDaughter', 'kinChild');
    if (d === 2) return kinPick(g, 'kinGrandson', 'kinGranddaughter', 'kinGrandchild');
    if (d === 3) return kinPick(g, 'kinGreatGrandson', 'kinGreatGranddaughter', 'kinGreatGrandchild');
    return tFill('kinDescendantN', { n: d });
  }
  function ancCore(u, g) {
    if (u === 1) return kinPick(g, 'kinFather', 'kinMother', 'kinParent');
    if (u === 2) return kinPick(g, 'kinGrandfather', 'kinGrandmother', 'kinGrandparent');
    if (u === 3) return kinPick(g, 'kinGreatGrandfather', 'kinGreatGrandmother', 'kinGreatGrandparent');
    return tFill('kinAncestorN', { n: u });
  }
  function uncleCore(paternal, g) {
    return paternal
      ? kinPick(g, 'kinPaternalUncle', 'kinPaternalAunt', 'kinPaternalUncleOrAunt')
      : kinPick(g, 'kinMaternalUncle', 'kinMaternalAunt', 'kinMaternalUncleOrAunt');
  }
  function bloodCore(ego, target) {
    const ca = chain(ego), cb = chain(target);
    let i = 0;
    while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
    if (!i) return '';
    const u = ca.length - i, d = cb.length - i, tg = sexOf(target);

    if (u === 0) return descCore(d, tg);
    if (d === 0) return ancCore(u, tg);

    if (u === 1 && d === 1) {
      const ma = motherOf(ego), mb = motherOf(target);
      const half = !!(ma && mb && ma !== mb);
      const base = kinPick(tg, 'kinBrother', 'kinSister', 'kinSibling');
      return half ? tFill('kinHalf', { rel: base }) : base;
    }
    if (u === 1) {
      if (d === 2) return kinPick(tg, 'kinNephew', 'kinNiece', 'kinNibling');
      const sib = cb[i];
      const sibWord = sexOf(sib) === 'f' ? t('kinSister') : sexOf(sib) === 'm' ? t('kinBrother') : t('kinSibling');
      return tFill('kinOf', { a: descCore(d - 1, tg), b: sibWord });
    }

    const s = u - 2;
    const linkParent = ca[ca.length - 1 - s - 1];
    const paternal = sexOf(linkParent) !== 'f';
    const U = cb[i];
    let base;
    if (d === 1) {
      base = uncleCore(paternal, tg);
    } else if (d === 2) {
      base = paternal
        ? kinPick(tg, 'kinPaternalCousinM', 'kinPaternalCousinF', 'kinPaternalCousin')
        : kinPick(tg, 'kinMaternalCousinM', 'kinMaternalCousinF', 'kinMaternalCousin');
    } else {
      base = tFill('kinOf', { a: descCore(d - 1, tg), b: uncleCore(paternal, sexOf(U)) });
    }
    if (s === 0) return base;
    return tFill('kinOf', { a: base, b: ancCore(s, sexOf(ca[ca.length - 1 - s])) });
  }
  function marriageCore(ego, target) {
    const A = P[ego], B = P[target];
    if (!A || !B) return null;

    if (A.spouseOf) {
      const h = A.spouseOf;
      if (target === h) return t('kinSpouse');
      if (B.spouseOf === h) return t('kinCoWife');
      if (B.parent === h) {
        const om = motherOf(target);
        if (om && om !== A.name) {
          return kinPick(sexOf(target), 'kinStepson', 'kinStepdaughter', 'kinStepchild');
        }
      }
      const cb = chain(target), ih = cb.indexOf(h);
      if (ih >= 0 && ih < cb.length - 1) {
        const heir = cb[ih + 1], mo = motherOf(heir);
        if (mo && mo === A.name) return bloodCore(h, target);
      }
      const core = bloodCore(h, target);
      return core ? tFill('kinRelOfSpouse', { rel: core }) : null;
    }

    if (B.spouseOf) {
      const h = B.spouseOf;
      if (h === ego) return t('kinSpouse');
      if (A.spouseOf === h) return t('kinCoWife');
      const ca = chain(ego), idx = ca.indexOf(h);
      if (idx >= 0 && idx < ca.length - 1) {
        const u = ca.length - 1 - idx, heir = ca[idx + 1];
        const mo = motherOf(heir);
        if (mo && mo === B.name) return ancCore(u, 'f');
        return tFill('kinOtherSpouseOf', { rel: ancCore(u, sexOf(h)) });
      }
      const core = bloodCore(ego, h);
      return core ? tFill('kinSpouseOf', { rel: core }) : t('kinSpouse');
    }
    return null;
  }
  function relateCore(ego, target) {
    if (!ego || !target || !P[ego] || !P[target] || ego === target) return '';
    const m = marriageCore(ego, target);
    if (m != null && m !== '') return m;
    return bloodCore(ego, target) || '';
  }
  function relateLocalized(ego, target) {
    const core = relateCore(ego, target);
    if (!core) return '';
    const wrapped = tFill('kinYour', { rel: core });
    return wrapped || core;
  }
  function betweenLocalized(a, b) {
    const core = relateCore(a, b);
    if (!core) return '';
    return tFill('betweenPhrase', { a: nameOf(a), b: nameOf(b), rel: core });
  }

  /* ---- state --------------------------------------------------------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  let me = store.get('family-me', store.get('me', null)); if (!P[me]) me = null;
  /* Optional deep-link: ?me=ID */
  try {
    const q = new URLSearchParams(location.search);
    let id = q.get('me');
    if (id) {
      try { id = decodeURIComponent(id); } catch {}
      try { id = id.normalize('NFC'); } catch {}
      if (P[id]) { me = id; store.set('family-me', me); }
    }
  } catch {}
  let picks = (store.get('family-picks', store.get('picks', [])) || []).filter(id => P[id]);
  let cur = cfg.rootId || 'ROOT';
  let view = 'person';                      // person | tree | link | about
  let finderAt = cfg.rootId || 'ROOT', finderMode = 'go';

  const $ = id => document.getElementById(id);
  const el = (tagn, c, txt) => { const e = document.createElement(tagn); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const rel = id => {
    if (!me) return '';
    if (me === id) return t('self', 'You');
    return useFaKinship ? K.relation(me, id) : relateLocalized(me, id);
  };
  const between = (a, b) => useFaKinship ? K.between(a, b) : betweenLocalized(a, b);

  /* ---- marks (generic roles from theme pack) ------------------------- */
  const SHIELD = assets.shieldPath, SHIELD_VB = '0 0 100 125.49';
  const M = assets.marks || {};
  function markSrc(sex, small) {
    if (sex === 'm') return small ? M.maleSmall : M.male;
    if (sex === 'f') return small ? M.femaleSmall : M.female;
    return small ? M.unknownSmall : M.unknown;
  }
  function markSVG(sex, size) {
    const small = size < 40;
    const src = markSrc(sex, small);
    if (!src) {
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><circle cx="50" cy="50" r="28" fill="none" stroke="var(--oxblood)" stroke-width="4"/></svg>`;
    }
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><image href="${src}" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }
  function rootMarkSVG(size) {
    const src = M.rootSmall || M.root;
    if (!src) return markSVG(null, size);
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><image href="${src}" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }
  /* Small glyphs are drawn separately: the shield path is a contour, so filling
     it at 13px yields a ring rather than a mass. */
  const GLYPH = {
    person: '<svg viewBox="0 0 44 56"><path d="M22 2c6.4 0 10.4 4.6 10.6 9.6h4.2v3.2H38V36c0 10.2-7.2 18-16 18S6 46.2 6 36V14.8h1.2V11.6h4.2C11.6 6.6 15.6 2 22 2z" fill="currentColor"/></svg>',
    tree: '<svg viewBox="0 0 44 56"><g fill="none" stroke="currentColor" stroke-width="3.6">'
      + '<path d="M22 9v9M22 27v11"/><path d="M11 45v-7h22v7"/></g>'
      + '<circle cx="22" cy="6" r="4" fill="currentColor"/><circle cx="22" cy="23" r="4.6" fill="currentColor"/>'
      + '<circle cx="11" cy="49" r="4" fill="currentColor"/><circle cx="33" cy="49" r="4" fill="currentColor"/></svg>',
  };
  const photoSrc = id => {
    if (assets.photos && assets.photos[id]) return assets.photos[id];
    if (assets.photoBase && id && P[id] && P[id].photo) {
      /* keep + in ids (spouses like ROOT-x1+1); encodeURIComponent turns + into %2B
         which breaks some file:// / static hosts looking for a literal + filename */
      return assets.photoBase + String(id).replace(/[^A-Za-z0-9._~+-]/g, c => encodeURIComponent(c)) + '.jpg';
    }
    return null;
  };

  const DOC_KIND = Object.assign({ wedding: 'Marriage certificate', birth: 'Birth certificate', death: 'Death', other: 'Document' }, T.docKinds || {});
  function docSrc(file) {
    if (!file) return null;
    if (assets.docs && assets.docs[file]) return assets.docs[file];
    if (assets.docsBase) return assets.docsBase + encodeURIComponent(file);
    return null;
  }
  function docsFor(id) {
    const out = [];
    const seen = new Set();
    for (const r of archive.people) {
      const list = r.docs;
      if (!list || !list.length) continue;
      for (const d of list) {
        const people = (d.with && d.with.length) ? d.with : [r.id];
        if (!people.includes(id)) continue;
        const key = d.id || d.file;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(d);
      }
    }
    return out;
  }
  function openDocViewer(src, title) {
    let v = $('docview');
    if (!v) {
      v = el('div', 'docview'); v.id = 'docview';
      const close = el('button', 'dv-close', '×');
      close.type = 'button'; close.setAttribute('aria-label', t('close', 'Close'));
      close.onclick = () => { v.classList.remove('on'); };
      const img = document.createElement('img'); img.id = 'docviewImg'; img.alt = '';
      img.draggable = false;
      img.addEventListener('contextmenu', e => e.preventDefault());
      v.appendChild(close); v.appendChild(img);
      v.addEventListener('click', e => { if (e.target === v) v.classList.remove('on'); });
      document.body.appendChild(v);
    }
    const img = $('docviewImg');
    img.src = src; img.alt = title || '';
    v.classList.add('on');
  }
  function renderDocs(app, id) {
    const list = docsFor(id);
    if (!list.length) return;
    const wrap = el('div', 'docs');
    wrap.appendChild(el('div', 'dhead', t('docs', 'اسناد')));
    const ul = el('div', 'dlist');
    list.forEach(d => {
      const src = docSrc(d.file);
      if (!src) return;
      const row = el('button', 'drow');
      row.type = 'button';
      row.appendChild(el('span', 'dkind', DOC_KIND[d.kind] || DOC_KIND.other));
      row.appendChild(el('span', 'dtitle', d.title || t('docDefault', 'سند')));
      if (d.year != null) row.appendChild(el('span', 'dyear', fa(d.year)));
      row.onclick = () => openDocViewer(src, d.title);
      ul.appendChild(row);
    });
    if (!ul.children.length) return;
    wrap.appendChild(ul);
    app.appendChild(wrap);
  }

  function shieldNode(id, cls, label, sub, opts) {
    opts = opts || {};
    const ghost = opts.ghost != null ? opts.ghost : (id && P[id] && P[id].origin === 'name-only');
    const n = el('div', 'node ' + cls + (ghost ? ' ghost' : '') + (opts.wed ? ' wed' : '') + (opts.chosen ? ' chosen' : ''));
    const sh = el('div', 'sh');
    sh.innerHTML = `<svg viewBox="${SHIELD_VB}" preserveAspectRatio="none"><path d="${SHIELD}"`
      + ` fill="none" stroke="var(--oxblood)" stroke-width="1.6"`
      + (ghost ? ' stroke-dasharray="4 4" opacity=".55"' : '') + (opts.wed ? ' opacity=".62"' : '') + '/></svg>';
    const im = el('div', 'im');
    const src = id && photoSrc(id);
    const sex = id ? sexOf(id) : opts.sex;
    const markSize = cls.includes('focus') ? 42 : 26;
    if (src) {
      /* mark first, swap when the jpg is ready — avoids blank shields while
         many tree photos load (and after navigation, cache makes them snap in) */
      im.innerHTML = markSVG(sex, markSize);
      const g = document.createElement('img');
      g.alt = ''; g.draggable = false; g.decoding = 'async';
      g.addEventListener('contextmenu', e => e.preventDefault());
      g.onload = () => { im.innerHTML = ''; im.appendChild(g); };
      g.onerror = () => {}; /* keep mark if file missing */
      g.src = src;
    }
    else im.innerHTML = markSVG(sex, markSize);
    sh.appendChild(im); n.appendChild(sh);
    n.appendChild(el('div', 'nn', label));
    if (sub) n.appendChild(el('div', 'nr', sub));
    if (id && !opts.inert) {
      n.tabIndex = 0; n.setAttribute('role', 'button');
      n.onclick = () => go(id, undefined, n);
      n.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(id, undefined, n); }
      };
    }
    return n;
  }

  /* ---- navigation ----------------------------------------------------- */
  const scrollPos = Object.create(null);
  try { history.scrollRestoration = 'manual'; } catch {}

  function saveScroll() {
    scrollPos[cur + ':' + view] = window.scrollY || window.pageYOffset || 0;
  }
  function pinTreeShield(midY) {
    const sh = document.querySelector('.node.focus .sh');
    if (!sh || midY == null) return;
    const r = sh.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const dy = mid - midY;
    if (Math.abs(dy) > 0.5) {
      const y = (window.pageYOffset || window.scrollY || 0) + dy;
      window.scrollTo(0, y);
    }
  }
  function restoreScroll() {
    if (view === 'tree') {
      window.scrollTo(0, scrollPos[cur + ':' + view] || 0);
      return;
    }
    window.scrollTo(0, scrollPos[cur + ':' + view] || 0);
  }
  function go(id, keepLens, fromNode) {
    if (!P[id]) return;
    /* keep the tapped shield’s midpoint under the finger (no page jump) */
    let pinMid = null;
    if (view === 'tree' && fromNode) {
      const sh = fromNode.querySelector('.sh') || fromNode;
      const r = sh.getBoundingClientRect();
      pinMid = r.top + r.height / 2;
    }
    saveScroll();
    cur = id;
    /* the lens persists while walking a line, so climbing does not cost two
       taps a generation; it resets when you arrive from elsewhere */
    if (!keepLens && view !== 'tree') view = 'person';
    syncHash();

    const app = $('app');
    /* iOS clamps scroll when #app collapses — hold height through the rebuild */
    const hold = view === 'tree' && pinMid != null;
    if (hold) app.style.minHeight = app.offsetHeight + 'px';

    render();

    if (hold) {
      pinTreeShield(pinMid);
      app.style.minHeight = '';
      /* one more pass after minHeight release / layout settle */
      pinTreeShield(pinMid);
    } else {
      restoreScroll();
    }
  }
  function syncHash() {
    /* pushState (not location.hash=) — assigning hash scrolls iOS Safari to top */
    const next = encodeURIComponent(cur) + (view !== 'person' ? '/' + view : '');
    try {
      const curHash = (location.hash || '').replace(/^#/, '');
      if (curHash === next) return;
      history.pushState(null, '', '#' + next);
    } catch {}
  }
  const idAliases = (archive.meta && archive.meta.idAliases) || {};
  function readHash() {
    try {
      const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      if (!h) return false;
      const [raw, v] = h.split('/');
      const id = P[raw] ? raw : idAliases[raw];
      if (!P[id]) return false;
      cur = id;
      view = ['tree', 'link', 'about'].includes(v) ? v : 'person';
      return true;
    } catch { return false; }
  }

  /* ---- picks (نسبت) ---------------------------------------------------- */
  const hasPick = id => picks.includes(id);
  function togglePick(id) {
    const i = picks.indexOf(id);
    if (i >= 0) picks.splice(i, 1);
    else { if (picks.length >= 4) return false; picks.push(id); }
    store.set('family-picks', picks); return true;
  }

  /* ---- shared bits ------------------------------------------------------ */
  function lens() {
    const w = el('div', 'lens');
    const mk = (label, key, active, v) => {
      const b = el('button');
      b.innerHTML = `<span class="lg">${GLYPH[key]}</span><span>${label}</span>`;
      b.setAttribute('aria-current', active ? 'true' : 'false');
      b.onclick = () => {
        if (active) return;
        saveScroll();
        view = v; syncHash(); render(); restoreScroll();
      };
      return b;
    };
    w.appendChild(mk(t('lensPerson', 'شخص'), 'person', view !== 'tree', 'person'));
    w.appendChild(mk(t('lensTree', 'تبار'), 'tree', view === 'tree', 'tree'));
    return w;
  }

  function setMeButton(cls) {
    const b = el('button', cls || '', cur === me ? t('notMe', 'این من نیستم') : t('thisIsMe', 'این منم'));
    b.onclick = () => {
      if (cur === me) { me = null; store.del('family-me'); store.del('me'); }
      else { me = cur; store.set('family-me', me); }
      render();
    };
    return b;
  }

  function footLinks() {
    const f = el('div', 'foot');
    const add = el('button', '', hasPick(cur) ? t('removeFromKinship', 'Remove from kinship') : t('addToKinship', 'Add to kinship'));
    add.onclick = () => {
      if (!togglePick(cur)) { alert(t('picksFull', 'چهار نفر کامل است. اول یکی را بردارید.')); return; }
      render();
    };
    f.appendChild(add);
    /* the only evidence of a selection outside the نسبت screen: a count, which
       is still true in a minute, rather than a message that is true for two
       seconds */
    if (picks.length) {
      if (picks.length < 2) f.appendChild(el('div', 'count', tFill('inKinship', { n: fa(picks.length) })));
      else {
        const b = el('button', 'accent', tFill('seeKinship', { n: fa(picks.length) }));
        b.onclick = () => { saveScroll(); view = 'link'; syncHash(); render(); window.scrollTo(0, 0); };
        f.appendChild(b);
      }
    }
    f.appendChild(setMeButton());

    const pdf = el('button', '', t('savePdf', 'Save as PDF'));
    pdf.onclick = () => printPage(nameOf(cur), view !== 'person');
    f.appendChild(pdf);

    const wrong = el('button', '', t('reportWrong', 'This is wrong'));
    wrong.onclick = () => reportError(cur);
    f.appendChild(wrong);

    const ab = el('button', '', t('aboutLink', 'How this archive works'));
    ab.onclick = () => { saveScroll(); view = 'about'; syncHash(); render(); window.scrollTo(0, 0); };
    f.appendChild(ab);
    return f;
  }

  function crumb() {
    const c = el('div', 'crumb');
    chain(cur).forEach((k, i) => {
      if (i) c.appendChild(el('span', 'sep', '›'));
      if (k === cur) c.appendChild(el('span', 'here', nameOf(k)));
      else { const b = el('button', '', nameOf(k)); b.onclick = () => go(k); c.appendChild(b); }
    });
    return c;
  }

  function group(title, items, open) {
    const g = el('div', 'group'); g.dataset.open = open ? 'true' : 'false';
    const h = el('button', 'ghead');
    h.appendChild(el('span', '', title));
    const r = document.createElement('span');
    r.appendChild(el('span', 'gcount', fa(items.length)));
    r.appendChild(el('span', 'chev'));
    h.appendChild(r);
    h.onclick = () => g.dataset.open = g.dataset.open === 'true' ? 'false' : 'true';
    const body = el('div', 'gbody');
    if (!items.length) {
      const e = el('div', 'row'); const p = el('div', 'rn');
      p.appendChild(el('div', 'rsub', t('noRecordYet', 'No record yet'))); e.appendChild(p); body.appendChild(e);
    }
    items.forEach(it => {
      const row = el('div', 'row' + (it.id ? ' link' : ''));
      const p = el('div', 'rn');
      p.appendChild(el('div', 'rname', it.name));
      if (it.sub) p.appendChild(el('div', 'rsub', it.sub));
      row.appendChild(p);
      if (it.id) {
        row.appendChild(el('div', 'arrow'));
        row.tabIndex = 0; row.setAttribute('role', 'button');
        row.onclick = () => go(it.id);
        row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(it.id); } };
      }
      body.appendChild(row);
    });
    g.appendChild(h); g.appendChild(body);
    return g;
  }

  /* ---- شخص --------------------------------------------------------------- */
  function renderPerson(app) {
    const n = P[cur], root = cur === 'ROOT';
    const head = el('div', 'head');
    head.appendChild(el('div', 'gen', t('generation', 'نسل') + ' ' + fa(generationOf(cur))));
    head.appendChild(el('div', 'name', nameOf(cur)));
    const r = rel(cur);
    head.appendChild(el('div', 'rel', me ? r : t('pickYourself', 'برای دیدن نسبت‌ها نام خودتان را انتخاب کنید')));
    app.appendChild(head);
    app.appendChild(lens());

    if (root) {
      const w = el('div', 'emblem-big');
      const i = document.createElement('img'); i.src = assets.emblem; i.alt = t('emblemAlt', 'نشان خانواده');
      w.appendChild(i);
      if (cfg.subtitle) w.appendChild(el('span', '', cfg.subtitle));
      app.appendChild(w);
    } else {
      const w = el('div', 'portrait'), s = el('div', 'shield');
      s.innerHTML = `<svg class="frame" viewBox="${SHIELD_VB}" preserveAspectRatio="none">`
        + `<path d="${SHIELD}" fill="none" stroke="var(--oxblood)" stroke-width="1.5"`
        + (n.origin === 'name-only' ? ' stroke-dasharray="4 4" opacity=".6"' : '') + '/></svg>';
      const f = el('div', 'fill');
      const src = photoSrc(cur);
      if (src) {
        f.innerHTML = markSVG(sexOf(cur), 34);
        const g = document.createElement('img');
        g.alt = nameOf(cur); g.draggable = false; g.decoding = 'async';
        g.addEventListener('contextmenu', e => e.preventDefault());
        g.onload = () => { f.innerHTML = ''; f.appendChild(g); };
        g.onerror = () => {};
        g.src = src;
      }
      else {
        f.appendChild(el('div', 'initial', (nameOf(cur) || '؟').trim()[0]));
        const m = el('div'); m.innerHTML = markSVG(sexOf(cur), 34); f.appendChild(m);
      }
      s.appendChild(f); w.appendChild(s); app.appendChild(w);
    }

    const facts = [];
    if (n.family) facts.push([t('familyName', 'نام خانوادگی'), n.family]);
    if (n.birth || n.death) facts.push([t('year', 'سال'), (n.birth ? fa(n.birth) : '؟') + (n.death ? ' — ' + fa(n.death) : '')]);
    if (n.place) facts.push([t('birthplace', 'زادگاه'), n.place]);
    if (n.job) facts.push([t('job', 'شغل'), n.job]);
    if (n.spouseOf) facts.push([t('spouseOf', 'همسرِ'), nameOf(n.spouseOf)]);
    const dc = K.descendantCount(cur);
    if (dc > 2) facts.push([t('descendants', 'نوادگان'), fa(dc) + ' ' + t('peopleCountSuffix', 'نفر')]);
    if (facts.length) {
      const f = el('dl', 'facts');
      facts.forEach(([a, b]) => {
        const row = el('div', 'fact');
        row.appendChild(el('dt', '', a)); row.appendChild(el('dd', '', b));
        f.appendChild(row);
      });
      app.appendChild(f);
    }

    if (n.origin === 'name-only') {
      const nt = el('div', 'notes');
      nt.appendChild(el('p', '', t('nameOnlyNote', 'در سند فقط نام ایشان آمده است. اگر چیزی می‌دانید، اضافه کنید.')));
      app.appendChild(nt);
    } else if (n.note) {
      const nt = el('div', 'notes'); nt.appendChild(el('p', '', n.note)); app.appendChild(nt);
    }

    renderDocs(app, cur);

    app.appendChild(el('div', 'girih'));

    const gs = el('div', 'groups');
    /* parents: both, because the mother is a person here and not a caption */
    if (n.parent && P[n.parent]) {
      const par = [{ id: n.parent, name: nameOf(n.parent), sub: rel(n.parent) }];
      const mo = motherOf(cur);
      const wi = mo ? spousesOf(n.parent).find(w => P[w].name === mo) : null;
      if (wi) par.push({ id: wi, name: mo, sub: rel(wi) });
      else if (mo) par.push({ id: null, name: mo, sub: t('mother', 'Mother') });
      gs.appendChild(group(par.length > 1 ? t('parents', 'پدر و مادر') : t('father', 'پدر'), par, true));
    } else if (cur !== 'ROOT') {
      gs.appendChild(group(t('parents', 'Parents'), [], false));
    }
    const sp = spousesOf(cur).map(id => ({ id, name: nameOf(id), sub: rel(id) }));
    if (n.spouseOf) sp.push({ id: n.spouseOf, name: nameOf(n.spouseOf), sub: rel(n.spouseOf) });
    if (sp.length) gs.appendChild(group(sp.length > 1 ? t('spouses', 'همسران') : t('spouse', 'همسر'), sp, true));

    const kids = childrenOf(cur);
    gs.appendChild(group(t('children', 'فرزندان'), kids.map(k => ({
      id: k, name: nameOf(k),
      sub: P[k].origin === 'name-only' ? t('noRecord', 'بدون رکورد') : rel(k),
    })), true));

    /* siblings: anyone with the same parent, including spouses who have a natal line */
    const anchor = n.parent;
    if (anchor && P[anchor]) {
      const mine = motherOf(cur);
      const full = [], half = [];
      childrenOfBlood(anchor).filter(k => k !== cur).forEach(k => {
        const om = motherOf(k);
        ((mine && om && om !== mine) ? half : full).push(k);
      });
      const mk = k => ({ id: k, name: nameOf(k), sub: rel(k) });
      if (full.length) gs.appendChild(group(half.length ? t('fullSiblings', 'Full siblings') : t('siblings', 'Siblings'), full.map(mk), false));
      if (half.length) gs.appendChild(group(t('halfSiblings', 'Half siblings'), half.map(mk), false));
    }
    app.appendChild(gs);

    if (n.informants) {
      const s = el('div', 'notes');
      s.appendChild(el('p', '', tFill('branchBy', { names: n.informants.join(useFaKinship ? ' و ' : (T.lang === 'ar' ? ' و ' : ' and ')) })));
      app.appendChild(s);
    }
    app.appendChild(crumb());
    app.appendChild(footLinks());
  }

  const generationOf = id => Math.max(0, chain(id).length - 1);

  /* ---- تبار ---------------------------------------------------------------- */
  function renderTree(app) {
    const n = P[cur];
    const head = el('div', 'head');
    head.appendChild(el('div', 'gen', t('generation', 'Generation') + ' ' + fa(generationOf(cur))));
    head.appendChild(el('div', 'name', nameOf(cur)));
    app.appendChild(head);
    app.appendChild(lens());

    const wrap = el('div', 'tree');

    /* Ancestors only when this person has a natal parent — same rule for everyone. */
    const line = chain(cur), ups = n.parent ? line.slice(0, -1) : [];
    if (ups.length) {
      wrap.appendChild(el('div', 'tlabel', t('ancestors', 'Ancestors')));
      ups.forEach((k, i) => {
        const tier = el('div', 'tier');
        const nd = shieldNode(k, 'up', nameOf(k), rel(k));
        /* climbing, the only relevant wife is the one this line descends
           through; his other wives belong on his own page */
        const heir = line[i + 1];
        const mo = heir ? motherOf(heir) : null;
        const wid = mo ? spousesOf(k).find(w => P[w].name === mo) : null;
        if (mo) {
          tier.classList.add('couple');
          tier.appendChild(el('div', 'spacer'));
          tier.appendChild(nd);
          const side = el('div', 'side');
          side.appendChild(el('div', 'bar'));
          side.appendChild(shieldNode(wid || null, 'up', mo, t('motherOf', 'Mother of') + ' ' + nameOf(heir),
            { wed: true, sex: 'f', inert: !wid }));
          tier.appendChild(side);
        } else tier.appendChild(nd);
        wrap.appendChild(tier);
        wrap.appendChild(el('div', 'stem'));
      });
    } else {
      wrap.appendChild(el('div', 'tlabel', t('noParents', 'No parents recorded')));
    }

    /* the focus row: person on the page centre line whatever sits beside them */
    const f = el('div', 'tier couple');
    const sibs = el('div', 'sibs');
    if (n.parent && P[n.parent]) {
      childrenOfBlood(n.parent).filter(k => k !== cur)
        .forEach(k => sibs.appendChild(shieldNode(k, 'sib', nameOf(k), rel(k))));
    }
    f.appendChild(sibs);
    f.appendChild(shieldNode(cur, 'focus', nameOf(cur), me ? rel(cur) : '', { chosen: hasPick(cur) }));
    const side = el('div', 'side');
    const partners = spousesOf(cur).slice();
    if (n.spouseOf && P[n.spouseOf] && !partners.includes(n.spouseOf)) partners.push(n.spouseOf);
    partners.forEach((w, i) => {
      side.appendChild(el('div', 'bar'));
      side.appendChild(shieldNode(w, 'down', nameOf(w),
        partners.length > 1 ? tFill('spouseN', { n: fa(i + 1) }) : t('spouse', 'Spouse'), { wed: true }));
    });
    f.appendChild(side);
    wrap.appendChild(f);

    const kids = childrenOf(cur);
    if (kids.length) {
      wrap.appendChild(el('div', 'stem'));
      const mothers = [...new Set(kids.map(motherOf).filter(Boolean))];
      const showMo = mothers.length > 1 || (spousesOf(cur).length > 1 && mothers.length > 0);
      wrap.appendChild(el('div', 'tlabel', tFill('childrenN', { n: fa(kids.length) })));
      if (showMo) {
        mothers.forEach(mo => {
          wrap.appendChild(el('div', 'molabel', tFill('fromMother', { name: mo })));
          const tier = el('div', 'tier kids');
          kids.filter(k => motherOf(k) === mo)
            .forEach(k => tier.appendChild(shieldNode(k, 'down', nameOf(k), rel(k))));
          wrap.appendChild(tier);
        });
        const rest = kids.filter(k => !motherOf(k));
        if (rest.length) {
          wrap.appendChild(el('div', 'molabel', t('unknownMother', 'Mother unknown')));
          const tier = el('div', 'tier kids');
          rest.forEach(k => tier.appendChild(shieldNode(k, 'down', nameOf(k), rel(k))));
          wrap.appendChild(tier);
        }
      } else {
        const tier = el('div', 'tier kids');
        kids.forEach(k => tier.appendChild(shieldNode(k, 'down', nameOf(k),
          P[k].origin === 'name-only' ? t('noRecord', 'No record') : rel(k))));
        wrap.appendChild(tier);
      }
    } else wrap.appendChild(el('div', 'tlabel', t('noChildren', 'No children recorded')));

    app.appendChild(wrap);
    app.appendChild(crumb());
    app.appendChild(footLinks());
    scaleNodes();
  }

  /* nodes grow toward the centre of the screen as you scroll: the same feeling
     as dock magnification, driven by position so it works without a pointer */
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = null;
  function scaleNodes() {
    if (reduced || view !== 'tree') return;
    const mid = window.innerHeight / 2, span = window.innerHeight * 0.55;
    document.querySelectorAll('.node').forEach(n => {
      /* focus stays put — dock scale on the active person causes a finger-jump */
      if (n.classList.contains('focus')) {
        n.style.transform = '';
        n.style.opacity = '';
        return;
      }
      const r = n.getBoundingClientRect();
      const d = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / span);
      n.style.transform = 'scale(' + (1.08 - 0.22 * d).toFixed(3) + ')';
      n.style.opacity = (1 - 0.4 * d).toFixed(3);
    });
  }
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; scaleNodes(); });
  }, { passive: true });
  window.addEventListener('resize', scaleNodes);

  /* ---- نسبت ---------------------------------------------------------------- */
  function renderLink(app) {
    const head = el('div', 'head');
    head.appendChild(el('div', 'name', t('kinshipTitle', 'Kinship')));
    app.appendChild(head);

    if (picks.length < 2) {
      app.appendChild(el('div', 'lead', picks.length
        ? 'یک نفر دیگر را اضافه کنید تا نسبت را ببینید.'
        : 'دو نفر را انتخاب کنید تا ببینید چطور با هم نسبت دارند.'));
    }
    app.appendChild(pickList());
    if (picks.length < 2) { app.appendChild(footLinksLite()); return; }

    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i], b = picks[j];
        const line = between(a, b);
        if (!line) continue;
        const p = el('div', 'verdict', line);
        const wed = (P[a].spouseOf === b) || (P[b].spouseOf === a);
        if (wed) p.appendChild(el('span', 'also',
          'و با هم ازدواج کرده‌اند؛ پس هم از راه خون و هم از راه ازدواج نسبت دارند.'));
        app.appendChild(p);
      }
    }

    const u = K.commonAncestor(picks);
    if (!u) { app.appendChild(el('div', 'lead', t('noLinkFound', 'No link found.'))); app.appendChild(footLinksLite()); return; }
    app.appendChild(el('div', 'lead', t('commonAncestor', 'Common ancestor')));
    app.appendChild(linkBranch(u.lca, u.set));
    app.appendChild(footLinksLite());
  }

  function pickList() {
    const box = el('div', 'picks');
    picks.forEach((id, i) => {
      const r = el('div', 'pick');
      r.appendChild(el('span', 'no', fa(i + 1)));
      const b = el('button', 'pn', nameOf(id)); b.onclick = () => go(id);
      r.appendChild(b);
      const x = el('button', 'rm', '×');
      x.setAttribute('aria-label', t('remove', 'Remove'));
      x.onclick = () => { togglePick(id); render(); };
      r.appendChild(x);
      box.appendChild(r);
    });
    const add = el('button', 'addp', picks.length >= 4 ? t('fourFull', 'Four people already selected') : t('addPerson', 'Add person'));
    if (picks.length >= 4) add.disabled = true; else add.onclick = () => openFinder('add');
    box.appendChild(add);
    return box;
  }

  function linkKids(id, set) {
    return childrenOfBlood(id).filter(k => set.has(k))
      .concat(spousesOf(id).filter(w => set.has(w)));
  }
  function linkBranch(id, set) {
    const wrap = el('div', 'branch');
    const pick = picks.indexOf(id);
    const all = linkKids(id, set);
    const kids = all.filter(k => !P[k].spouseOf);
    const wives = all.filter(k => P[k].spouseOf === id);
    const cls = pick >= 0 ? 'down' : (kids.length > 1 ? 'down' : 'up');
    const node = shieldNode(id, cls, nameOf(id), '', { chosen: pick >= 0 });
    if (pick >= 0) node.insertBefore(el('div', 'tag', fa(pick + 1)), node.firstChild);

    if (wives.length) {
      const row = el('div', 'tier couple');
      row.appendChild(el('div', 'spacer'));
      row.appendChild(node);
      const side = el('div', 'side');
      wives.forEach(w => {
        side.appendChild(el('div', 'bar'));
        const wp = picks.indexOf(w);
        const wn = shieldNode(w, cls, nameOf(w), '', { wed: true, chosen: wp >= 0 });
        if (wp >= 0) wn.insertBefore(el('div', 'tag', fa(wp + 1)), wn.firstChild);
        side.appendChild(wn);
      });
      row.appendChild(side);
      wrap.appendChild(row);
    } else wrap.appendChild(node);

    if (kids.length) {
      wrap.appendChild(el('div', 'stem'));
      const row = el('div', 'brow');
      kids.forEach(k => {
        const b = linkBranch(k, set);
        b.insertBefore(el('div', 'vstem'), b.firstChild);
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function footLinksLite() {
    const f = el('div', 'foot');
    const back = el('button', 'accent', t('backTo', 'Back to') + ' ' + nameOf(cur));
    back.onclick = () => { view = 'person'; syncHash(); render(); };
    f.appendChild(back);
    if (picks.length >= 2) {
      const pdf = el('button', '', t('savePdf', 'Save as PDF'));
      pdf.onclick = () => printPage(t('kinshipPdfTitle', 'Family kinship'), true);
      f.appendChild(pdf);
    }
    return f;
  }

  /* ---- یافتن: browse first, search as refinement ---------------------------- */
  function openFinder(mode) {
    finderMode = mode || 'go';
    finderAt = (P[cur] && cur !== 'ROOT' && childrenOfBlood(cur).length) ? cur : 'ROOT';
    $('fq').value = '';
    $('finder').classList.add('on');
    drawFinder();
    try { $('finder').scrollTo({ top: 0 }); } catch { $('finder').scrollTop = 0; }
  }
  const closeFinder = () => $('finder').classList.remove('on');

  function drawFinder() {
    const body = $('fbody'), trail = $('ftrail');
    const q = ($('fq').value || '').trim();
    body.innerHTML = ''; trail.innerHTML = '';

    if (q) {                                   /* search: a refinement, not the door */
      const norm = s => (s || '').replace(/[\u064A\u0649]/g, 'ی').replace(/\u0643/g, 'ک')
        .replace(/[\u064B-\u0652\u200c]/g, '').replace(/[\u0622\u0623\u0625]/g, 'ا')
        .trim().toLowerCase();
      const qn = norm(q);
      const a = [], b = [], a2 = [], b2 = [];
      for (const id in P) {
        const i = norm(nameOf(id)).indexOf(qn);
        if (i < 0) continue;
        const stub = P[id].origin === 'name-only';
        (i === 0 ? (stub ? a2 : a) : (stub ? b2 : b)).push(id);
      }
      const res = a.concat(b, a2, b2);
      body.appendChild(el('div', 'empty', res.length ? tFill('resultsN', { n: fa(res.length) }) : t('noNameMatch', 'No one with that name.')));
      res.slice(0, 200).forEach(id => body.appendChild(resultRow(id)));
      return;
    }

    chain(finderAt).forEach((k, i) => {         /* where you are, and every level back */
      if (i) trail.appendChild(el('span', 'sep', '›'));
      if (k === finderAt) trail.appendChild(el('span', 'here', nameOf(k)));
      else { const b = el('button', '', nameOf(k)); b.onclick = () => { finderAt = k; drawFinder(); }; trail.appendChild(b); }
    });

    if (finderAt !== 'ROOT') {
      const enter = el('button', 'enter', tFill('viewPage', { name: nameOf(finderAt) }));
      enter.onclick = () => choose(finderAt);
      body.appendChild(enter);
    }
    const kids = childrenOfBlood(finderAt);
    const grid = el('div', 'grid');
    kids.forEach(k => grid.appendChild(cell(k)));
    const gap = (3 - kids.length % 3) % 3;
    if (gap) { const f = el('div', 'fill'); f.style.gridColumn = 'span ' + gap; grid.appendChild(f); }
    body.appendChild(kids.length ? grid : el('div', 'empty', t('noChildren', 'No children recorded')));
  }

  function cell(id) {
    const n = childrenOfBlood(id).length;
    const pick = picks.indexOf(id);
    const c = el('button', 'cell' + (pick >= 0 ? ' picked' : ''));
    const g = el('div', 'cg'); g.innerHTML = markSVG(sexOf(id), 22); c.appendChild(g);
    c.appendChild(el('div', 'cn', nameOf(id)));
    c.appendChild(el('div', 'cs', P[id].origin === 'name-only' ? t('noRecord', 'No record')
      : n ? tFill('childCount', { n: fa(n) }) : '—'));
    if (pick >= 0) c.appendChild(el('div', 'cnum', fa(pick + 1)));
    c.onclick = () => n ? (finderAt = id, drawFinder()) : choose(id);
    return c;
  }

  function resultRow(id) {
    const path = chain(id).slice(1, -1).map(nameOf).join(' › ');
    const r = el('button', 'res' + (picks.includes(id) ? ' on' : ''));
    r.appendChild(el('div', 'rn2', nameOf(id)));
    r.appendChild(el('div', 'rp', path || '—'));
    r.onclick = () => choose(id);
    return r;
  }

  function choose(id) {
    if (finderMode === 'add') {
      if (!togglePick(id)) { alert(t('picksFull', 'چهار نفر کامل است. اول یکی را بردارید.')); return; }
      closeFinder(); view = 'link'; syncHash(); render();
      return;
    }
    closeFinder(); go(id);
  }

  /* ---- about ---------------------------------------------------------------- */
  function renderAbout(app) {
    const w = el('div', 'about');
    const m = document.createElement('img');
    m.className = 'mark'; m.src = assets.legend; m.alt = t('legendAlt', 'Gender marks');
    w.appendChild(m);
    w.appendChild(el('h2', '', t('aboutTitle', 'About this tree')));

    const sec = (title, paras) => {
      const s = el('section');
      s.appendChild(el('h3', '', title));
      (paras || []).filter(Boolean).forEach(p => s.appendChild(el('p', '', p)));
      w.appendChild(el('div', 'girih'));
      w.appendChild(s);
      return s;
    };

    const marksSec = sec(t('marksSection', 'Marks'), [
      t('marksIntro', 'Icons mark male, female, unspecified, and the tree root.'),
    ]);
    const key = el('div', 'marks-key');
    [
      ['m', t('markMale', 'Male')],
      ['f', t('markFemale', 'Female')],
      [null, t('markUnknown', 'Unspecified')],
    ].forEach(([sex, name]) => {
      const item = el('div', 'marks-item');
      const icon = el('div', 'marks-icon');
      icon.innerHTML = markSVG(sex, 36);
      item.appendChild(icon);
      item.appendChild(el('div', 'marks-name', name));
      key.appendChild(item);
    });
    {
      const item = el('div', 'marks-item');
      const icon = el('div', 'marks-icon');
      icon.innerHTML = rootMarkSVG(36);
      item.appendChild(icon);
      item.appendChild(el('div', 'marks-name', t('markRoot', 'Root')));
      key.appendChild(item);
    }
    const intro = marksSec.querySelector('p');
    if (intro) marksSec.insertBefore(key, intro);
    else marksSec.appendChild(key);

    const total = archive.people.filter(p => p.id !== 'ROOT').length;
    sec(t('treeStatsTitle', 'This tree'), [
      tFill('treeStatsP1', { total: fa(total) }),
      t('originP1', 'The family builds and keeps this tree. Add people and photos with the editor.'),
    ]);

    const back = el('div', 'foot');
    const b = el('button', 'accent', t('backTo', 'Back to') + ' ' + nameOf(cur));
    b.onclick = () => { view = 'person'; syncHash(); render(); };
    back.appendChild(b);
    w.appendChild(back);
    app.appendChild(w);
  }

  /* ---- print ----------------------------------------------------------------- */
  let printWide = false;
  function printPage(title, wide) {
    printWide = !!wide;
    $('phead').innerHTML = `<img src="${assets.emblem}" alt=""><div class="t">${title}</div>`;
    $('pfoot').style.display = '';
    const old = $('pagestyle'); if (old) old.remove();
    if (wide) {
      const s = document.createElement('style'); s.id = 'pagestyle';
      s.textContent = '@media print{@page{size:A4 landscape;margin:12mm}}';
      document.head.appendChild(s);
    }
    setTimeout(() => window.print(), 60);
  }
  /* scale to one sheet on the way in, undo on the way out, so the screen is
     never left holding a shrunken layout */
  function fitToPage() {
    const box = $('app'); if (!box) return;
    box.style.zoom = '';
    const mm = n => n / 25.4 * 96;
    const availW = printWide ? mm(297 - 24) : mm(210 - 28);
    let availH = printWide ? mm(210 - 24) : mm(297 - 32);
    availH -= ($('phead').offsetHeight || 0) + ($('pfoot').offsetHeight || 0) + mm(12);
    let z = 1;
    for (let pass = 0; pass < 2; pass++) {
      const w = box.scrollWidth, h = box.scrollHeight;
      if (!w || !h) break;
      z = Math.max(0.4, Math.min(1, Math.min(availW / w, availH / h) * z));
      box.style.zoom = z < 1 ? z.toFixed(3) : '';
      if (z >= 1) break;
    }
  }
  function resetPrint() {
    const s = $('pagestyle'); if (s) s.remove();
    const box = $('app'); if (box) box.style.zoom = '';
    $('pfoot').style.display = 'none';
  }
  window.addEventListener('beforeprint', fitToPage);
  window.addEventListener('afterprint', resetPrint);
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    const h = e => e.matches ? fitToPage() : resetPrint();
    if (mq.addEventListener) mq.addEventListener('change', h);
    else if (mq.addListener) mq.addListener(h);
  }

  /* ---- corrections ------------------------------------------------------------ */
  function reportError(id) {
    const p = P[id];
    const txt = t('reportHeader', 'Family tree correction') + '\n\n'
      + t('reportName', 'Name') + ': ' + nameOf(id) + '\n'
      + t('reportId', 'Id') + ': ' + id
      + (p.parent && P[p.parent] ? '\n' + t('reportChildOf', 'Child of') + ': ' + nameOf(p.parent) : '')
      + '\n\n' + t('reportWhatWrong', 'What is wrong:') + '\n';
    if (navigator.share) navigator.share({ title: t('reportTitle', 'Correction'), text: txt }).catch(() => {});
    else if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(() => alert(t('copied', 'Copied.')));
    else prompt(t('copyPrompt', 'Copy this text and send it:'), txt);
  }

  /* ---- shell -------------------------------------------------------------------- */
  function render() {
    $('whoName').textContent = me ? nameOf(me) : t('youUnset', 'Not set');
    const app = $('app'); app.innerHTML = '';
    if (!P[cur]) cur = 'ROOT';
    if (view === 'about') renderAbout(app);
    else if (view === 'link') renderLink(app);
    else if (view === 'tree') renderTree(app);
    else renderPerson(app);
  }

  $('whoBtn').onclick = () => { if (me) go(me); else openFinder('go'); };
  $('findBtn').onclick = () => openFinder('go');
  $('fclose').textContent = '×';
  $('fclose').setAttribute('aria-label', t('close', 'Close'));
  $('fclose').onclick = closeFinder;
  $('fq').addEventListener('input', drawFinder);
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const v = $('docview');
    if (v && v.classList.contains('on')) { v.classList.remove('on'); return; }
    closeFinder();
  });
  function onRoute() {
    if (readHash()) { render(); restoreScroll(); }
  }
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);

  readHash();
  render();
  if (!me) setTimeout(() => openFinder('go'), 400);

  return { go, render, openFinder, K };
}
