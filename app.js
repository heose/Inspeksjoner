'use strict';
/* Argus – offline inspeksjonsapp. Data lagres i IndexedDB på enheten. */

/* ---------- Innhold (sjekklister, bygg, anlegg) ----------
   Ligger ikke i appen. Lastes fra Hub etter at Hub-koden er lagt inn, og lagres lokalt så alt virker uten nett. */
let TEMPLATES = [], TPL = {}, SITES = [], ANLEGG = [], ANL = {}, TRELLO = { done: '', board: '', lists: {} }, LINKS_DEFAULT = [];
const listKey = (ins, key) => { const t = TPL[ins.templateId]; return ins.tl || findItem(t, key).sec?.tl || t.tl; };
function applyContent(src) {
  const c = new Function(src)();
  if (!c || !Array.isArray(c.TEMPLATES) || !Array.isArray(c.SITES) || !Array.isArray(c.ANLEGG) || !c.TRELLO) throw new Error('Ugyldig innholdsfil');
  TEMPLATES = c.TEMPLATES; TRELLO = c.TRELLO; SITES = c.SITES; ANLEGG = c.ANLEGG; LINKS_DEFAULT = Array.isArray(c.LINKS) ? c.LINKS : [];
  TPL = Object.fromEntries(TEMPLATES.map(t => [t.id, t])); ANL = Object.fromEntries(ANLEGG.map(a => [a.id, a]));
}


const TYPES = {
  ok:  { opts: ['Ok', 'Ikke OK', 'N/A'], flag: ['Ikke OK'] },
  okm: { opts: ['Ok', 'Ikke OK', 'Merknad', 'N/A'], flag: ['Ikke OK'] },
  yn:  { opts: ['Ja', 'Nei', 'N/A'], flag: ['Nei'] },
};
const CHOICE_TYPES = ['yn', 'ok', 'okm', 'choice'];

/* ---------- Hjelpere ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APP_VERSION = '2026-11-01 å9';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayISO = () => iso(new Date());
const fmt = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = parseISO(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- Lagring (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('oseberg-inspeksjon', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('inspections', { keyPath: 'id' });
        d.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      let out;
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all(s) { return this.req(s, 'readonly', st => st.getAll()); },
  get(s, id) { return this.req(s, 'readonly', st => st.get(id)); },
  put(s, v) { return this.req(s, 'readwrite', st => st.put(v)); },
  del(s, id) { return this.req(s, 'readwrite', st => st.delete(id)); },
};

const S = {
  inbox: null, ibEdit: {}, inboxPics: {},
  ins: {}, cur: null, view: 'home', ready: false, error: null,
  settings: { by: 'Henrik Oseberg', company: 'Oseberg Drift og Service' },
  pickKey: null, ready_file: null, confirmFinish: false, showAllHist: false, showSettings: false, busy: false,
};
try { Object.assign(S.settings, JSON.parse(localStorage.getItem('insp-settings') || '{}')); } catch (e) {}
S.settings.notes = S.settings.notes || {};
S.settings.trello = S.settings.trello || {};
S.settings.hub = S.settings.hub || {};
S.hubMonths = {};
try { const o = JSON.parse(localStorage.getItem('insp-hub') || 'null'); if (o && o.months) S.hubMonths = o.months; else if (o && o.ym) S.hubMonths = { [o.ym]: { rows: o.rows || [], at: o.at || 0 } }; } catch (e) { S.hubMonths = {}; }
try { S.hubRev = localStorage.getItem('insp-rev') || null; } catch (e) { S.hubRev = null; }
S.hubActs = {};
try { const o = JSON.parse(localStorage.getItem('insp-acts') || 'null'); if (o && o.items) S.hubActs = o.items; } catch (e) { S.hubActs = {}; }
const saveSettings = () => { try { localStorage.setItem('insp-settings', JSON.stringify(S.settings)); } catch (e) {} };
try { const c = JSON.parse(localStorage.getItem('insp-content') || 'null'); if (c && c.src) { applyContent(c.src); S.contentAt = c.at; } } catch (e) { console.error('Innhold', e); }
try { const c = JSON.parse(localStorage.getItem('insp-links') || 'null'); if (c && Array.isArray(c.links)) { S.links = c.links; S.linksAt = c.at; } } catch (e) { console.error('Lenker', e); }

const timers = {}; const chains = {};
function touch(ins) { ins.updatedAt = Date.now(); scheduleSave(ins.id); }
function scheduleSave(id) {
  setStatus('Lagrer…');
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => flush(id), 400);
}
function flush(id) {
  clearTimeout(timers[id]); delete timers[id];
  const ins = S.ins[id]; if (!ins) return Promise.resolve();
  chains[id] = (chains[id] || Promise.resolve()).then(() => DB.put('inspections', clone(ins)))
    .then(() => setStatus('Lagret'))
    .catch(e => { setStatus('Ikke lagret'); toast('Kunne ikke lagre: ' + (e && e.message || e)); });
  return chains[id];
}
function flushAll() { return Promise.all(Object.keys(timers).map(flush)); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);

/* ---------- Logikk ---------- */
const optsOf = it => it.options || (TYPES[it.type] ? TYPES[it.type].opts : []);
const flagsOf = it => it.flag || (TYPES[it.type] ? TYPES[it.type].flag : []);
const isoOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const deadlineOf = (it, v) => !isoOk(v) ? null : it.expiry ? v : it.yearly ? addMonths(v, 12) : null;
function isFlag(it, a) {
  if (!a || a.value == null || a.value === '') return false;
  if (it.type === 'date') { const dl = deadlineOf(it, a.value); return !!dl && dl < todayISO(); }
  return flagsOf(it).includes(a.value);
}
function toneFor(it, v) {
  if (isFlag(it, { value: v })) return 'bad';
  if (v === 'N/A' || v === 'Merknad' || it.neutral) return 'na';
  if (it.type === 'choice' || it.type === 'multi') return 'sel';
  return 'ok';
}
function secVisible(sec, ins) {
  const c = sec.showIf; if (!c) return true;
  if (c.legacy) return Object.keys(ins.answers).some(k => k.startsWith(c.legacy + '#') || k.startsWith(c.legacy + '.'));
  const v = ins.answers[c.item]?.value;
  if (c.includes) return Array.isArray(v) ? v.includes(c.includes) : !!c.orUnset && v == null;   // orUnset: vises også når «Hvilket sted» aldri er besvart (nye VK-inspeksjoner)
  return true;
}
function itemVisible(it, ins, prefix) {
  const c = it.showIf; if (!c) return true;
  const v = ins.answers[prefix + '.' + c.item]?.value;
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return v !== c.ne;
  return true;
}
const instCount = (sec, ins) => sec.repeat ? (ins.repeats?.[sec.id] ?? sec.defaultCount ?? 1) : 1;
const prefixOf = (sec, i) => sec.repeat ? sec.id + '#' + i : sec.id;
function* walk(tpl, ins) {
  for (const sec of tpl.sections) {
    if (!secVisible(sec, ins)) continue;
    const n = instCount(sec, ins);
    for (let i = 0; i < n; i++) {
      const p = prefixOf(sec, i);
      for (const it of sec.items) if (itemVisible(it, ins, p)) yield { sec, i, it, key: p + '.' + it.id };
    }
  }
}
function stats(ins) {
  const r = { flags: 0, actions: 0, open: 0, unanswered: 0, total: 0, photos: 0 };
  for (const x of walk(TPL[ins.templateId], ins)) {
    if (x.it.type === 'heading' || x.it.type === 'info') continue;
    const a = ins.answers[x.key];
    if (isFlag(x.it, a)) r.flags++;
    const acts = a?.actions || [];
    r.actions += acts.length; r.open += acts.filter(z => !z.done).length;
    r.photos += (a?.photos || []).length;
    if (['yn', 'ok', 'okm', 'choice', 'multi', 'number'].includes(x.it.type)) {
      r.total++;
      const v = a?.value;
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) r.unanswered++;
    }
  }
  return r;
}
function findItem(tpl, key) {
  const [p, id] = key.split('.');
  const secId = p.split('#')[0];
  const sec = tpl.sections.find(s => s.id === secId);
  return { sec, it: sec?.items.find(i => i.id === id), inst: p.includes('#') ? +p.split('#')[1] : 0 };
}
function prevValue(ins, key) {
  const list = Object.values(S.ins).filter(i => i.id !== ins.id && i.templateId === ins.templateId && i.status === 'complete' && (i.date || '') <= (ins.date || '9'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  for (const i of list) { const v = i.answers[key]?.value; if (v != null && v !== '') return v; }
  return null;
}
const freqLabel = t => t.days === 7 ? 'Ukentlig' : t.months === 1 ? 'Månedlig' : t.months === 3 ? 'Kvartalsvis' : t.months === 6 ? 'Halvårlig' : 'Hver ' + t.months + '. mnd';
/* Kalenderperioder: måned, kvartal og halvår følger kalenderen. Blå ved start, gul fra 20., rød fra 29. (eller siste dag i kort måned) i utløpsmåneden. */
const PERIOD_THIS = { 1: 'denne måneden', 3: 'dette kvartalet', 6: 'dette halvåret' };
const monthIdx = s => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };
const periodOf = (s, m) => Math.floor(monthIdx(s) / m);
const periodStart = (p, m) => { const mi = p * m; return `${String(Math.floor(mi / 12)).padStart(4, '0')}-${String(mi % 12 + 1).padStart(2, '0')}-01`; };
const periodEnd = (p, m) => addDays(periodStart(p + 1, m), -1);
function dueInfo(t, last) {
  if (!last) return { cls: 'na', text: 'Ikke utført i appen ennå' };
  if (t.days || !PERIOD_THIS[t.months]) {
    const next = t.days ? addDays(last.date, t.days) : addMonths(last.date, t.months);
    const d = daysBetween(todayISO(), next);
    if (d < 0) return { cls: 'bad', text: 'Forfalt ' + fmt(next), date: next };
    if (d <= (t.days ? 2 : 7)) return { cls: 'warn', text: 'Forfaller ' + fmt(next), date: next };
    return { cls: 'ok', text: 'Neste ' + fmt(next), date: next };
  }
  const m = t.months, today = todayISO(), pNow = periodOf(today, m), pLast = periodOf(last.date, m);
  if (pLast >= pNow) { const nx = periodStart(pNow + 1, m); return { cls: 'ok', text: 'Neste fra ' + fmt(nx), date: nx }; }
  if (pLast < pNow - 1) { const e = periodEnd(pLast + 1, m); return { cls: 'bad', text: 'Forfalt ' + fmt(e), date: e }; }
  const end = periodEnd(pNow, m);
  if (monthIdx(today) !== (pNow + 1) * m - 1) return { cls: 'blue', text: 'Frist ' + fmt(end), date: end };
  const day = Number(today.slice(8, 10));
  if (day >= 29 || today === end) return { cls: 'bad', text: 'Forfaller ' + fmt(end), date: end };
  if (day >= 20) return { cls: 'warn', text: 'Forfaller ' + fmt(end), date: end };
  return { cls: 'blue', text: 'Frist ' + fmt(end), date: end };
}
const covOf = (c, ins) => c.t === ins.templateId || (c.alt || []).includes(ins.templateId);   // alt: eldre mal-id som fortsatt teller (VK/SVK ble delt i å9)
function covMatch(c, key, ins) {
  const dot = key.indexOf('.'), p = key.slice(0, dot), id = key.slice(dot + 1), sec = p.split('#')[0];
  if (c.x.includes(id)) return false;
  if (!c.k.some(k => k === sec || k === sec + '.' + id)) return false;
  if (c.w && ins.answers[p + '.' + c.w[0]]?.value !== c.w[1]) return false;
  return true;
}
function covItems(c, ins) {
  const t = TPL[c.t], out = [];
  for (const x of walk(t, ins)) if (x.it.type !== 'heading' && x.it.type !== 'info' && covMatch(c, x.key, ins)) out.push(x);
  return out;
}
const answered = a => a && a.value != null && a.value !== '' && !(Array.isArray(a.value) && !a.value.length);
const unresolved = a => !(a.actions || []).length || a.actions.some(z => !z.done);
let anlCache = null, openCache = null;
function anlState(a) {
  anlCache ||= {};
  if (anlCache[a.id]) return anlCache[a.id];
  const all = Object.values(S.ins);
  const done = all.filter(i => i.status === 'complete').sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.updatedAt - x.updatedAt);
  const covs = [], hist = [], open = [];
  for (const c of a.cov) {
    const t = TPL[c.t]; let last = null, lastFlags = [];
    for (const i of done) {
      if (!covOf(c, i)) continue;
      const items = covItems(c, i).filter(x => answered(i.answers[x.key]) || (i.answers[x.key]?.actions || []).length);
      if (!items.length) continue;
      const flags = items.filter(x => isFlag(x.it, i.answers[x.key]));
      hist.push({ i, t, n: items.length, flags });
      if (!last) { last = i; lastFlags = flags.filter(x => unresolved(i.answers[x.key])); }
    }
    for (const i of all) if (covOf(c, i)) for (const [key, ans] of Object.entries(i.answers))
      for (const act of ans.actions || []) if (!act.done && covMatch(c, key, i)) open.push(locItem(i, key, act));
    let remote = null; const ck = a.id + '|' + a.cov.indexOf(c);
    for (const r of hubRows()) if (Array.isArray(r.ac) && r.ac.includes(ck) && r.date && (!remote || r.date > remote)) remote = r.date;
    const lastDate = last && (!remote || last.date >= remote) ? last.date : remote;
    const next = lastDate ? (t.days ? addDays(lastDate, t.days) : addMonths(lastDate, t.months)) : null;
    covs.push({ c, t, last, lastDate, flags: lastFlags, next, du: dueInfo(t, lastDate ? { date: lastDate } : null), d: next ? daysBetween(todayISO(), next) : null, draft: all.find(i => i.templateId === c.t && i.status !== 'complete') });
  }
  for (const i of all) if (i.anl === a.id) {
    const acts = Object.entries(i.answers).flatMap(([key, ans]) => (ans.actions || []).map(act => ({ key, act })));
    for (const { key, act } of acts) if (!act.done) open.push(locItem(i, key, act));
    if (i.status === 'complete') hist.push({ i, t: TPL.avvik, n: 1, flags: acts.map(z => ({ it: { label: (z.act.text || 'Avvik').split('\n')[0] } })) });
  }
  for (const x of openAll()) if (x.rec && x.anl.includes(a.id)) open.push(x);
  hist.sort((x, y) => (y.i.date || '').localeCompare(x.i.date || ''));
  const dated = covs.filter(x => x.lastDate).sort((x, y) => rank[x.du.cls] - rank[y.du.cls] || (x.du.date || '').localeCompare(y.du.date || ''));
  const worst = dated[0], nextDue = worst?.du.date || null;
  const nflag = covs.reduce((n, x) => n + x.flags.length, 0);
  let cls, text;
  if (open.length || nflag) { cls = 'bad'; text = [open.length ? open.length + (open.length === 1 ? ' åpen handling' : ' åpne handlinger') : '', nflag ? nflag + ' avvik' : ''].filter(Boolean).join(' · '); }
  else if (!worst) { cls = 'na'; text = 'Ikke kontrollert i Argus ennå'; }
  else { cls = worst.du.cls; text = worst.du.text; }
  if (cls === 'bad' && worst && worst.du.cls === 'bad' && (open.length || nflag)) text += ' · forfalt';
  return (anlCache[a.id] = { covs, hist, open, nextDue, cls, text });
}
const A = (ins, key) => (ins.answers[key] ||= {});
const cur = () => S.ins[S.cur];

function newInspection(tid) {
  const t = TPL[tid], date = todayISO();
  const ins = { id: uid(), templateId: tid, site: t.site, date, by: S.settings.by, status: 'draft', answers: {}, repeats: {}, createdAt: Date.now(), updatedAt: Date.now() };
  for (const sec of t.sections) for (const it of sec.items) if (it.auto === 'septApril') {
    const m = new Date().getMonth() + 1;
    ins.answers[prefixOf(sec, 0) + '.' + it.id] = { value: (m >= 9 || m <= 4) ? 'Ja' : 'Nei' };
  }
  const prev = Object.values(S.ins).filter(i => i.templateId === tid && i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt)[0];
  if (prev) for (const sec of t.sections) for (const it of sec.items) if (it.carry) {
    const k = prefixOf(sec, 0) + '.' + it.id, v = prev.answers[k]?.value;
    if (v) ins.answers[k] = { value: v };
  }
  S.ins[ins.id] = ins; flush(ins.id);
  openIns(ins.id);
}
function openSite(id) { S.site = id; S.anlOpen = false; S.anl = null; S.cur = null; S.showAllHist = false; S.view = 'site'; render(); window.scrollTo(0, 0); }
function openAnl(id) { S.anl = id; S.site = ANL[id].site; S.view = 'anl'; S.cur = null; render(); window.scrollTo(0, 0); }
function avSite(ins) {
  const site = SITES.find(x => x.id === ins.siteId);
  ins.tl = site?.tl;
  ins.site = [site?.name, ins.anl && ANL[ins.anl] ? ANL[ins.anl].name : ins.annet ? 'Annet' : '', (ins.where || '').trim()].filter(Boolean).join(' – ');
}
function newAvvik(o = {}) {
  const siteId = o.anl ? ANL[o.anl].site : (o.site || S.settings.lastSite || null), id = uid();
  const ins = { id: uid(), templateId: 'avvik', siteId, anl: o.anl || null, annet: false, where: '', date: todayISO(), by: S.settings.by, status: 'draft',
    answers: { 'avvik.feil': { actions: [{ id, text: '', due: addDays(todayISO(), 14), who: S.settings.by, prio: 'Middels', done: false }] } }, repeats: {}, createdAt: Date.now(), updatedAt: Date.now() };
  avSite(ins);
  S.ins[ins.id] = ins; flush(ins.id); openIns(ins.id);
  S.pickKey = 'avvik.feil'; $('#filepick').click();
}
function openIns(id) { S.cur = id; S.view = 'ins'; S.confirmFinish = false; render(); window.scrollTo(0, 0); }
function goHome(root) { flushAll(); syncTrello(); if (root) { S.anl = null; S.site = null; } S.cur = null; S.view = S.anl ? 'anl' : S.site ? 'site' : 'home'; render(); window.scrollTo(0, 0); }

/* ---------- Visning ---------- */
const app = $('#app');
function setStatus(t) { const el = $('#save-status'); if (el) el.textContent = t; }
let toastTimer;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }

function render() {
  anlCache = null; openCache = null;
  const bar = $('#topbar');
  if (S.view === 'anl' && ANL[S.anl] && S.ready) {
    bar.innerHTML = `<button class="back" data-act="to-site" aria-label="Tilbake til bygget">‹ ${SITES.find(x => x.id === ANL[S.anl].site).short}</button><div class="bar-title">${esc(ANL[S.anl].name)}</div><div class="bar-status"></div>`;
    app.innerHTML = renderAnl();
  } else if (S.view === 'site' && S.site && S.ready) {
    bar.innerHTML = `<button class="back" data-act="home-root" aria-label="Tilbake til byggene">‹ Bygg</button><div class="bar-title">${esc(SITES.find(x => x.id === S.site).name)}</div><div class="bar-status"></div>`;
    app.innerHTML = renderSite();
  } else if (S.view === 'inbox' && S.ready) {
    bar.innerHTML = `<button class="back" data-act="home-root" aria-label="Tilbake til oversikten">‹ Oversikt</button><div class="bar-title">Innmeldinger</div><div class="bar-status"></div>`;
    app.innerHTML = renderInbox();
  } else if (S.view === 'links' && S.ready) {
    bar.innerHTML = `<button class="back" data-act="home-root" aria-label="Tilbake til oversikten">‹ Oversikt</button><div class="bar-title">Del lenker</div><div class="bar-status"></div>`;
    app.innerHTML = renderLinks();
  } else if (S.view === 'ins' && cur()) {
    const t = TPL[cur().templateId];
    bar.innerHTML = `<button class="back" data-act="home" aria-label="Tilbake">‹ ${S.anl && ANL[S.anl] ? 'Anlegg' : S.site ? SITES.find(x => x.id === S.site).short : 'Oversikt'}</button><div class="bar-title">${esc(t.name)}</div><div class="bar-status" id="save-status">Lagret</div>`;
    app.innerHTML = renderIns();
  } else {
    bar.innerHTML = `<div class="brand"><span class="brand-name">Argus</span><span class="brand-co">${esc(S.settings.company)}</span></div><button class="ghost-sm" data-act="settings">${S.showSettings ? 'Lukk' : 'Innstillinger'}</button>`;
    app.innerHTML = S.ready ? renderHome() : (S.error ? `<p class="empty">${esc(S.error)}</p>` : '<p class="empty">Laster…</p>');
  }
  renderSheet();
  hydratePhotos();
}

function installHint() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone || !ios) return '';
  return `<div class="notice"><strong>Installer før du starter.</strong> Trykk på Del-knappen i Safari og velg «Legg til på Hjem-skjerm». Appen på hjemskjermen har egen lagring og virker uten dekning, så inspeksjoner du lager her i Safari blir ikke med dit.</div>`;
}

function renderGate() {
  const h = S.settings.hub;
  return `<section class="panel"><h2 class="h2">Koble til Argus Hub</h2>
    <p class="muted small">Sjekklister og bygg lastes fra Hub etter at du har lagt inn koden. Du får adresse og kode av den som administrerer Argus. Alt du har gjort på denne telefonen ligger trygt og kommer tilbake når du er koblet til.</p>
    <label class="fld"><span>Hub-adresse</span><input data-hub="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…workers.dev" value="${esc(h.url || '')}"></label>
    <label class="fld"><span>Hub-kode</span><input type="password" data-hub="code" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(h.code || '')}"></label>
    ${S.gateErr || S.hubErrMsg ? `<p class="t-bad small">${esc(S.gateErr || S.hubErrMsg)}</p>` : ''}
    <div class="row-btns"><button class="btn primary" data-act="gate-connect">${S.hubBusy ? 'Kobler til…' : 'Koble til'}</button></div>
    <p class="muted small">Administrator: <button class="link" data-act="content-upload">last opp innholdsfil</button></p></section>`;
}
function renderHome() {
  if (!TEMPLATES.length) return renderGate();
  const all = Object.values(S.ins);
  const drafts = all.filter(i => i.status !== 'complete').sort((a, b) => b.updatedAt - a.updatedAt);
  const done = all.filter(i => i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  let h = installHint();

  if (S.showSettings) {
    h += `<section class="panel settings"><h2 class="h2">Innstillinger</h2>
      <label class="fld"><span>Ditt navn (utført av, ansvarlig)</span><input id="set-by" data-set="by" value="${esc(S.settings.by)}"></label>
      <label class="fld"><span>Firmanavn i rapporter</span><input id="set-co" data-set="company" value="${esc(S.settings.company)}"></label>
      <h3 class="h3">Trello</h3>
      ${hubCfg() ? `<p class="muted small">Trello går via Argus Hub, så du trenger ikke nøkkel eller token her. Handlinger fra fullførte inspeksjoner sendes som kort til tavlen Vaktmester, i listen for riktig bygg.</p>
      <div class="row-btns"><button class="btn" data-act="tr-test">Test tilkobling</button></div>
      <p class="muted small">${trelloPending().n} handlinger venter på sending.</p>` : `<p class="muted small">Handlinger fra fullførte inspeksjoner sendes som kort til tavlen Vaktmester, i listen for riktig bygg. Nøkkel og token lagres bare på denne telefonen og tas ikke med i sikkerhetskopien.</p>
      <label class="fld"><span>API-nøkkel</span><input id="tr-key" data-trello="key" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.trello.key || '')}"></label>
      <label class="fld"><span>Token</span><input id="tr-token" type="password" data-trello="token" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.trello.token || '')}"></label>
      <div class="row-btns"><button class="btn" data-act="tr-token">Hent token</button><button class="btn" data-act="tr-test">Test tilkobling</button></div>
      <p class="muted small">${trelloCfg() ? trelloPending().n + ' handlinger venter på sending.' : 'Ikke koblet til ennå.'}</p>
      <details class="how"><summary>Slik får du nøkkel og token</summary><ol>
        <li>Åpne <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener">trello.com/power-ups/admin</a> og velg Create new Power-Up. Navn: Argus. Velg arbeidsområdet ditt og fyll inn e-post. Feltet for iframe-adresse kan stå tomt.</li>
        <li>Åpne Power-Up-en, velg API key og trykk Generate a new API key. Kopier nøkkelen hit.</li>
        <li>Under Allowed origins legger du til <b>https://argus.osebergdrift.no</b> og lagrer.</li>
        <li>Trykk Hent token her, trykk Allow i Trello, og kopier token-teksten hit.</li>
      </ol></details>`}
      <h3 class="h3">Argus Hub</h3>
      <p class="muted small">Delt logg over fullførte inspeksjoner og PDF-rapporter. Samme adresse og kode brukes på alle enheter. Lagres bare på denne telefonen og tas ikke med i sikkerhetskopien.</p>
      <label class="fld"><span>Hub-adresse</span><input id="hub-url" data-hub="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://argus-hub.navn.workers.dev" value="${esc(S.settings.hub.url || '')}"></label>
      <label class="fld"><span>Hub-kode</span><input id="hub-code" type="password" data-hub="code" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.hub.code || '')}"></label>
      <div class="row-btns"><button class="btn" data-act="hub-test">Test Hub</button><button class="btn" data-act="hub-sync">Oppdater nå</button></div>
      <p class="muted small">Innhold (sjekklister og anlegg): ${S.contentAt ? 'hentet fra Hub ' + new Date(S.contentAt).toLocaleDateString('nb-NO') : 'ikke hentet'}. <button class="link" data-act="content-upload">Last opp innholdsfil (administrator)</button></p>
      <h3 class="h3">Koder og lokale notater</h3>
      <p class="muted small">Lagres bare på denne telefonen. Vises øverst i sjekklisten, men kommer ikke med i PDF-en. Er med i sikkerhetskopien, så oppbevar den privat.</p>
      ${TEMPLATES.filter(t => !t.hidden).map(t => `<label class="fld"><span>${esc(t.name)}</span><textarea class="inp" id="ln-${t.id}" rows="2" data-lnote="${t.id}">${esc(S.settings.notes[t.id] || '')}</textarea></label>`).join('')}
      <p class="muted small">Argus, versjon ${APP_VERSION}</p>
      <div class="row-btns"><button class="btn" data-act="force-update">Hent nyeste versjon</button></div>
      <h3 class="h3">Sikkerhetskopi</h3>
      <p class="muted small">Alt ligger bare på denne telefonen. Ta en kopi jevnlig og legg den i iCloud Drive eller Google Drive.</p>
      <div class="row-btns"><button class="btn" data-act="export">Lag sikkerhetskopi</button><button class="btn" data-act="import">Gjenopprett fra fil</button></div>
    </section>`;
    return h;
  }

  if (drafts.length) {
    h += `<section><h2 class="h2">Pågår</h2><div class="list">${drafts.map(i => {
      const st = stats(i); const t = TPL[i.templateId];
      return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
        <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${esc(i.site)} · ${fmt(i.date)}</span>
        <span class="rc-sub">${st.total - st.unanswered} av ${st.total} besvart${st.flags ? ` · <b class="t-bad">${st.flags} avvik</b>` : ''}</span></button>
        <button class="link danger" data-act="del-ins" data-id="${i.id}">Slett</button></div>`;
    }).join('')}</div></section>`;
  }

  {
    const lb = S.settings.lastBackup, ndone = all.filter(i => i.status === 'complete').length;
    if (ndone && (!lb || daysBetween(lb, todayISO()) >= 7)) h += `<div class="notice backup"><strong>${lb ? `Siste sikkerhetskopi er ${daysBetween(lb, todayISO())} dager gammel.` : 'Du har ikke tatt sikkerhetskopi ennå.'}</strong> Alt ligger bare på denne telefonen. Lagre kopien i iCloud Drive eller Google Drive.<div class="row-btns"><button class="btn primary" data-act="export">Lag sikkerhetskopi nå</button></div></div>`;
  }
  { const nNy = (S.inbox || []).filter(x => x.status === 'ny').length;
    if (nNy) h += `<button class="btn inbox-card" data-act="inbox-open"><span class="inbox-n">${nNy}</span><span>${nNy === 1 ? 'Ny innmelding' : 'Nye innmeldinger'} fra eksterne venter på godkjenning</span><span class="chev" aria-hidden="true">›</span></button>`; }
  h += `<button class="btn avvik-big" data-act="avvik-new">Meld avvik</button>`;
  h += `<button class="btn linkbtn" data-act="links-open"><span>Del lenker og skjema</span><span class="chev" aria-hidden="true">›</span></button>`;
  h += `<section><h2 class="h2">Velg bygg</h2><div class="list">${SITES.map(site => {
    const ss = siteState(site);
    return `<button class="sitebtn" data-act="site" data-id="${site.id}"><span class="dot ${ss.cls}" aria-hidden="true"></span>
      <span class="anl-txt"><span class="site-name">${esc(site.name)} <span class="count">${site.short}</span></span>
      <span class="rc-sub ${ss.cls === 'bad' ? 't-bad' : ''}">${esc(ss.text)}</span><span class="rc-sub">${esc(ss.rounds)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  }).join('')}</div>${trelloHomeLine()}</section>`;
  { const all = allOpen();
    if (all.length) { const shown = S.showAllAct ? all : all.slice(0, 6);
      h += `<section><h2 class="h2">Åpne handlinger <span class="count">${all.length}</span></h2><div class="list">${shown.map(x => actLine(x, true)).join('')}</div>${all.length > 6 && !S.showAllAct ? `<button class="link more" data-act="act-all">Vis alle ${all.length}</button>` : ''}</section>`; } }
  h += recentHtml(null);
  return h;
}

const rank = { bad: 0, warn: 1, blue: 2, ok: 3, na: 4 };
const PRIO_RANK = { 'Høy': 0, 'Middels': 1, 'Lav': 2 }, PRIO_CLS = { 'Høy': 'hoy', 'Middels': 'mid', 'Lav': 'lav' };
const actSort = (x, y) => (PRIO_RANK[x.prio] ?? 3) - (PRIO_RANK[y.prio] ?? 3) || (x.due || '9').localeCompare(y.due || '9');
/* En handling er enten lokal (ligger i en inspeksjon på denne telefonen) eller delt (kommer fra en annen telefon via Hub). */
const locItem = (i, key, act) => ({ id: act.id, text: act.text || '', prio: act.prio || 'Lav', due: act.due || '', tplName: TPL[i.templateId]?.name || '', date: i.date, siteId: actSite(i, key) || insSite(i) || '', by: i.by || '', anl: [], local: { i, key, act }, rec: null });
const remItem = r => ({ id: r.id, text: r.text || '', prio: r.prio || 'Lav', due: r.due || '', tplName: r.tpl || '', date: r.date, siteId: r.siteId || '', by: r.by || '', anl: r.anl || [], local: null, rec: r });
function openAll() {
  if (openCache) return openCache;
  const out = [], ids = new Set();
  for (const i of Object.values(S.ins)) if (TPL[i.templateId]) for (const [key, a] of Object.entries(i.answers)) for (const act of a.actions || []) { ids.add(act.id); if (!act.done) out.push(locItem(i, key, act)); }
  for (const r of Object.values(S.hubActs || {})) if (!r.done && !ids.has(r.id) && (r.text || '').trim()) out.push(remItem(r));
  return (openCache = out.sort(actSort));
}
function actLine(x, withSite) {
  const late = x.due && x.due < todayISO(), pr = x.prio, sh = withSite ? SITES.find(z => z.id === x.siteId)?.short : '';
  const chk = x.local ? `data-hdone="${x.local.i.id}|${esc(x.local.key)}|${esc(x.id)}"` : `data-rdone="${esc(x.id)}"`;
  const go = x.local ? `data-act="open" data-id="${x.local.i.id}" data-focus="${esc(x.local.key)}"` : `data-act="recent-pdf" data-id="${esc(x.rec.iid)}"`;
  return `<div class="act-line prio-${PRIO_CLS[pr] || 'lav'}"><input type="checkbox" id="hd-${esc(x.id)}" ${chk} aria-label="Merk som utført">
      <button class="row-main" ${go}>
      <span class="rc-title">${esc(x.text || '(uten beskrivelse)')}</span>
      <span class="rc-sub"><b class="prio-tag">${esc(pr)}</b> · ${sh ? esc(sh) + ' · ' : ''}${esc(x.tplName)} · ${fmt(x.date)}${x.local && x.local.i.status !== 'complete' ? ' · <b class="t-bad">Kladd, deles ikke</b>' : ''}${x.local ? '' : x.by ? ' · ' + esc(x.by) : ''}${x.due ? ` · <span class="${late ? 't-bad' : ''}">Frist ${fmt(x.due)}</span>` : ''}</span></button></div>`;
}
const allOpen = openAll;
function lastOf(tid, done) {
  /* Mal med legacy: [eldre mal-id] teller også for eldre inspeksjoner som dekket anlegg på samme bygg (VK/SVK-malen før å9). */
  const leg = TPL[tid]?.legacy || [], site = leg.length ? SITES.find(s => s.tpls.includes(tid))?.id : null;
  const own = ac => Array.isArray(ac) && ac.some(k => ANL[String(k).split('|')[0]]?.site === site);
  const l = done.find(i => i.templateId === tid || (leg.includes(i.templateId) && own(covKeys(i)))); let d = l ? l.date : null;
  for (const r of hubRows()) if ((r.tpl === tid || (leg.includes(r.tpl) && own(r.ac))) && r.date && (!d || r.date > d)) d = r.date;
  return d ? { date: d } : undefined;
}
const doneList = () => Object.values(S.ins).filter(i => i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
const actSite = (i, key) => { const tl = listKey(i, key); return SITES.find(x => x.tl === tl)?.id; };
const siteOpen = site => openAll().filter(x => x.siteId === site.id);
function siteState(site) {
  const sts = ANLEGG.filter(a => a.site === site.id).map(anlState);
  const nbad = sts.filter(x => x.cls === 'bad').length, nwarn = sts.filter(x => x.cls === 'warn').length, nblue = sts.filter(x => x.cls === 'blue').length, nna = sts.filter(x => x.cls === 'na').length;
  const nopen = siteOpen(site).length;
  const cls = nbad ? 'bad' : nwarn ? 'warn' : nna === sts.length ? 'na' : nblue ? 'blue' : 'ok';
  const text = nna === sts.length && !nopen ? 'Ingen kontroller i Argus ennå'
    : [nbad ? `${nbad} anlegg med avvik eller forfalt` : '', nwarn ? `${nwarn} forfaller snart` : '', nblue ? `${nblue} skal kontrolleres` : '', nopen ? `${nopen} ${nopen === 1 ? 'åpen handling' : 'åpne handlinger'}` : ''].filter(Boolean).join(' · ') || `Alle ${sts.length} anlegg i orden`;
  const done = doneList(); const ds = site.tpls.map(id => ({ t: TPL[id], d: dueInfo(TPL[id], lastOf(id, done)) }));
  const late = ds.filter(x => x.d.cls === 'bad').length, never = ds.filter(x => x.d.cls === 'na').length;
  const rounds = `${site.tpls.length} ${site.tpls.length === 1 ? 'runde' : 'runder'}` + (late ? ` · ${late} forfalt` : '') + (never ? ` · ${never} ikke startet` : '');
  return { cls, text, rounds };
}

function renderSite() {
  const site = SITES.find(x => x.id === S.site), done = doneList();
  const tplBtn = t => {
    const last = lastOf(t.id, done); const due = dueInfo(t, last);
    const draft = Object.values(S.ins).find(i => i.templateId === t.id && i.status !== 'complete');
    return `<div class="tpl-wrap"><button class="tpl" data-act="${draft ? 'open' : 'new'}" data-tpl="${t.id}"${draft ? ` data-id="${draft.id}"` : ''}>
      <span class="tpl-top"><span class="tpl-name">${esc(t.name)}</span><span class="freq">${freqLabel(t)}</span></span>
      <span class="tpl-meta">${draft ? `<span class="pill warn">Påbegynt ${fmt(draft.date)}, trykk for å fortsette</span>` : `<span class="pill ${due.cls}">${due.text}</span>`}${last ? `<span class="muted small">Sist ${fmt(last.date)}</span>` : ''}</span>
    </button>${draft ? `<button class="link danger draft-del" data-act="del-draft" data-id="${draft.id}">Slett kladd</button>` : ''}</div>`;
  };
  const anlBtn = (a, st) => `<button class="anl" data-act="anl" data-id="${a.id}"><span class="dot ${st.cls}" aria-hidden="true"></span>
    <span class="anl-txt"><span class="rc-title">${esc(a.name)}</span><span class="rc-sub ${st.cls === 'bad' ? 't-bad' : ''}">${esc(st.text)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  const list = ANLEGG.filter(a => a.site === site.id).map(a => ({ a, st: anlState(a) })).sort((x, y) => rank[x.st.cls] - rank[y.st.cls]);
  let h = `<button class="btn avvik-big" data-act="avvik-new" data-site="${site.id}">Meld avvik i ${esc(site.short)}</button>`;
  h += `<section><h2 class="h2">Inspeksjoner</h2><div class="tpl-list">${site.tpls.map(id => tplBtn(TPL[id])).join('')}</div></section>`;
  { const nb = list.filter(x => x.st.cls === 'bad').length, nw = list.filter(x => x.st.cls === 'warn').length, nbl = list.filter(x => x.st.cls === 'blue').length, open = !!S.anlOpen;
    h += `<section><button class="fold" data-act="anl-toggle" aria-expanded="${open}" aria-controls="anl-list"><span class="fold-t">Anlegg <span class="count">${list.length}</span></span>
      <span class="fold-sum">${!open && nb ? `<span class="dot bad" aria-hidden="true"></span>${nb} <span class="sr">forfalt</span>` : ''}${!open && nw ? `<span class="dot warn" aria-hidden="true"></span>${nw} <span class="sr">snart</span>` : ''}${!open && nbl ? `<span class="dot blue" aria-hidden="true"></span>${nbl} <span class="sr">skal kontrolleres</span>` : ''}</span><span class="chev" aria-hidden="true">›</span></button>
      ${open ? `<div class="list" id="anl-list">${list.map(x => anlBtn(x.a, x.st)).join('')}</div>` : ''}</section>`; }
  h += recentHtml(site.id);
  const open = siteOpen(site);
  h += `<section><h2 class="h2">Åpne handlinger <span class="count">${open.length}</span></h2>${trelloHomeLine()}`;
  h += open.length ? `<div class="list">${open.map(x => actLine(x)).join('')}</div>` : '<p class="empty">Ingen åpne handlinger.</p>';
  h += '</section>';
  const mine = done.filter(i => site.tpls.includes(i.templateId) || (i.templateId === 'avvik' && (i.siteId || ANL[i.anl]?.site) === site.id));
  const hist = S.showAllHist ? mine : mine.slice(0, 8);
  h += `<section><h2 class="h2">Fullførte</h2>`;
  h += mine.length ? `<div class="list">${hist.map(i => {
    const st = stats(i); const t = TPL[i.templateId];
    return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
      <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${fmt(i.date)} · ${esc(i.by || '')}</span>
      <span class="rc-sub">${st.flags ? `<b class="t-bad">${st.flags} avvik</b>` : 'Ingen avvik'} · ${st.actions} handlinger</span></button>
      <button class="link" data-act="pdf" data-id="${i.id}">PDF</button><button class="link danger" data-act="del-ins" data-id="${i.id}">Slett</button></div>`;
  }).join('')}</div>${mine.length > 8 && !S.showAllHist ? `<button class="link more" data-act="hist-all">Vis alle ${mine.length}</button>` : ''}` : '<p class="empty">Fullførte inspeksjoner for dette bygget havner her.</p>';
  h += '</section>';
  return h;
}

function renderAnl() {
  const a = ANL[S.anl], st = anlState(a), site = SITES.find(x => x.id === a.site);
  let h = `<section class="panel meta"><h1 class="ins-title">${esc(a.name)}</h1>
    <p class="muted">${esc(site.name)}${a.note ? ' · ' + esc(a.note) : ''}</p>
    <p><span class="pill ${st.cls}">${esc(st.text)}</span></p>
    <button class="btn primary" data-act="avvik" data-id="${a.id}">Meld avvik</button></section>`;
  h += `<section><h2 class="h2">Kontroller</h2><div class="list">${st.covs.map(x => {
    const due = x.du;
    return `<div class="panel cov"><div class="tpl-top"><span class="tpl-name">${esc(x.t.name)}</span><span class="freq">${freqLabel(x.t)}</span></div>
      <div class="tpl-meta"><span class="pill ${due.cls}">${due.text}</span>${x.lastDate ? `<span class="muted small">Sist ${fmt(x.lastDate)}</span>` : ''}</div>
      ${x.flags.length ? `<ul class="flags">${x.flags.map(f => `<li><button class="link" data-act="open" data-id="${x.last.id}" data-focus="${esc(f.key)}">${esc(f.it.label)}: <b class="t-bad">${esc(String(x.last.answers[f.key].value))}</b></button></li>`).join('')}</ul>` : ''}
      ${x.draft ? `<button class="btn" data-act="open" data-id="${x.draft.id}">Fortsett påbegynt (${fmt(x.draft.date)})</button>` : `<button class="btn primary" data-act="new" data-tpl="${x.t.id}">Start kontroll</button>`}</div>`;
  }).join('')}</div></section>`;
  h += `<section><h2 class="h2">Åpne handlinger <span class="count">${st.open.length}</span></h2>`;
  h += st.open.length ? `<div class="list">${st.open.slice().sort(actSort).map(x => actLine(x)).join('')}</div>` : '<p class="empty">Ingen åpne handlinger.</p>';
  h += '</section>';
  h += `<section><h2 class="h2">Historikk</h2>`;
  h += st.hist.length ? `<div class="list">${st.hist.slice(0, 30).map(({ i, t, n, flags }) => `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
      <span class="rc-title">${fmt(i.date)} · ${esc(t.name)}</span>
      <span class="rc-sub">${flags.length ? `<b class="t-bad">${flags.length} avvik</b>: ${esc(flags.map(f => f.it.label).join('; ').slice(0, 140))}` : `${n} ${n === 1 ? "punkt" : "punkter"}, ingen avvik`}</span></button>
      <button class="link" data-act="pdf" data-id="${i.id}">PDF</button></div>`).join('')}</div>` : '<p class="empty">Ingen fullførte kontroller av dette anlegget ennå.</p>';
  h += '</section>';
  return h;
}

function renderIns() {
  const ins = cur(); const tpl = TPL[ins.templateId]; const st = stats(ins);
  let h = `<section class="panel meta">
    <h1 class="ins-title">${esc(tpl.name)}</h1>
    ${ins.status === 'complete' ? `<p class="done-note">Fullført. Endringer lagres, og du kan lage ny PDF når som helst.</p>` : ''}
    <div class="fields">
      ${ins.templateId === 'avvik' ? '' : `<label class="fld wide"><span>Sted</span><input id="m-site" data-meta="site" value="${esc(ins.site)}"></label>`}
      <label class="fld"><span>Dato</span><input id="m-date" type="date" data-meta="date" value="${esc(ins.date)}"></label>
      <label class="fld"><span>Utført av</span><input id="m-by" data-meta="by" value="${esc(ins.by)}"></label>
    </div>${ins.status !== 'complete' ? `<div class="meta-act"><button class="link danger" data-act="del-draft" data-id="${ins.id}">Slett kladd</button></div>` : ''}</section>`;
  if (ins.templateId === 'avvik') {
    const site = SITES.find(x => x.id === ins.siteId);
    h += `<section class="panel avf"><h2 class="h3">Hvor er avviket?</h2>
      <div class="q">Bygg</div><div class="seg" role="group" aria-label="Bygg">${SITES.map(x => `<button type="button" data-act="av-site" data-id="${x.id}" aria-pressed="${x.id === ins.siteId}"${x.id === ins.siteId ? ' data-tone="sel"' : ''}>${x.short}</button>`).join('')}</div>
      ${site ? `<label class="fld"><span>Anlegg</span><select id="av-anl" data-avf="anl"><option value="">Velg anlegg…</option>${ANLEGG.filter(a => a.site === site.id).map(a => `<option value="${a.id}"${ins.anl === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="annet"${ins.annet ? ' selected' : ''}>Annet</option></select></label>
      <label class="fld"><span>Hvor?${ins.annet ? ' (må fylles ut for Annet)' : ' (valgfritt)'}</span><input id="av-where" data-avf="where" value="${esc(ins.where || '')}" placeholder="F.eks. trapp B, 2. etg"></label>` : '<p class="muted small">Velg bygg først.</p>'}
    </section>`;
  }
  { const ln = (S.settings.notes[ins.templateId] || '').trim(); if (ln) h += `<section class="panel lnote"><h3 class="h3">Koder og notater (kun på denne telefonen)</h3><p>${esc(ln)}</p></section>`; }
  for (const sec of tpl.sections) {
    if (!secVisible(sec, ins)) continue;
    const n = instCount(sec, ins);
    for (let i = 0; i < n; i++) {
      const p = prefixOf(sec, i);
      h += `<section class="sec"><header class="sec-h"><h2>${esc(sec.title)}${sec.repeat ? ` <span class="inst">${esc(sec.unit)} ${i + 1}</span>` : ''}</h2>${sec.repeat && n > 1 && i === n - 1 ? `<button class="link danger" data-act="rep-del" data-sec="${sec.id}">Fjern ${esc(sec.unit.toLowerCase())}</button>` : ''}</header><div class="items">`;
      for (const it of sec.items) if (itemVisible(it, ins, p)) h += itemHTML(ins, it, p + '.' + it.id);
      h += '</div></section>';
    }
    if (sec.repeat) h += `<button class="add-rep" data-act="rep-add" data-sec="${sec.id}">+ Legg til ${esc(sec.unit.toLowerCase())}</button>`;
  }
  h += `<section class="panel finish">
    <div class="sum"><div><b>${st.total - st.unanswered}</b><span>av ${st.total} besvart</span></div><div class="${st.flags ? 't-bad' : ''}"><b>${st.flags}</b><span>avvik</span></div><div><b>${st.actions}</b><span>handlinger</span></div><div><b>${st.photos}</b><span>bilder</span></div></div>`;
  if (S.confirmFinish) {
    h += `<p class="warn-text">${st.unanswered} ${st.unanswered === 1 ? 'punkt er' : 'punkter er'} ikke besvart. Vil du fullføre likevel?</p>
      <div class="row-btns"><button class="btn" data-act="finish-cancel">Gå tilbake</button><button class="btn primary" data-act="finish-force">Fullfør likevel</button></div>`;
  } else {
    h += `<button class="btn primary big" data-act="${ins.status === 'complete' ? 'pdf' : 'finish'}" data-id="${ins.id}" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Lager PDF…' : ins.status === 'complete' ? 'Lag PDF på nytt' : ins.templateId === 'avvik' ? 'Send avvik' : 'Fullfør og lag PDF'}</button>`;
  }
  h += '</section>';
  return h;
}

function itemHTML(ins, it, key) {
  if (it.type === 'heading') return `<h3 class="sub">${esc(it.label)}</h3>`;
  if (it.type === 'info') return `<p class="info">${esc(it.label)}</p>`;
  const a = ins.answers[key] || {};
  const flag = isFlag(it, a); const acts = a.actions || []; const photos = a.photos || [];
  const want = flag || (it.suggestOn && (it.suggestOn === 'any' ? !!a.value : it.suggestOn.includes(a.value)));
  const k = esc(key);
  let ctl = '';
  if (CHOICE_TYPES.includes(it.type)) {
    const opts = optsOf(it);
    ctl = `<div class="seg" role="group" aria-label="${esc(it.label)}">${opts.map(o => {
      const on = a.value === o;
      return `<button type="button" data-act="set" data-key="${k}" data-val="${esc(o)}" aria-pressed="${on}"${on ? ` data-tone="${toneFor(it, o)}"` : ''}>${esc(o)}</button>`;
    }).join('')}</div>`;
    if (it.allowOther) {
      const other = a.value && !opts.includes(a.value) ? a.value : '';
      ctl += `<input class="inp other" id="o-${k}" data-bind="${k}" data-field="value" data-rerender="1" placeholder="Annet – skriv inn" value="${esc(other)}">`;
    }
  } else if (it.type === 'multi') {
    const v = Array.isArray(a.value) ? a.value : [];
    ctl = `<div class="seg multi">${it.options.map(o => `<button type="button" data-act="toggle" data-key="${k}" data-val="${esc(o)}" aria-pressed="${v.includes(o)}"${v.includes(o) ? ' data-tone="sel"' : ''}>${esc(o)}</button>`).join('')}</div>`;
  } else if (it.type === 'number') {
    const prev = prevValue(ins, key);
    ctl = `<div class="numrow"><input class="inp num" id="n-${k}" type="text" inputmode="decimal" data-bind="${k}" data-field="value" value="${esc(a.value ?? '')}" placeholder="0,0" autocomplete="off"><span class="unit">${esc(it.unit || '')}</span>${prev != null ? `<span class="prev">Forrige: ${esc(String(prev).replace('.', ','))} ${esc(it.unit || '')}</span>` : ''}</div>`;
  } else if (it.type === 'text') {
    ctl = `<input class="inp" id="t-${k}" data-bind="${k}" data-field="value" value="${esc(a.value ?? '')}">`;
  } else if (it.type === 'date') {
    const dl = deadlineOf(it, a.value);
    ctl = `<input class="inp date" id="d-${k}" type="date" data-bind="${k}" data-field="value" data-rerender="1" value="${esc(a.value ?? '')}">${flag ? `<span class="t-bad small">${it.yearly ? 'Årlig kontroll forfalt ' + fmt(dl) : 'Utløpt'}</span>` : it.yearly && dl ? `<span class="muted small">Neste kontroll senest ${fmt(dl)}</span>` : ''}`;
  }
  const note = a.note != null ? `<textarea class="inp note" id="nt-${k}" rows="2" data-bind="${k}" data-field="note" placeholder="Notat">${esc(a.note)}</textarea>` : '';
  const thumbs = photos.length ? `<div class="thumbs">${photos.map((pid, ix) => `<button type="button" class="thumb" data-act="thumb" data-key="${k}" data-ix="${ix}" aria-label="Åpne bilde ${ix + 1}"><img data-pid="${pid}" alt=""></button>`).join('')}</div>` : '';
  const actsH = acts.map(act => actHTML(key, act, ins.status === 'complete')).join('');
  return `<div class="item${flag ? ' is-flag' : ''}" id="it-${k}">
    <div class="q">${esc(it.label)}</div>${it.help ? `<div class="help">${esc(it.help)}</div>` : ''}
    ${ctl}${note}${thumbs}${actsH}
    <div class="tools">
      <button type="button" class="tool" data-act="note" data-key="${k}">${a.note != null ? 'Skjul notat' : 'Notat'}</button>
      <button type="button" class="tool" data-act="photo" data-key="${k}">Bilde</button>
      <button type="button" class="tool${want && !acts.length ? ' prompt' : ''}" data-act="act-add" data-key="${k}">+ Handling</button>
    </div></div>`;
}
function actHTML(key, act, sent) {
  const k = esc(key), base = `${k}|${act.id}`;
  return `<div class="act${act.done ? ' done' : ''}">
    <div class="act-h"><span class="act-tag">Handling</span>${trTag(act, sent)}<label class="chk"><input type="checkbox" id="ad-${act.id}" data-actf="${base}|done"${act.done ? ' checked' : ''}> Utført</label></div>
    <textarea class="inp" id="at-${act.id}" rows="2" data-actf="${base}|text" placeholder="Hva skal gjøres?">${esc(act.text)}</textarea>
    <div class="act-row">
      <label class="fld"><span>Frist</span><input type="date" id="af-${act.id}" data-actf="${base}|due" value="${esc(act.due || '')}"></label>
      <label class="fld"><span>Ansvarlig</span><input id="aw-${act.id}" data-actf="${base}|who" value="${esc(act.who || '')}"></label>
      <label class="fld"><span>Prioritet</span><select id="ap-${act.id}" data-actf="${base}|prio">${['Lav', 'Middels', 'Høy'].map(p => `<option${act.prio === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <button type="button" class="link danger" data-act="act-del" data-key="${k}" data-aid="${act.id}">Slett handling</button>
  </div>`;
}

const URLS = {};
async function hydratePhotos() {
  for (const img of document.querySelectorAll('img[data-pid]')) {
    const id = img.dataset.pid;
    if (!URLS[id]) {
      const rec = await DB.get('photos', id).catch(() => null);
      if (!rec) continue;
      URLS[id] = URL.createObjectURL(rec.blob);
    }
    img.src = URLS[id];
  }
}

/* ---------- Ark for deling (må startes av et trykk) ---------- */
function renderSheet() {
  const el = $('#sheet');
  if (!S.ready_file) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<div class="sheet-card" role="dialog" aria-label="Fil klar"><p class="sheet-title">${esc(S.ready_file.title)}</p><p class="muted small">${esc(S.ready_file.file.name)}</p>
    ${S.ready_file.canOpen ? '<button class="btn primary big" data-act="open-file">Åpne PDF</button><button class="btn big" data-act="share-file">Del eller lagre</button>' : '<button class="btn primary big" data-act="share-file">Del eller lagre</button>'}
    <button class="btn" data-act="close-sheet">Lukk</button></div>`;
}
function openFile() {
  const url = URL.createObjectURL(S.ready_file.file);
  if (!window.open(url, '_blank')) { toast('Nettleseren blokkerte visningen. Bruk Del eller lagre.', 4500); URL.revokeObjectURL(url); return; }
  setTimeout(() => URL.revokeObjectURL(url), 180000);
}
async function shareFile() {
  const { file } = S.ready_file;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); S.ready_file = null; renderSheet(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  S.ready_file = null; renderSheet();
}

/* ---------- Hendelser ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, key = b.dataset.key, ins = cur();
  switch (act) {
    case 'home': goHome(); break;
    case 'home-root': goHome(true); break;
    case 'force-update':
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å laste på nytt'); break; }
      await flushAll();
      try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
      location.reload(); break;
    case 'anl': openAnl(b.dataset.id); break;
    case 'site': openSite(b.dataset.id); break;
    case 'avvik': newAvvik({ anl: b.dataset.id }); break;
    case 'avvik-new': newAvvik({ site: b.dataset.site }); break;
    case 'av-site': if (ins) { ins.siteId = b.dataset.id; ins.anl = null; ins.annet = false; S.settings.lastSite = ins.siteId; saveSettings(); avSite(ins); touch(ins); render(); } break;
    case 'to-site': openSite(S.site); break;
    case 'settings': S.showSettings = !S.showSettings; render(); window.scrollTo(0, 0); break;
    case 'new': newInspection(b.dataset.tpl); break;
    case 'open': openIns(b.dataset.id); if (b.dataset.focus) { const el = document.getElementById('it-' + b.dataset.focus); if (el) el.scrollIntoView({ block: 'center' }); } break;
    case 'hist-all': S.showAllHist = true; render(); break;
    case 'act-all': S.showAllAct = true; render(); break;
    case 'anl-toggle': S.anlOpen = !S.anlOpen; render(); break;
    case 'del-ins':
      if (!b.dataset.armed) { arm(b, 'Bekreft sletting'); break; }
      await deleteIns(b.dataset.id); render(); toast('Inspeksjonen er slettet');
      break;
    case 'del-draft':
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å slette'); break; }
      { const id = b.dataset.id, inside = S.cur === id;
        await deleteIns(id); toast('Kladden er slettet');
        if (inside) goHome(); else render(); }
      break;
    case 'set': {
      const a = A(ins, key); a.value = a.value === b.dataset.val ? null : b.dataset.val;
      touch(ins); render(); break;
    }
    case 'toggle': {
      const a = A(ins, key); const v = Array.isArray(a.value) ? a.value : [];
      a.value = v.includes(b.dataset.val) ? v.filter(x => x !== b.dataset.val) : [...v, b.dataset.val];
      touch(ins); render(); break;
    }
    case 'note': {
      const a = A(ins, key);
      if (a.note == null) { a.note = ''; render(); document.getElementById('nt-' + key)?.focus(); }
      else { if (!a.note) delete a.note; else { toast('Notatet er beholdt. Tøm teksten for å fjerne det.'); break; } render(); }
      touch(ins); break;
    }
    case 'photo': S.pickKey = key; $('#filepick').click(); break;
    case 'thumb': openEditor(key, +b.dataset.ix); break;
    case 'act-add': {
      const a = A(ins, key); const id = uid();
      (a.actions ||= []).push({ id, text: '', due: addDays(todayISO(), 14), who: S.settings.by, prio: 'Lav', done: false });
      touch(ins); render(); document.getElementById('at-' + id)?.focus(); break;
    }
    case 'act-del':
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å slette'); break; }
      { const a = A(ins, key); a.actions = (a.actions || []).filter(x => x.id !== b.dataset.aid); touch(ins); render(); }
      break;
    case 'rep-add': ins.repeats[b.dataset.sec] = instCount(TPL[ins.templateId].sections.find(s => s.id === b.dataset.sec), ins) + 1; touch(ins); render(); break;
    case 'rep-del': {
      if (!b.dataset.armed) { arm(b, 'Bekreft fjerning'); break; }
      const sec = TPL[ins.templateId].sections.find(s => s.id === b.dataset.sec); const n = instCount(sec, ins);
      const p = prefixOf(sec, n - 1) + '.';
      for (const k of Object.keys(ins.answers)) if (k.startsWith(p)) delete ins.answers[k];
      ins.repeats[sec.id] = n - 1; touch(ins); render(); break;
    }
    case 'finish': {
      if (ins.templateId === 'avvik') {
        const miss = !ins.siteId ? 'Velg bygg.' : !ins.anl && !ins.annet ? 'Velg anlegg, eller Annet.' : ins.annet && !(ins.where || '').trim() ? 'Skriv hvor avviket er.' : !Object.values(ins.answers).some(z => (z.actions || []).some(q => (q.text || '').trim())) ? 'Skriv hva som må gjøres i handlingen.' : '';
        if (miss) { toast(miss, 4000); break; }
        S.settings.lastSite = ins.siteId; saveSettings();
      }
      const st = stats(ins);
      if (st.unanswered && !S.confirmFinish) { S.confirmFinish = true; render(); break; }
      await finish(ins); break;
    }
    case 'finish-force': await finish(ins); break;
    case 'finish-cancel': S.confirmFinish = false; render(); break;
    case 'pdf': await makePdf(S.ins[b.dataset.id]); break;
    case 'recent-pdf': await openRecentPdf(b.dataset.id); break;
    case 'open-file': openFile(); break;
    case 'share-file': shareFile(); break;
    case 'close-sheet': S.ready_file = null; renderSheet(); break;
    case 'tr-token': {
      const k = S.settings.trello.key; if (!k) { toast('Lim inn API-nøkkelen først.'); break; }
      window.open('https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Argus&key=' + encodeURIComponent(k), '_blank'); break;
    }
    case 'tr-test':
      try { const bd = await tfetch('GET', `boards/${TRELLO.board}`, { fields: 'name' }); S.settings.trello.members = null; await trelloMembers(); S.settings.trello.labels = {}; let lab = 'etiketter klare'; try { for (const k of Object.keys(PRIO_LABEL)) await prioLabel(k); } catch (e) { lab = 'etiketter feilet: ' + trelloErr(e); } toast(`Koblet til tavlen «${bd.name}», ${lab}`, 6000); }
      catch (e) { toast(trelloErr(e), 8000); }
      break;
    case 'tr-sync': await syncTrello(true); break;
    case 'hub-test':
      try { await hubFetch('GET', '/ping'); toast('Koblet til Argus Hub', 4000); hubSync(); } catch (e) { toast(hubErr(e), 8000); }
      break;
    case 'hub-sync': await syncTrello(); await hubSync(true); break;
    case 'gate-connect': await gateConnect(); break;
    case 'links-open': S.view = 'links'; S.linkEdit = false; S.linkQr = null; render(); window.scrollTo(0, 0); loadLinks().then(ch => { if (ch && S.view === 'links') render(); }).catch(() => {}); break;
    case 'lk-qr': S.linkQr = b.dataset.id; render(); break;
    case 'lk-qr-close': S.linkQr = null; render(); break;
    case 'lk-copy': await lkCopy(b.dataset.id); break;
    case 'lk-share': await lkShare(b.dataset.id); break;
    case 'lk-edit': S.linkDraft = clone(linksList()); S.linkEdit = true; render(); window.scrollTo(0, 0); break;
    case 'lk-cancel': S.linkEdit = false; S.linkDraft = null; render(); break;
    case 'lk-add': S.linkDraft.push({ id: uid(), title: '', desc: '', url: 'https://', group: 'share' }); render(); break;
    case 'lk-up': case 'lk-down': { const a = S.linkDraft, i = a.findIndex(x => x.id === b.dataset.id), j = act === 'lk-up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; render(); } break; }
    case 'lk-del': if (b.dataset.armed) { S.linkDraft = S.linkDraft.filter(x => x.id !== b.dataset.id); render(); } else arm(b, 'Trykk igjen for å slette'); break;
    case 'lk-save': await lkSave(); break;
    case 'inbox-open': S.view = 'inbox'; render(); window.scrollTo(0, 0); loadInboxPics(); hubSync(); break;
    case 'ib-ok': await ibApprove(b.dataset.id, b); break;
    case 'ib-no':
      if (b.dataset.armed) await ibReject(b.dataset.id); else arm(b, 'Trykk igjen for å avvise');
      break;
    case 'content-upload': $('#contentpick').click(); break;
    case 'export': await exportBackup(); break;
    case 'import': $('#importpick').click(); break;
  }
});
async function deleteIns(id) {
  const victim = S.ins[id]; if (!victim) return;
  hubCloseActs(victim);
  clearTimeout(timers[id]); delete timers[id];
  delete S.ins[id]; if (S.cur === id) S.cur = null;
  try { await chains[id]; } catch (e) {}
  delete chains[id];
  await DB.del('inspections', id);
  for (const a of Object.values(victim.answers || {})) for (const p of a.photos || []) DB.del('photos', p);
  anlCache = null; openCache = null;
}
function arm(b, label) {
  const old = b.textContent; b.dataset.armed = '1'; b.textContent = label; b.classList.add('armed');
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old; b.classList.remove('armed'); } }, 3500);
}

document.addEventListener('input', e => {
  const el = e.target; const ins = cur();
  if (el.dataset.trello) { const t = S.settings.trello; t[el.dataset.trello] = el.value.trim(); t.members = null; saveSettings(); return; }
  if (el.dataset.ib) { (S.ibEdit[el.dataset.id] ||= {})[el.dataset.ib] = el.value; return; }
  if (el.dataset.lk) { const l = (S.linkDraft || []).find(x => x.id === el.dataset.id); if (l) l[el.dataset.lk] = el.value; return; }
  if (el.dataset.hub) { S.settings.hub[el.dataset.hub] = el.value.trim(); saveSettings(); return; }
  if (el.dataset.lnote) { S.settings.notes[el.dataset.lnote] = el.value; saveSettings(); return; }
  if (el.dataset.set) { S.settings[el.dataset.set] = el.value; saveSettings(); return; }
  if (!ins) return;
  if (el.dataset.avf) {
    if (el.dataset.avf === 'anl') { ins.annet = el.value === 'annet'; ins.anl = ins.annet || !el.value ? null : el.value; } else ins.where = el.value;
    avSite(ins); touch(ins); return;
  }
  if (el.dataset.meta) { ins[el.dataset.meta] = el.value; touch(ins); return; }
  if (el.dataset.bind) {
    const a = A(ins, el.dataset.bind);
    if (el.dataset.field === 'value') a.value = el.value === '' ? null : el.value; else a.note = el.value;
    touch(ins); return;
  }
  if (el.dataset.actf && el.type !== 'checkbox') {
    const [key, id, field] = el.dataset.actf.split('|');
    const act = (ins.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act[field] = el.value; touch(ins); }
  }
});
document.addEventListener('change', e => {
  const el = e.target; const ins = cur();
  if (el.dataset.rdone) { toggleRemoteAct(el.dataset.rdone, el.checked); return; }
  if (el.dataset.hdone) {
    const [iid, key, id] = el.dataset.hdone.split('|'); const i = S.ins[iid];
    const act = (i?.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; act.upd = Date.now(); act.doneBy = el.checked ? (S.settings.by || '') : ''; touch(i); toast('Handlingen er merket som utført'); setTimeout(render, 350); setTimeout(syncTrello, 1200); setTimeout(hubSync, 2000); }
    return;
  }
  if (!ins) return;
  if (el.dataset.actf && el.type === 'checkbox') {
    const [key, id] = el.dataset.actf.split('|');
    const act = (ins.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; act.upd = Date.now(); act.doneBy = el.checked ? (S.settings.by || '') : ''; touch(ins); render(); }
  } else if (el.dataset.rerender || el.dataset.avf === 'anl') render();
});

/* ---------- Bilder ---------- */
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Kunne ikke lese bildet')); i.src = src; }); }
async function toJpeg(src, max = 1600, q = 0.82) {
  const img = await loadImage(src);
  let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, w, h };
}
$('#filepick').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  const ins = cur(), key = S.pickKey; if (!files.length || !ins || !key) return;
  for (let n = 0; n < files.length; n++) {
    toast(files.length > 1 ? `Lagrer bilde ${n + 1} av ${files.length}…` : 'Lagrer bilde…', 8000);
    const url = URL.createObjectURL(files[n]);
    try {
      const { blob, w, h } = await toJpeg(url); const id = uid();
      await DB.put('photos', { id, blob, w, h });
      (A(ins, key).photos ||= []).push(id);
    } catch (err) { toast('Bildet kunne ikke lagres: ' + err.message); }
    finally { URL.revokeObjectURL(url); }
  }
  touch(ins); render(); toast('Bilde lagret. Trykk på bildet for å markere.');
});

const ED = { key: null, ix: 0, id: null, img: null, strokes: [], drawing: null };
const cv = $('#ed-canvas'), cx = cv.getContext('2d');
async function openEditor(key, ix) {
  const id = cur().answers[key].photos[ix];
  Object.assign(ED, { key, ix, id, strokes: [], drawing: null });
  ED.img = await loadImage(URLS[id]);
  cv.width = ED.img.naturalWidth; cv.height = ED.img.naturalHeight;
  edDraw(); $('#editor').hidden = false; document.body.classList.add('noscroll');
  $('#ed-del').textContent = 'Slett bilde'; delete $('#ed-del').dataset.armed;
}
function edDraw() {
  cx.drawImage(ED.img, 0, 0);
  cx.strokeStyle = '#e8262f'; cx.lineWidth = Math.max(4, cv.width / 140); cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const s of ED.strokes) { cx.beginPath(); s.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); if (s.length === 1) cx.lineTo(s[0][0] + 0.1, s[0][1]); cx.stroke(); }
}
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ED.drawing = [pt(e)]; ED.strokes.push(ED.drawing); edDraw(); });
cv.addEventListener('pointermove', e => { if (!ED.drawing) return; ED.drawing.push(pt(e)); edDraw(); });
const endStroke = () => { ED.drawing = null; };
cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
function closeEditor() { $('#editor').hidden = true; document.body.classList.remove('noscroll'); }
$('#ed-cancel').onclick = closeEditor;
$('#ed-undo').onclick = () => { ED.strokes.pop(); edDraw(); };
$('#ed-save').onclick = async () => {
  if (!ED.strokes.length) { closeEditor(); return; }
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
  await DB.put('photos', { id: ED.id, blob, w: cv.width, h: cv.height });
  if (URLS[ED.id]) URL.revokeObjectURL(URLS[ED.id]); delete URLS[ED.id];
  touch(cur()); closeEditor(); render(); toast('Markering lagret');
};
$('#ed-del').onclick = async () => {
  const b = $('#ed-del');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Trykk igjen'; return; }
  const a = cur().answers[ED.key]; a.photos = a.photos.filter(p => p !== ED.id);
  await DB.del('photos', ED.id); touch(cur()); closeEditor(); render(); toast('Bildet er slettet');
};

/* ---------- Fullfør og PDF ---------- */
function ctxLabel(tpl, key) {
  const { sec, it } = findItem(tpl, key); if (!sec) return '';
  let head = null;
  for (const x of sec.items) { if (x === it) break; if (x.type === 'heading') head = x.label; }
  return head || sec.title;
}
function autoActions(ins) {
  const tpl = TPL[ins.templateId], today = todayISO(); let n = 0;
  const horizon = (tpl.days || (tpl.months || 12) * 31) + 30;
  for (const x of walk(tpl, ins)) {
    if (x.it.type !== 'date') continue;
    const a = ins.answers[x.key]; const dl = deadlineOf(x.it, a?.value); if (!dl) continue;
    if (daysBetween(today, dl) > horizon) continue;
    const dup = Object.values(S.ins).some(i => i.templateId === ins.templateId && Object.entries(i.answers).some(([k, z]) => k === x.key && (z.actions || []).some(q => q.auto === x.key && (q.autoFor === dl || !q.done))));
    if (dup) continue;
    const ctx = ctxLabel(tpl, x.key), late = dl < today;
    const text = x.it.yearly ? `${ctx}: årlig kontroll ${late ? 'forfalt' : 'forfaller'} ${fmt(dl)} – bestill kontroll` : `${ctx}: ${x.it.label.toLowerCase()} ${fmt(dl)} – bestill nytt`;
    const due = addDays(dl, -30) > today ? addDays(dl, -30) : addDays(today, 7);
    (a.actions ||= []).push({ id: uid(), text, due, who: ins.by || S.settings.by, prio: late ? 'Høy' : 'Middels', done: false, auto: x.key, autoFor: dl });
    n++;
  }
  return n;
}
async function finish(ins) {
  const nAuto = autoActions(ins);
  if (nAuto) toast(`${nAuto} ${nAuto === 1 ? 'påminnelse' : 'påminnelser'} om utløp/kontroll lagt til`, 4000);
  ins.status = 'complete'; ins.completedAt = Date.now(); S.confirmFinish = false;
  touch(ins); await flush(ins.id);
  if (ins.templateId === 'avvik') { goHome(); toast(trelloCfg() && navigator.onLine ? 'Avviket er registrert og sendes til Trello' : 'Avviket er registrert. Det sendes til Trello når du har dekning.', 3500); return; }
  syncTrello(); hubSync();
  await makePdf(ins);
}
const pdfName = ins => `${TPL[ins.templateId].name} ${ins.site.split(/[–,-]/)[0].trim()} ${fmt(ins.date).replace(/\./g, '-')}.pdf`.replace(/[\\/:*?"<>|]/g, '');
async function makePdf(ins) {
  if (!ins || S.busy) return;
  S.busy = true; if (S.view === 'ins') render(); else toast('Lager PDF…');
  try {
    await flushAll();
    const blob = await buildReport(ins);
    const t = TPL[ins.templateId];
    const name = pdfName(ins);
    S.ready_file = { file: new File([blob], name, { type: 'application/pdf' }), title: 'PDF-rapporten er klar' };
    if (hubCfg() && navigator.onLine) hubFetch('PUT', `/pdf/${ins.id}?name=${encodeURIComponent(name)}`, blob, true).then(() => { ins.hubPdf = true; return saveIns(ins); }).catch(e => console.warn('Hub PDF', e));
  } catch (e) { toast('Kunne ikke lage PDF: ' + (e && e.message || e), 5000); console.error(e); }
  S.busy = false; render();
}

const C = { ink: [20, 33, 42], muted: [86, 104, 116], line: [214, 222, 227], band: [233, 238, 241], ok: [26, 122, 76], bad: [192, 23, 47], na: [94, 108, 118], sel: [15, 90, 125], actBg: [255, 245, 209], actLine: [226, 191, 61], actInk: [92, 71, 8], white: [255, 255, 255], accent: [15, 90, 125] };

/* ---------- PDF-rapport (design A «Rolig») ---------- */
const RC = {
  acc: [5, 132, 121], ink: [16, 36, 43], muted: [96, 112, 120], line: [221, 229, 231], tint: [243, 248, 248], white: [255, 255, 255],
  ok: [22, 128, 84], okBg: [224, 243, 233], bad: [196, 30, 58], badBg: [253, 237, 240], badRow: [253, 245, 246],
  na: [112, 124, 132], naBg: [232, 236, 238], sel: [5, 132, 121], selBg: [214, 237, 234],
  actBg: [255, 246, 214], actLine: [226, 191, 61], actInk: [96, 72, 8]
};
// Nedskalerer bildet til rapporten (stort nok for 80 mm bredde), ellers brukes originalen
async function reportPhoto(rec, max = 1000) {
  const orig = async () => ({ data: new Uint8Array(await rec.blob.arrayBuffer()), w: rec.w, h: rec.h });
  if (typeof document === 'undefined' || Math.max(rec.w, rec.h) <= max) return orig();
  const url = URL.createObjectURL(rec.blob);
  try {
    const { blob, w, h } = await toJpeg(url, max, 0.75);
    if (blob && blob.size < rec.blob.size) return { data: new Uint8Array(await blob.arrayBuffer()), w, h };
  } catch (e) { /* bruk originalen */ } finally { URL.revokeObjectURL(url); }
  return orig();
}

async function buildReport(ins) {
  const tpl = TPL[ins.templateId]; const d = new PDFDoc();
  const W = 210, M = 16, CW = W - 2 * M, TOP = 18, BOT = 279;
  let y = TOP;
  const items = [...walk(tpl, ins)];
  const st = stats(ins);
  const secTitle = x => x.sec.title + (x.sec.repeat ? ` – ${x.sec.unit} ${x.i + 1}` : '');

  // Bilder: nummereres i rekkefølge, vises store på slutten
  const pnum = {}, pinfo = {}; let pc = 0;
  for (const x of items) for (const pid of ins.answers[x.key]?.photos || []) {
    if (pid in pnum) continue;
    const rec = await DB.get('photos', pid).catch(() => null);
    if (!rec) continue;
    pnum[pid] = ++pc;
    pinfo[pid] = { ...(await reportPhoto(rec)), cap: secTitle(x) + '  ›  ' + x.it.label };
  }
  const photosOf = a => (a?.photos || []).filter(p => pinfo[p]).map(p => pnum[p]);
  const need = h => { if (y + h > BOT) { d.addPage(); y = TOP; } };

  // Hvilke punkter teller: alt som er spørsmål (ikke overskrift/info)
  const isQ = x => x.it.type !== 'heading' && x.it.type !== 'info';
  let nOk = 0;
  for (const x of items) { const a = ins.answers[x.key]; if (isQ(x) && CHOICE_TYPES.includes(x.it.type) && a?.value && toneFor(x.it, a.value) === 'ok') nOk++; }

  // ----- Topp -----
  d.rect(0, 0, W, 3.2, RC.acc);
  d.text((S.settings.company || '').toUpperCase(), M, 13, { size: 8, bold: true, color: RC.acc });
  y = 13;
  const done = ins.status === 'complete', stLab = done ? 'Fullført' : 'Utkast', stw = d.width(stLab, 9, true) + 8;
  d.wrap(tpl.name, 22, true, CW - stw - 6).forEach(l => { y += 9; d.text(l, M, y, { size: 22, bold: true, color: RC.ink }); });
  d.rrect(W - M - stw, y - 5.6, stw, 7, 3.5, done ? RC.okBg : RC.naBg);
  d.text(stLab, W - M - stw / 2, y - 0.8, { size: 9, bold: true, color: done ? RC.ok : RC.na, align: 'center' });
  y += 6.5; d.text([ins.site, fmt(ins.date), ins.by].filter(Boolean).join('   ·   '), M, y, { size: 10, color: RC.muted });
  y += 7;
  const tiles = [['Punkter', st.total, RC.ink], ['Ok', nOk, RC.ok], ['Avvik', st.flags, st.flags ? RC.bad : RC.ink], ['Handlinger', st.actions, st.actions ? RC.bad : RC.ink], ['Bilder', pc, RC.ink]];
  const tw = (CW - 4 * 3) / 5;
  tiles.forEach(([lab, val, col], i) => {
    const x = M + i * (tw + 3), warn = (lab === 'Avvik' || lab === 'Handlinger') && val > 0;
    d.rrect(x, y, tw, 17, 2.5, warn ? RC.badBg : RC.tint);
    d.text(String(val), x + 4, y + 9.2, { size: 17, bold: true, color: col });
    d.text(lab, x + 4, y + 14.2, { size: 8, color: RC.muted });
  });
  y += 23;

  // ----- Krever oppfølging -----
  const hits = items.filter(x => isQ(x) && (isFlag(x.it, ins.answers[x.key]) || (ins.answers[x.key]?.actions || []).length));
  if (hits.length) {
    d.text('Krever oppfølging', M, y + 3, { size: 11, bold: true, color: RC.bad }); y += 6;
    for (const x of hits) {
      const a = ins.answers[x.key] || {}, ph = photosOf(a);
      const hl = d.wrap(`${secTitle(x)}  ›  ${x.it.label}${ph.length ? '   (bilde ' + ph.join(', ') + ')' : ''}`, 10, true, CW - 10);
      const val = a.value != null && a.value !== '' ? (Array.isArray(a.value) ? a.value.join(', ') : String(a.value)) : '';
      const vl = val && x.it.type === 'date' && isFlag(x.it, a) ? d.wrap('Svar: ' + fmt(val), 9, false, CW - 10) : [];
      const nl = a.note ? d.wrap(a.note, 9, false, CW - 10) : [];
      const al = (a.actions || []).map(z => ({ t: d.wrap(z.text || '(uten beskrivelse)', 9.5, false, CW - 10), meta: ['Ansvarlig ' + (z.who || '-'), 'Prioritet ' + (z.prio || '-'), 'Frist ' + (z.due ? fmt(z.due) : '-')].concat(z.done ? ['Utført'] : []).join('   ·   ') }));
      const h = 4 + hl.length * 4.6 + vl.length * 4.2 + nl.length * 4.2 + al.reduce((n, z) => n + z.t.length * 4.4 + 5.4, 0) + 2.5;
      need(h + 2.5);
      d.rrect(M, y, CW, h, 2, RC.badBg); d.rect(M, y + 1.5, 1.2, h - 3, RC.bad);
      let yy = y + 5.4;
      hl.forEach(l => { d.text(l, M + 5, yy, { size: 10, bold: true, color: RC.ink }); yy += 4.6; });
      vl.forEach(l => { d.text(l, M + 5, yy, { size: 9, color: RC.muted }); yy += 4.2; });
      nl.forEach(l => { d.text(l, M + 5, yy, { size: 9, color: RC.muted }); yy += 4.2; });
      al.forEach(z => { z.t.forEach(l => { d.text(l, M + 5, yy, { size: 9.5, color: RC.ink }); yy += 4.4; }); d.text(z.meta, M + 5, yy, { size: 8, color: RC.muted }); yy += 5.4; });
      y += h + 2.5;
    }
    y += 3;
  } else {
    need(14);
    d.rrect(M, y, CW, 11, 2.5, RC.okBg);
    d.circle(M + 6.5, y + 5.5, 3, RC.ok); d.path([[M + 5, y + 5.6], [M + 6.2, y + 6.9], [M + 8.2, y + 4.2]], RC.white, 0.5);
    d.text('Ingen avvik eller handlinger registrert', M + 12, y + 6.6, { size: 10.5, bold: true, color: RC.ok });
    y += 17;
  }

  // ----- Avvik meldt siden forrige runde -----
  if (tpl.id !== 'avvik') {
    const sites = SITES.filter(x => x.tpls.includes(tpl.id)).map(x => x.id);
    const covered = new Set(ANLEGG.filter(a => a.cov.some(c => c.t === tpl.id)).map(a => a.id));
    const prev = Object.values(S.ins).filter(i => i.templateId === tpl.id && i.status === 'complete' && i.id !== ins.id && (i.date || '') <= (ins.date || ''))
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
    const after = prev ? (prev.completedAt || parseISO(prev.date).getTime()) : 0, until = ins.completedAt || Date.now();
    const av = Object.values(S.ins).filter(i => i.templateId === 'avvik' && i.status === 'complete' && sites.includes(i.siteId || ANL[i.anl]?.site)
      && (i.annet || covered.has(i.anl)) && (i.completedAt || 0) > after && (i.completedAt || 0) <= until).sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    if (av.length) {
      need(24);
      d.text(`Avvik meldt siden forrige runde${prev ? ' (etter ' + fmt(prev.date) + ')' : ''}`, M, y + 3, { size: 11, bold: true, color: RC.ink }); y += 6.5;
      for (const i of av) {
        const head = d.wrap(`${fmt(i.date)} · ${i.anl && ANL[i.anl] ? ANL[i.anl].name : 'Annet'}${(i.where || '').trim() ? ' · ' + i.where.trim() : ''} · meldt av ${i.by || '-'}`, 9, true, CW - 10);
        const acts = []; for (const a of Object.values(i.answers)) for (const z of a.actions || []) acts.push(z);
        const bl = acts.map(z => ({ t: d.wrap(z.text || '(uten beskrivelse)', 9.5, false, CW - 10), meta: ['Ansvarlig ' + (z.who || '-'), 'Prioritet ' + (z.prio || '-'), 'Frist ' + (z.due ? fmt(z.due) : '-')].concat(z.done ? ['Utført'] : []).join('   ·   ') }));
        const h = 4 + head.length * 4.4 + bl.reduce((n, z) => n + z.t.length * 4.4 + 5.4, 0) + 1.5;
        need(h + 2.5);
        d.rrect(M, y, CW, h, 2, RC.actBg); d.rect(M, y + 1.5, 1.2, h - 3, RC.actLine);
        let yy = y + 5.2;
        head.forEach(l => { d.text(l, M + 5, yy, { size: 9, bold: true, color: RC.actInk }); yy += 4.4; });
        bl.forEach(z => { z.t.forEach(l => { d.text(l, M + 5, yy, { size: 9.5, color: RC.ink }); yy += 4.4; }); d.text(z.meta, M + 5, yy, { size: 8, color: RC.actInk }); yy += 5.4; });
        y += h + 2.5;
      }
      y += 3;
    }
  }

  // ----- Seksjoner (instruksjoner utelates; seksjoner uten spørsmål vises ikke) -----
  const groups = []; let lastId = null;
  for (const x of items) {
    const id = x.sec.id + '#' + x.i;
    if (id !== lastId) { lastId = id; groups.push({ title: secTitle(x), rows: [] }); }
    if (x.it.type === 'info') continue;
    groups[groups.length - 1].rows.push(x);
  }
  let sn = 0;
  for (const g of groups) {
    if (!g.rows.some(isQ)) continue;
    sn++; need(26); y += 1;
    d.rrect(M, y, 6.4, 6.4, 1.6, RC.acc); d.text(String(sn), M + 3.2, y + 4.6, { size: 9, bold: true, color: RC.white, align: 'center' });
    d.text(g.title, M + 9.5, y + 5, { size: 12.5, bold: true, color: RC.ink });
    y += 8.8; d.line(M, y, W - M, y, RC.acc, 0.35); y += 1.2;
    for (let ri = 0; ri < g.rows.length; ri++) {
      const x = g.rows[ri], it = x.it, a = ins.answers[x.key] || {};
      if (it.type === 'heading') {
        if (!g.rows.slice(ri + 1).some(r => r.it.type !== 'heading')) continue;
        need(16); y += 3; d.text(it.label.toUpperCase(), M + 1, y + 3.4, { size: 7.8, bold: true, color: RC.acc }); y += 5.4; continue;
      }
      const v = a.value; let ans = null, tone = null;
      if (CHOICE_TYPES.includes(it.type) && v) { ans = v; tone = toneFor(it, v); }
      else if (it.type === 'multi' && Array.isArray(v) && v.length) { ans = v.join(', '); tone = 'sel'; }
      else if (it.type === 'number' && v != null && v !== '') ans = String(v).replace('.', ',') + (it.unit ? ' ' + it.unit : '');
      else if (it.type === 'date' && v) { ans = fmt(v); if (isFlag(it, a)) tone = 'bad'; }
      else if (it.type === 'text' && v) ans = String(v);
      const ph = photosOf(a);
      const label = it.label + (ph.length ? '   (bilde ' + (ph.length > 1 ? ph[0] + '–' + ph[ph.length - 1] : ph[0]) + ')' : '');
      const longAns = ans != null && (it.type === 'text' || d.width(ans, 9, true) + 8 > 62);
      const pillTxt = tone && !longAns ? ans : null;
      const pw = pillTxt ? Math.max(15, d.width(pillTxt, 8.8, true) + 8) : 0;
      const valW = ans != null && !tone && !longAns ? d.width(ans, 10.5, true) : 0;
      const ll = d.wrap(label, 10, tone === 'bad', CW - Math.max(pw, valW, 20) - 10);
      const bl = longAns ? d.wrap(ans, 10, false, CW - 12) : [];
      const nl = a.note ? d.wrap(a.note, 9, false, CW - 12) : [];
      const labH = Math.max(ll.length * 4.7, 6);
      const bodyH = labH + 3.6 + bl.length * 4.6 + nl.length * 4.2;
      need(bodyH + 1);
      if (tone === 'bad') { d.rect(M, y, CW, bodyH, RC.badRow); d.rect(M, y, 1.1, bodyH, RC.bad); }
      ll.forEach((l, i) => d.text(l, M + 3, y + 5.4 + i * 4.7, { size: 10, bold: tone === 'bad', color: RC.ink }));
      if (pillTxt) {
        const [bg, fg] = tone === 'ok' ? [RC.okBg, RC.ok] : tone === 'bad' ? [RC.bad, RC.white] : tone === 'sel' ? [RC.selBg, RC.sel] : [RC.naBg, RC.na];
        d.rrect(W - M - 2 - pw, y + 1.4, pw, 6.2, 3.1, bg); d.text(pillTxt, W - M - 2 - pw / 2, y + 5.7, { size: 8.8, bold: true, color: fg, align: 'center' });
      } else if (ans != null && !longAns) d.text(ans, W - M - 3, y + 5.4, { size: 10.5, bold: true, color: RC.ink, align: 'right' });
      else if (ans == null && it.type !== 'text') d.text('–', W - M - 3, y + 5.4, { size: 10.5, color: RC.muted, align: 'right' });
      let yy = y + labH + 1.2;
      bl.forEach(l => { d.text(l, M + 3, yy + 3.4, { size: 10, color: tone === 'bad' ? RC.bad : RC.ink, bold: tone === 'bad' }); yy += 4.6; });
      nl.forEach(l => { d.text(l, M + 3, yy + 3.4, { size: 9, color: RC.muted }); yy += 4.2; });
      y += bodyH;
      d.line(M, y, W - M, y, RC.line, 0.15);
    }
    y += 3;
  }

  // ----- Bilder (store, to og to) -----
  if (pc) {
    const pw = 80, gap = 10, x0 = M + (CW - 2 * pw - gap) / 2, maxH = 112;
    d.addPage(); y = TOP;
    d.text('Bilder', M, y + 4, { size: 16, bold: true, color: RC.ink }); d.line(M, y + 8, W - M, y + 8, RC.acc, 0.35); y += 14;
    const list = Object.keys(pnum).sort((a, b) => pnum[a] - pnum[b]);
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2).map(p => {
        const pi = pinfo[p]; let w = pw, h = w * pi.h / pi.w; if (h > maxH) { h = maxH; w = h * pi.w / pi.h; }
        return { p, pi, w, h, cap: d.wrap(pi.cap, 8, false, pw - 18)[0] };
      });
      const rowH = Math.max(...pair.map(o => o.h)) + 13;
      if (y + rowH > BOT) { d.addPage(); y = TOP; }
      pair.forEach((o, j) => {
        const x = x0 + j * (pw + gap);
        d.image(o.pi.data, o.pi.w, o.pi.h, x, y, o.w, o.h);
        d.text(`Bilde ${pnum[o.p]}`, x, y + o.h + 4.4, { size: 8.5, bold: true, color: RC.ink });
        d.text(o.cap, x + 17, y + o.h + 4.4, { size: 8, color: RC.muted });
      });
      y += rowH;
    }
  }

  // ----- Bunntekst -----
  const n = d.pages.length;
  for (let i = 0; i < n; i++) {
    d.usePage(i);
    d.line(M, 284, W - M, 284, RC.line);
    d.text(`${tpl.name}  ·  ${ins.site}  ·  ${fmt(ins.date)}`, M, 289, { size: 8, color: RC.muted });
    d.text(`Side ${i + 1} av ${n}`, W - M, 289, { size: 8, color: RC.muted, align: 'right' });
  }
  return d.output();
}

/* ---------- Sikkerhetskopi ---------- */
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function exportBackup() {
  toast('Lager sikkerhetskopi…', 8000);
  await flushAll();
  const photos = [];
  for (const p of await DB.all('photos')) photos.push({ id: p.id, w: p.w, h: p.h, data: await blobToB64(p.blob) });
  const data = { app: 'oseberg-inspeksjon', version: 1, exportedAt: new Date().toISOString(), settings: { ...S.settings, trello: undefined, hub: undefined }, inspections: await DB.all('inspections'), photos };
  const file = new File([JSON.stringify(data)], `inspeksjoner-sikkerhetskopi-${todayISO()}.json`, { type: 'application/json' });
  S.settings.lastBackup = todayISO(); saveSettings();
  S.ready_file = { file, title: 'Sikkerhetskopien er klar' };
  $('#toast').hidden = true; renderSheet();
}
$('#importpick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'oseberg-inspeksjon') throw new Error('Filen er ikke en sikkerhetskopi fra denne appen.');
    let added = 0;
    if (data.settings && data.settings.notes) { S.settings.notes = { ...data.settings.notes, ...S.settings.notes }; saveSettings(); }
    for (const p of data.photos || []) {
      const bin = Uint8Array.from(atob(p.data), c => c.charCodeAt(0));
      await DB.put('photos', { id: p.id, w: p.w, h: p.h, blob: new Blob([bin], { type: 'image/jpeg' }) });
    }
    for (const i of data.inspections || []) {
      const mine = S.ins[i.id];
      if (!mine || (i.updatedAt || 0) > (mine.updatedAt || 0)) { S.ins[i.id] = i; await DB.put('inspections', i); added++; }
    }
    render(); toast(`Gjenopprettet ${added} inspeksjoner`);
  } catch (err) { toast('Kunne ikke gjenopprette: ' + err.message, 5000); }
});

/* ---------- Trello ---------- */
// Når Hub er satt opp går Trello-kall via Hub (nøkkel og token ligger der). Ellers brukes nøkkel og token fra Innstillinger.
const trelloCfg = () => { if (hubCfg()) return { hub: true }; const t = S.settings.trello || {}; return t.key && t.token ? t : null; };
async function tfetch(method, path, params = {}, body) {
  const cfg = trelloCfg(); if (!cfg) throw new Error('Ikke koblet til Trello');
  let r;
  if (cfg.hub) { const h = hubCfg(); r = await fetch(`${h.url}/trello/${path}?${new URLSearchParams(params)}`, { method, body, headers: { 'x-argus-code': h.code } }); }
  else r = await fetch(`https://api.trello.com/1/${path}?${new URLSearchParams({ ...params, key: cfg.key, token: cfg.token })}`, { method, body });
  if (!r.ok) { const e = new Error('Trello ' + r.status); e.status = r.status; e.body = (await r.text().catch(() => '')).slice(0, 160); throw e; }
  return r.json();
}
function trelloErr(e) {
  if (hubCfg()) {
    if (e.status === 401 && /kode/i.test(e.body || '')) return 'Hub avviste koden. Sjekk Hub-koden under Innstillinger.';
    if (e.status === 401) return 'Trello avviste token som ligger i Hub. Hent nytt token og oppdater secret TRELLO_TOKEN i Cloudflare.';
    if (e.status === 500 && /Trello er ikke/.test(e.body || '')) return 'Trello er ikke satt opp i Hub. Legg inn secrets TRELLO_KEY og TRELLO_TOKEN i Cloudflare.';
    if (e.status === 403) return 'Hub tillater ikke dette Trello-kallet. Er worker.js oppdatert?';
    if (e.status) return `Trello via Hub ga feil ${e.status}. ${e.body || ''}`;
    return navigator.onLine ? 'Fikk ikke kontakt med Hub. Sjekk adressen.' : 'Ingen nett. Handlingene sendes når du har dekning igjen.';
  }
  if (e.status === 401) return 'Trello avviste nøkkel eller token. Sjekk at begge er limt inn riktig, uten mellomrom.';
  if (e.status === 404) return 'Trello finner ikke tavlen Vaktmester. Har kontoen din tilgang?';
  if (e.status) return `Trello ga feil ${e.status}. ${e.body || ''}`;
  return navigator.onLine ? 'Fikk ikke kontakt med Trello. Sjekk at https://argus.osebergdrift.no er lagt til under Allowed origins for API-nøkkelen.' : 'Ingen nett. Handlingene sendes når du har dekning igjen.';
}
async function trelloMembers() {
  const t = S.settings.trello;
  if (t.members && Date.now() - (t.membersAt || 0) < 7 * 864e5) return t.members;
  t.members = await tfetch('GET', `boards/${TRELLO.board}/members`, { fields: 'fullName,username' });
  t.membersAt = Date.now(); saveSettings(); return t.members;
}
const nrm = s => String(s || '').trim().toLowerCase();
function findMember(list, who) {
  const w = nrm(who); if (!w) return null;
  return list.find(m => nrm(m.fullName) === w || nrm(m.username) === w) || list.find(m => nrm(m.fullName).split(' ')[0] === w) || null;
}
function cardDesc(ins, tpl, key, a, act) {
  const { sec, it, inst } = findItem(tpl, key);
  const val = Array.isArray(a.value) ? a.value.join(', ') : (a.value ?? '');
  const L = [];
  if ((act.text || '').includes('\n')) L.push(act.text.trim(), '');
  L.push(`**Sjekkliste:** ${tpl.name}`, `**Sted:** ${ins.site}`, `**Dato:** ${fmt(ins.date)}`);
  if (ins.anl && ANL[ins.anl]) L.push(`**Anlegg:** ${ANL[ins.anl].name}`); else if (ins.annet) L.push('**Anlegg:** Annet');
  if ((ins.where || '').trim()) L.push(`**Hvor:** ${ins.where.trim()}`);
  L.push(`**Punkt:** ${sec ? sec.title + (sec.repeat ? ' – ' + sec.unit + ' ' + (inst + 1) : '') : ''}${it ? ' › ' + it.label : ''}`);
  if (val !== '') L.push(`**Svar:** ${val}`);
  if (a.note) L.push(`**Notat:** ${a.note}`);
  L.push(`**Prioritet:** ${act.prio || 'Lav'}`, `**Ansvarlig:** ${act.who || '-'}`, `**Utført av:** ${ins.by}`);
  return L.join('\n');
}
const saveIns = ins => { ins.updatedAt = Date.now(); scheduleSave(ins.id); return flush(ins.id); };
const PRIO_LABEL = { 'Høy': ['Prioritet høy', 'red'], 'Middels': ['Prioritet middels', 'orange'], 'Lav': ['Prioritet lav', 'yellow'] };
async function prioLabel(prio) {
  const def = PRIO_LABEL[prio || 'Lav']; if (!def) return null;
  const t = S.settings.trello; t.labels ||= {};
  if (t.labels[def[0]]) return t.labels[def[0]];
  const all = await tfetch('GET', `boards/${TRELLO.board}/labels`, { fields: 'name,color', limit: 100 });
  let l = all.find(x => (x.name || '').toLowerCase() === def[0].toLowerCase());
  if (!l) l = await tfetch('POST', 'labels', { name: def[0], color: def[1], idBoard: TRELLO.board });
  t.labels[def[0]] = l.id; saveSettings(); return l.id;
}
async function sendCard(ins, tpl, key, a, act, listId) {
  const members = await trelloMembers().catch(() => []);
  const lab = await prioLabel(act.prio).catch(e => { toast('Prioritetsetikett feilet: ' + trelloErr(e), 6000); return null; });
  const mem = findMember(members, act.who);
  const params = { idList: listId, name: (act.text || '').trim().split('\n')[0].slice(0, 150), desc: cardDesc(ins, tpl, key, a, act), pos: 'top' };
  if (act.due) params.due = new Date(parseISO(act.due).getTime() + 12 * 36e5).toISOString();
  if (mem) params.idMembers = mem.id;
  if (lab) params.idLabels = lab;
  let c;
  try { c = await tfetch('POST', 'cards', params); }
  catch (e) { if (!lab || e.status !== 400) throw e; S.settings.trello.labels = {}; saveSettings(); delete params.idLabels; c = await tfetch('POST', 'cards', params); }
  act.trello = { id: c.id, url: c.shortUrl || c.url, done: false, pics: 0 };
  await saveIns(ins);
}
async function sendPhotos(ins, a, act) {
  const pics = a.photos || [];
  while (act.trello.pics < pics.length) {
    const n = act.trello.pics, rec = await DB.get('photos', pics[n]);
    if (rec) { const f = new FormData(); f.append('file', rec.blob, `bilde-${n + 1}.jpg`); f.append('name', `Bilde ${n + 1}`); await tfetch('POST', `cards/${act.trello.id}/attachments`, {}, f); }
    act.trello.pics = n + 1; await saveIns(ins);
  }
}
function trelloPending() {
  let n = 0, empty = 0;
  for (const ins of Object.values(S.ins)) {
    if (ins.status !== 'complete') continue;
    for (const a of Object.values(ins.answers)) for (const act of a.actions || []) {
      if (!act.trello) { if ((act.text || '').trim()) n++; else empty++; }
      else if (!!act.done !== !!act.trello.done || act.trello.pics < (a.photos || []).length) n++;
    }
  }
  return { n, empty };
}
function trelloHomeLine() {
  const { n, empty } = trelloPending();
  if (!trelloCfg()) return Object.values(S.ins).some(i => i.status === 'complete') ? '<p class="muted small">Koble til Trello under Innstillinger for å sende handlingene automatisk.</p>' : '';
  if (!n && !empty) return '';
  return `${S.trErr && n ? `<p class="t-bad small">Siste forsøk feilet: ${esc(S.trErr)}</p>` : ''}<div class="tr-line"><span class="muted small">${n ? n + ' venter på sending til Trello' : ''}${empty ? (n ? ' · ' : '') + empty + ' uten tekst (sendes ikke)' : ''}</span>${n ? '<button class="link" data-act="tr-sync">Send nå</button>' : ''}</div>`;
}
const trTag = (act, sent) => act.trello && act.trello.id
  ? `<a class="tr-tag" href="${esc(act.trello.url)}" target="_blank" rel="noopener">${act.closedIn ? 'Lukket i ' + esc(act.closedIn) : 'I Trello'} ↗</a>`
  : (sent ? '<span class="tr-tag wait">Venter på Trello</span>' : '');
async function syncTrello(manual) {
  if (S.syncing) return;
  if (!trelloCfg()) { if (manual === true) toast('Legg inn API-nøkkel og token under Innstillinger først.'); return; }
  if (!navigator.onLine) { if (manual === true) toast('Ingen nett. Handlingene sendes når du har dekning igjen.'); return; }
  S.syncing = true; let sent = 0, upd = 0, err = null, closed = 0;
  try {
    const tracked = [];
    for (const ins of Object.values(S.ins)) for (const a of Object.values(ins.answers)) for (const act of a.actions || []) if (act.trello?.id && !act.done) tracked.push({ ins, act });
    if (tracked.length) {
      const cards = await tfetch('GET', `boards/${TRELLO.board}/cards/all`, { fields: 'closed,dueComplete,idList' });
      if (Array.isArray(cards)) {
        const byId = Object.fromEntries(cards.map(c => [c.id, c]));
        for (const { ins, act } of tracked) {
          let c = byId[act.trello.id];
          if (!c) { try { c = await tfetch('GET', `cards/${act.trello.id}`, { fields: 'closed,dueComplete,idList' }); } catch (e) { if (e.status !== 404) continue; c = null; } }
          if (!c || c.closed || c.dueComplete || c.idList === TRELLO.done) { act.done = true; act.upd = Date.now(); act.doneBy = 'Trello'; act.doneAt = todayISO(); act.closedIn = !c ? 'Trello (kortet er slettet)' : c.closed ? 'Trello (arkivert)' : c.idList === TRELLO.done ? 'Trello (Ferdig)' : 'Trello'; act.trello.done = true; closed++; await saveIns(ins); }
        }
      }
    }
    for (const ins of Object.values(S.ins)) {
      if (ins.status !== 'complete') continue;
      const tpl = TPL[ins.templateId]; if (!tpl) continue;
      for (const [key, a] of Object.entries(ins.answers)) for (const act of a.actions || []) {
        const listId = TRELLO.lists[listKey(ins, key)];
        if (!act.trello) { if (!listId || !(act.text || '').trim()) continue; await sendCard(ins, tpl, key, a, act, listId); sent++; }
        if (!act.trello) continue;
        if (act.trello.pics < (a.photos || []).length) await sendPhotos(ins, a, act);
        if (!!act.done !== !!act.trello.done) {
          if (act.due) await tfetch('PUT', `cards/${act.trello.id}`, { dueComplete: act.done ? 'true' : 'false' });
          act.trello.done = !!act.done; upd++; await saveIns(ins);
        }
      }
    }
  } catch (e) { err = e; }
  S.syncing = false;
  await flushAll();
  S.trErr = err ? (err.status || /fetch|load failed|network/i.test(err.message || '') ? trelloErr(err) : 'Feil i appen: ' + (err.message || err)) : null;
  if (err) { console.error(err); if (err.status || manual === true) toast(S.trErr, 8000); }
  else if (sent || closed) toast([sent ? `${sent} ${sent === 1 ? 'handling' : 'handlinger'} sendt til Trello` : '', closed ? `${closed} lukket i Trello` : ''].filter(Boolean).join(' · '));
  else if (manual === true) toast(upd ? 'Trello er oppdatert' : 'Ingen handlinger venter');
  if (S.view !== 'ins' && !S.showSettings) render();
}

/* ---------- Argus Hub (delt logg) ---------- */
const hubCfg = () => { const h = S.settings.hub || {}; return h.url && h.code ? { url: h.url.replace(/\/+$/, ''), code: h.code } : null; };
const hubErr = e => e && e.status === 401 ? 'Feil Hub-kode.' : e && e.status ? `Hub svarte med feil (${e.status}): ${e.message}` : 'Fikk ikke kontakt med Hub. Sjekk adressen og dekningen.';
async function hubFetch(method, path, body, raw) {
  const c = hubCfg(); if (!c) throw new Error('Hub er ikke satt opp');
  const r = await fetch(c.url + path, { method, headers: { 'x-argus-code': c.code, ...(body && !raw ? { 'content-type': 'application/json' } : {}) }, body: raw ? body : body ? JSON.stringify(body) : undefined });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) {} const e = new Error(m || String(r.status)); e.status = r.status; throw e; }
  return r.json();
}
const insSite = i => i.siteId || ANL[i.anl]?.site || SITES.find(s => s.tpls.includes(i.templateId))?.id || null;
const hubRec = i => ({ id: i.id, tpl: i.templateId, name: TPL[i.templateId]?.name || '', siteId: insSite(i), date: i.date, by: i.by || '', at: i.completedAt || i.updatedAt, flags: stats(i).flags || 0, nact: stats(i).actions || 0 });
/* ---------- Delte handlinger via Hub ----------
   Bare handlinger fra fullførte inspeksjoner deles. Kladder er lokale. «Utført» avgjøres av siste endring (upd). */
const persistActs = () => { try { localStorage.setItem('insp-acts', JSON.stringify({ items: S.hubActs })); } catch (e) {} };
const actAnl = (ins, key) => [...new Set(ANLEGG.filter(a => a.cov.some(c => covOf(c, ins) && covMatch(c, key, ins))).map(a => a.id).concat(ins.anl ? [ins.anl] : []))];
const actRec = (ins, key, act) => ({ id: act.id, iid: ins.id, key, text: act.text || '', due: act.due || '', who: act.who || '', prio: act.prio || 'Lav', done: !!act.done, doneAt: act.doneAt || '', doneBy: act.doneBy || '', closedIn: act.closedIn || '',
  tr: act.trello?.id ? { id: act.trello.id, url: act.trello.url || '' } : null, tpl: TPL[ins.templateId]?.name || '', tplId: ins.templateId, siteId: actSite(ins, key) || insSite(ins) || '', date: ins.date || '', by: ins.by || '', anl: actAnl(ins, key), upd: act.upd || 0 });
async function pushRemoteEdits() {
  for (const r of Object.values(S.hubActs)) if (r.dirty) { const { dirty, ...rec } = r; await hubFetch('PUT', '/act/' + r.id, rec); delete r.dirty; persistActs(); }
}
async function pullActs() {
  const r = await hubFetch('GET', '/actions'), next = {};
  for (const rec of r.items || []) { const mine = S.hubActs[rec.id]; next[rec.id] = mine && mine.dirty ? mine : rec; }
  S.hubActs = next; persistActs(); openCache = null;
  for (const rec of Object.values(next)) {
    const ins = S.ins[rec.iid], act = ins && ins.status === 'complete' ? ins.answers[rec.key]?.actions?.find(z => z.id === rec.id) : null;
    if (!act || !((rec.upd || 0) > (act.upd || 0)) || !!rec.done === !!act.done) continue;
    act.done = !!rec.done; act.doneAt = rec.doneAt || ''; act.doneBy = rec.doneBy || ''; act.upd = rec.upd;
    if (rec.closedIn) act.closedIn = rec.closedIn; else delete act.closedIn;
    act.hubSig = JSON.stringify(actRec(ins, rec.key, act)); await saveIns(ins);
  }
}
async function pushActs() {
  for (const ins of Object.values(S.ins)) {
    if (ins.status !== 'complete' || !TPL[ins.templateId]) continue; let dirty = false;
    for (const [key, a] of Object.entries(ins.answers)) for (const act of a.actions || []) {
      if (!(act.text || '').trim()) continue;
      const rec = actRec(ins, key, act), sig = JSON.stringify(rec);
      if (act.hubSig === sig) continue;
      await hubFetch('PUT', '/act/' + act.id, rec); act.hubSig = sig; dirty = true; S.hubActs[act.id] = rec;
    }
    if (dirty) await saveIns(ins);
  }
  persistActs(); openCache = null;
}
async function reapActs() {
  for (const r of Object.values(S.hubActs)) {
    const ins = S.ins[r.iid]; if (r.done || !ins || ins.status !== 'complete') continue;
    if ((ins.answers[r.key]?.actions || []).some(z => z.id === r.id)) continue;
    const rec = { ...r, done: true, closedIn: 'Fjernet', doneBy: S.settings.by || '', upd: Date.now() }; delete rec.dirty;
    await hubFetch('PUT', '/act/' + r.id, rec); S.hubActs[r.id] = rec;
  }
  persistActs(); openCache = null;
}
function hubCloseActs(ins) {
  if (!ins || ins.status !== 'complete' || !hubCfg() || !navigator.onLine) return;
  for (const [key, a] of Object.entries(ins.answers || {})) for (const act of a.actions || [])
    if (act.hubSig && !act.done) hubFetch('PUT', '/act/' + act.id, { ...actRec(ins, key, act), done: true, closedIn: 'Inspeksjonen er slettet', doneBy: S.settings.by || '', upd: Date.now() }).catch(() => {});
}
async function toggleRemoteAct(id, checked) {
  const r = S.hubActs[id]; if (!r) return;
  r.done = checked; r.doneBy = checked ? (S.settings.by || '') : ''; r.doneAt = checked ? todayISO() : ''; r.upd = Date.now(); r.dirty = true; openCache = null; persistActs();
  toast(checked ? 'Handlingen er merket som utført' : 'Handlingen er åpnet igjen'); setTimeout(render, 350);
  try { if (r.tr?.id && r.due && trelloCfg() && navigator.onLine) await tfetch('PUT', `cards/${r.tr.id}`, { dueComplete: checked ? 'true' : 'false' }); } catch (e) {}
  setTimeout(hubSync, 800);
}
/* Hvilke anlegg/kontroller en inspeksjon dekker. Sendes til Hub, slik at alle telefoner ser hva som er utført. */
function covKeys(i) {
  const out = [];
  for (const a of ANLEGG) a.cov.forEach((c, ci) => {
    if (!covOf(c, i)) return;
    if (covItems(c, i).some(x => answered(i.answers[x.key]) || (i.answers[x.key]?.actions || []).length)) out.push(a.id + '|' + ci);
  });
  return out;
}
const hubRecSync = i => ({ ...hubRec(i), ac: covKeys(i) });
const hubRows = () => Object.values(S.hubMonths || {}).flatMap(m => m.rows || []);
async function hubSync(manual) {
  const c = hubCfg();
  if (!c) { if (manual === true) toast('Legg inn adresse og kode til Hub under Innstillinger først.'); return; }
  if (S.hubBusy && Date.now() - (S.hubBusyAt || 0) < 60000) return;
  if (!navigator.onLine) { if (manual === true) toast('Ingen nett. Oppdateres når du har dekning.'); return; }
  S.hubBusy = true; S.hubBusyAt = Date.now(); S.hubErrMsg = null;
  try {
    try { await loadContent(); } catch (e) { if (e.status === 404) S.hubErrMsg = 'Hub har ikke innhold ennå. En administrator må laste opp innholdsfilen.'; else throw e; }
    if (!TEMPLATES.length) { S.hubBusy = false; if (S.view !== 'ins') render(); return; }
    for (const i of Object.values(S.ins)) {
      if (i.status !== 'complete' || !TPL[i.templateId] || !i.date) continue;
      const rec = hubRecSync(i), sig = JSON.stringify(rec);
      if (i.hubSig === sig) continue;
      await hubFetch('PUT', '/log/' + i.id, rec);
      i.hubSig = sig; await saveIns(i);
    }
    const yms = recentMonths(13), cur = yms[0], now = Date.now();
    /* Sparer KV-kall i Hub (gratisgrense per døgn): nyeste måned høyst hvert 90. sekund, forrige måned hver 6. time,
       eldre måneder hver 24. time. «Oppdater nå» henter bare de to nyeste. Manglende måneder hentes én gang. */
    let rev = null; try { rev = (await hubFetch('GET', '/rev')).rev || null; } catch (e) { if (e.status === 401) throw e; }
    const idle = !!rev && rev === S.hubRev && manual !== true && !!S.hubMonths[cur] && S.view !== 'inbox';   // ingenting nytt i Hub siden sist
    if (idle) S.hubMonths[cur].at = now;
    const need = yms.filter((y, k) => !S.hubMonths[y] || (k === 0 && (rev ? !idle : (manual === true || now - S.hubMonths[y].at > 90e3))) || (k === 1 && (manual === true || now - S.hubMonths[y].at > 6 * 3600e3)) || (k > 1 && now - S.hubMonths[y].at > 24 * 3600e3));
    const got = await Promise.all(need.map(async y => { try { return [y, await hubFetch('GET', '/month/' + y)]; } catch (e) { if (y === cur || e.status === 401) throw e; return null; } }));
    try { await loadLinks(); } catch (e) { if (e.status === 401) throw e; }
    if (manual === true || S.view === 'inbox' || !S.inbox || (rev ? !idle : now - (S.inboxAt || 0) > 300e3)) {
      try { S.inbox = (await hubFetch('GET', '/inbox')).items || []; S.inboxAt = now; } catch (e) { if (e.status === 401) throw e; S.inbox = S.inbox || null; }
    }
    S.actsErr = null;
    const pullNow = manual === true || (rev ? !idle : now - (S.actsAt || 0) > 120e3) || Object.values(S.hubActs).some(r => r.dirty);
    try { await pushRemoteEdits(); if (pullNow) { await pullActs(); S.actsAt = now; } await pushActs(); await reapActs(); }
    catch (e) { if (e.status === 401) throw e; S.actsErr = e.status === 404 ? 'Hub mangler oppdatering. Handlinger deles ikke ennå.' : hubErr(e); console.warn('Delte handlinger', e); }
    for (const g of got) if (g) S.hubMonths[g[0]] = { rows: g[1].rows || [], at: Date.now() };
    for (const y of Object.keys(S.hubMonths)) if (!yms.includes(y)) delete S.hubMonths[y];
    try { localStorage.setItem('insp-hub', JSON.stringify({ months: S.hubMonths })); } catch (e) {}
    if (rev && !S.actsErr) { S.hubRev = rev; try { localStorage.setItem('insp-rev', rev); } catch (e) {} }
    if (manual === true) toast('Oppdatert fra Hub');
  } catch (e) { S.hubErrMsg = hubErr(e); console.error(e); if (manual === true) toast(S.hubErrMsg, 8000); }
  S.hubBusy = false;
  await flushAll();
  if (S.view !== 'ins') render();
  if (S.view === 'inbox') loadInboxPics();
}
async function loadContent() {
  if (!hubCfg() || !navigator.onLine || S.view === 'ins') return false;
  const r = await hubFetch('GET', '/content');
  if (!r.src) { const e = new Error('Tomt innhold'); e.status = 404; throw e; }
  if (r.at === S.contentAt && TEMPLATES.length) return false;
  applyContent(r.src); S.contentAt = r.at;
  try { localStorage.setItem('insp-content', JSON.stringify({ at: r.at, src: r.src })); } catch (e) {}
  return true;
}
async function gateConnect() {
  S.gateErr = null;
  if (!hubCfg()) { S.gateErr = 'Legg inn både adresse og kode.'; render(); return; }
  S.hubBusy = true; render();
  try { await hubFetch('GET', '/ping'); await loadContent(); if (!TEMPLATES.length) S.gateErr = 'Hub har ikke innhold ennå.'; }
  catch (e) { S.gateErr = e.status === 404 ? 'Hub har ikke innhold ennå. En administrator må laste opp innholdsfilen.' : hubErr(e); }
  S.hubBusy = false; render();
  if (TEMPLATES.length) { toast('Koblet til. Sjekklister og bygg er lastet.', 3500); hubSync(); syncTrello(); }
}
$('#contentpick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const src = await f.text();
    const c = new Function(src)();
    if (!c || !Array.isArray(c.TEMPLATES) || !Array.isArray(c.SITES) || !Array.isArray(c.ANLEGG) || !c.TRELLO) throw new Error('Ugyldig innholdsfil');
    if (!hubCfg()) throw new Error('Legg inn Hub-adresse og kode først.');
    await hubFetch('PUT', '/content', src, true);
    S.contentAt = null; S.gateErr = null; await loadContent(); render(); toast('Innholdet er lastet opp til Hub', 4000); hubSync();
  } catch (err) { toast(err.status === 403 ? 'Bare administrator kan laste opp innhold.' : err.status ? hubErr(err) : 'Kunne ikke laste opp: ' + (err.message || err), 7000); }
});
async function hubBlob(path) {
  const c = hubCfg(); const r = await fetch(c.url + path, { headers: { 'x-argus-code': c.code } });
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.blob();
}
const fmtWhen = t => new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const guessSite = it => {
  if (it.site && SITES.some(x => x.id === it.site)) return it.site;
  const norm = x => ' ' + String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  const w = norm(it.where);
  const sc = SITES.map(x => ({ id: x.id, n: w.includes(norm(x.name)) ? 100 + x.name.length : (w.includes(norm(x.short)) || w.includes(norm(x.id))) ? 10 : 0 })).filter(x => x.n).sort((p, q) => q.n - p.n);
  return sc.length && (sc.length === 1 || sc[0].n > sc[1].n) ? sc[0].id : '';
};
const CAT_SHORT = { lokale: 'Eget lokale', fellesareal: 'Fellesareal', skade: 'Skade/hærverk', brikke: 'Adgangsbrikke' };
const ibHigh = it => it.cat === 'skade' || !!it.urgent;
const ibTitle = it => { const t = (it.text || '').replace(/\s+/g, ' ').trim(), p = CAT_SHORT[it.cat] ? CAT_SHORT[it.cat] + ': ' : ''; return p + (t.length > 70 ? t.slice(0, 67) + '…' : t); };
async function loadInboxPics() {
  let any = false;
  for (const it of S.inbox || []) {
    if (it.status !== 'ny') continue;
    for (let i = 0; i < (it.pics || 0); i++) {
      const k = it.id + ':' + i; if (S.inboxPics[k]) continue;
      try { S.inboxPics[k] = URL.createObjectURL(await hubBlob(`/inbox/${it.id}/pic/${i}`)); any = true; } catch (e) { S.inboxPics[k] = ''; }
    }
  }
  if (any && S.view === 'inbox') { const y = window.scrollY; render(); window.scrollTo(0, y); }
}
/* ---------- Del lenker og skjema ---------- */
const linksList = () => S.links || LINKS_DEFAULT;
async function loadLinks() {
  if (!hubCfg() || !navigator.onLine || S.linkEdit) return false;
  try {
    const r = await hubFetch('GET', '/links');
    if (r.at === S.linksAt && S.links) return false;
    S.links = r.links; S.linksAt = r.at;
    try { localStorage.setItem('insp-links', JSON.stringify({ at: r.at, links: r.links })); } catch (e) {}
    return true;
  } catch (e) { if (e.status === 404) return false; throw e; }
}
const lkFind = id => linksList().find(x => x.id === id);
async function lkCopy(id) {
  const l = lkFind(id); if (!l) return;
  try { await navigator.clipboard.writeText(l.url); toast('Lenken er kopiert'); }
  catch (e) { window.prompt('Kopier lenken', l.url); }
}
async function lkShare(id) {
  const l = lkFind(id); if (!l) return;
  if (navigator.share) { try { await navigator.share({ title: l.title, text: l.title, url: l.url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  await lkCopy(id);
}
async function lkSave() {
  const d = (S.linkDraft || []).map(l => ({ ...l, title: (l.title || '').trim(), desc: (l.desc || '').trim(), url: (l.url || '').trim(), sheet: (l.sheet || '').trim() }));
  const bad = d.find(l => !/^https:\/\/\S+\.\S+/i.test(l.url));
  if (bad) { toast('Lenken «' + (bad.title || 'uten navn') + '» må starte med https://', 5000); return; }
  const bs = d.find(l => l.sheet && !/^https:\/\/\S+\.\S+/i.test(l.sheet));
  if (bs) { toast('Regnearket til «' + (bs.title || 'uten navn') + '» må starte med https://', 5000); return; }
  if (d.some(l => !l.title)) { toast('Alle lenker må ha et navn.', 4000); return; }
  if (!hubCfg() || !navigator.onLine) { toast('Du må ha nett og Hub for å lagre lenkene.', 5000); return; }
  try {
    await hubFetch('PUT', '/links', { links: d });
    S.links = d; S.linksAt = Date.now(); try { localStorage.setItem('insp-links', JSON.stringify({ at: S.linksAt, links: d })); } catch (e) {}
    S.linkEdit = false; S.linkDraft = null; render(); toast('Lenkene er lagret', 3000);
  } catch (e) { toast(e.status === 403 ? 'Bare administrator kan endre lenker.' : e.status ? hubErr(e) : 'Kunne ikke lagre: ' + (e.message || e), 6000); }
}
function renderLinks() {
  if (S.linkEdit) return renderLinksEdit();
  const ls = linksList(), share = ls.filter(l => l.group !== 'intern'), intern = ls.filter(l => l.group === 'intern');
  let h = '';
  if (!ls.length) h += `<p class="empty">Ingen lenker er lagt inn ennå. Trykk «Rediger lenker» nederst.</p>`;
  if (share.length) h += `<section><h2 class="h2">Til deling</h2><p class="muted small">Vis QR-koden til leietakeren, eller del lenken rett fra telefonen.</p><div class="list">${share.map(l => `<div class="linkcard"><div class="lk-t">${esc(l.title)}</div>${l.desc ? `<div class="rc-sub">${esc(l.desc)}</div>` : ''}<div class="row-btns"><a class="btn primary" href="${esc(l.url)}" target="_blank" rel="noopener">Åpne</a><button class="btn" data-act="lk-qr" data-id="${esc(l.id)}">Vis QR</button><button class="btn" data-act="lk-share" data-id="${esc(l.id)}">Del</button><button class="btn" data-act="lk-copy" data-id="${esc(l.id)}">Kopier</button></div></div>`).join('')}</div></section>`;
  if (intern.length) h += `<section><h2 class="h2">Interne skjema</h2><p class="muted small">Brukes bare internt.</p><div class="list">${intern.map(l => `<div class="linkcard"><div class="lk-t">${esc(l.title)}</div>${l.desc ? `<div class="rc-sub">${esc(l.desc)}</div>` : ''}<div class="row-btns"><a class="btn primary" href="${esc(l.url)}" target="_blank" rel="noopener">Åpne skjema</a>${l.sheet ? `<a class="btn" href="${esc(l.sheet)}" target="_blank" rel="noopener">Åpne regneark</a>` : `<button class="btn" data-act="lk-copy" data-id="${esc(l.id)}">Kopier lenke</button>`}</div></div>`).join('')}</div></section>`;
  h += `<button class="btn" data-act="lk-edit">Rediger lenker</button>`;
  const q = S.linkQr && lkFind(S.linkQr);
  if (q) { let svg; try { svg = QR.svg(q.url); } catch (e) { svg = '<p class="empty">Kunne ikke lage QR-kode.</p>'; }
    h += `<div class="qr-ov" role="dialog" aria-modal="true" aria-label="QR-kode"><div class="qr-card"><div class="lk-t">${esc(q.title)}</div><div class="qr-img">${svg}</div><div class="muted small qr-url">${esc(q.url.length > 70 ? q.url.slice(0, 67) + '…' : q.url)}</div><div class="row-btns"><button class="btn" data-act="lk-share" data-id="${esc(q.id)}">Del</button><button class="btn primary" data-act="lk-qr-close">Lukk</button></div></div></div>`; }
  return h;
}
function renderLinksEdit() {
  const d = S.linkDraft || [];
  let h = `<p class="muted small">Bare administrator kan lagre. Lenker må starte med https://.</p><div class="list">`;
  h += d.map((l, i) => `<div class="linkcard"><label class="fld"><span>Navn</span><input data-lk="title" data-id="${esc(l.id)}" value="${esc(l.title)}"></label>
    <label class="fld"><span>Beskrivelse (valgfri)</span><input data-lk="desc" data-id="${esc(l.id)}" value="${esc(l.desc)}"></label>
    <label class="fld"><span>Lenke</span><input data-lk="url" data-id="${esc(l.id)}" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(l.url)}"></label>
    <label class="fld"><span>Regneark (valgfri, vises som «Åpne regneark» på interne)</span><input data-lk="sheet" data-id="${esc(l.id)}" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(l.sheet || '')}"></label>
    <label class="fld"><span>Hvor vises den</span><select data-lk="group" data-id="${esc(l.id)}"><option value="share"${l.group !== 'intern' ? ' selected' : ''}>Til deling (Åpne, QR, Del, Kopier)</option><option value="intern"${l.group === 'intern' ? ' selected' : ''}>Intern (Åpne skjema)</option></select></label>
    <div class="row-btns"><button class="btn" data-act="lk-up" data-id="${esc(l.id)}"${i === 0 ? ' disabled' : ''} aria-label="Flytt opp">↑</button><button class="btn" data-act="lk-down" data-id="${esc(l.id)}"${i === d.length - 1 ? ' disabled' : ''} aria-label="Flytt ned">↓</button><button class="btn" data-act="lk-del" data-id="${esc(l.id)}">Slett</button></div></div>`).join('');
  h += `</div><button class="btn" data-act="lk-add">+ Legg til lenke</button><div class="row-btns"><button class="btn" data-act="lk-cancel">Avbryt</button><button class="btn primary" data-act="lk-save">Lagre</button></div>`;
  return h;
}

function renderInbox() {
  const all = S.inbox || [], ny = all.filter(x => x.status === 'ny'), done = all.filter(x => x.status !== 'ny').slice(0, 10);
  let h = '';
  if (!ny.length) h += '<p class="empty">Ingen nye innmeldinger.</p>';
  h += ny.map(it => {
    const ed = S.ibEdit[it.id] || {}, site = ed.site ?? guessSite(it);
    return `<section class="panel ib"><div class="ib-top"><strong>${esc(it.name)}</strong> <a href="tel:${esc(it.phone.replace(/[^\d+]/g, ''))}">${esc(it.phone)}</a><span class="muted small">${esc(fmtWhen(it.at))}</span></div>
      ${it.cat ? `<p class="ib-tags"><span class="ib-cat${it.cat === 'skade' ? ' hi' : ''}">${esc(CAT_SHORT[it.cat] || it.cat)}</span>${it.urgent ? '<span class="ib-cat hi">Haster</span>' : ''}</p>` : ''}
      ${it.where ? `<p class="muted small ib-where">${it.cat ? 'Hvor/lokale' : 'Oppgitt bygg/leietaker'}: <strong>${esc(it.where)}</strong></p>` : ''}
      <p class="ib-text">${esc(it.text)}</p>
      ${it.pics ? `<div class="ib-pics">${Array.from({ length: it.pics }, (_, i) => S.inboxPics[it.id + ':' + i] ? `<img src="${S.inboxPics[it.id + ':' + i]}" alt="Bilde ${i + 1} fra innmeldingen">` : '<span class="muted small">Laster bilde …</span>').join('')}</div>` : ''}
      <label class="fld"><span>Bygg</span><select class="inp" data-ib="site" data-id="${it.id}"><option value="">Velg bygg</option>${SITES.map(x => `<option value="${x.id}"${x.id === site ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Tittel på kortet i Trello</span><input class="inp" data-ib="title" data-id="${it.id}" value="${esc(ed.title ?? ibTitle(it))}"></label>
      <div class="row-btns"><button class="btn primary" data-act="ib-ok" data-id="${it.id}">Godkjenn til Trello</button><button class="btn" data-act="ib-no" data-id="${it.id}">Avvis</button></div></section>`;
  }).join('');
  if (done.length) h += `<section><h2 class="h2">Behandlet</h2><div class="list">${done.map(x => `<div class="mrow"><span class="rc-title">${esc(ibTitle(x))}</span><span class="rc-sub">${esc(fmtWhen(x.handledAt || x.at))} · ${x.status === 'godkjent' ? 'Godkjent' + (x.by ? ' av ' + esc(x.by) : '') : 'Avvist'}${x.card ? ` · <a href="${esc(x.card)}" target="_blank" rel="noopener">Åpne kort ↗</a>` : ''}</span></div>`).join('')}</div></section>`;
  return h;
}
async function extLabel() {
  const t = S.settings.trello; t.labels ||= {};
  if (t.labels['Ekstern melding']) return t.labels['Ekstern melding'];
  const all = await tfetch('GET', `boards/${TRELLO.board}/labels`, { fields: 'name,color', limit: 100 });
  let l = all.find(x => (x.name || '').toLowerCase() === 'ekstern melding');
  if (!l) l = await tfetch('POST', 'labels', { name: 'Ekstern melding', color: 'blue', idBoard: TRELLO.board });
  t.labels['Ekstern melding'] = l.id; saveSettings(); return l.id;
}
async function ibApprove(id, btn) {
  const it = (S.inbox || []).find(x => x.id === id); if (!it || S.ibBusy) return;
  const ed = S.ibEdit[id] ||= {}, siteId = ed.site ?? guessSite(it), site = SITES.find(x => x.id === siteId);
  if (!site) { toast('Velg bygg først.'); return; }
  const listId = TRELLO.lists[site.tl]; if (!listId) { toast('Fant ikke Trello-listen for bygget.'); return; }
  if (!navigator.onLine) { toast('Du må ha nett for å godkjenne.'); return; }
  S.ibBusy = true; if (btn) { btn.disabled = true; btn.textContent = 'Sender …'; }
  try {
    if (!ed.cardId) {
      const lab = await extLabel().catch(() => null);
      const desc = `**Ekstern melding** (${fmtWhen(it.at)})\n**Fra:** ${it.name}, ${it.phone}\n**Bygg:** ${site.name}${it.cat ? '\n**Kategori:** ' + (CAT_SHORT[it.cat] || it.cat) + (it.urgent ? ' (haster)' : '') : ''}${it.where ? '\n**Oppgitt av avsender:** ' + it.where : ''}\n\n${it.text}`;
      const hi = ibHigh(it) ? await prioLabel('Høy').catch(() => null) : null;
      const params = { idList: listId, name: (ed.title ?? ibTitle(it)).trim() || ibTitle(it), desc, pos: 'top' }; const labs = [lab, hi].filter(Boolean); if (labs.length) params.idLabels = labs.join(',');
      const c = await tfetch('POST', 'cards', params); ed.cardId = c.id; ed.cardUrl = c.shortUrl || c.url || ''; ed.pics = 0;
    }
    for (let i = ed.pics || 0; i < (it.pics || 0); i++) {
      const blob = await hubBlob(`/inbox/${id}/pic/${i}`); const f = new FormData(); f.append('file', blob, `bilde-${i + 1}.jpg`); f.append('name', `Bilde ${i + 1}`);
      await tfetch('POST', `cards/${ed.cardId}/attachments`, {}, f); ed.pics = i + 1;
    }
    await hubFetch('PUT', `/inbox/${id}/status`, { status: 'godkjent', card: ed.cardUrl });
    it.status = 'godkjent'; it.card = ed.cardUrl; it.by = S.settings.by; it.handledAt = Date.now(); delete S.ibEdit[id];
    toast('Sendt til Trello', 3000);
  } catch (e) { toast(e.status ? trelloErr(e) : 'Kunne ikke godkjenne: ' + (e.message || e), 7000); }
  S.ibBusy = false; render();
}
async function ibReject(id) {
  const it = (S.inbox || []).find(x => x.id === id); if (!it) return;
  try { await hubFetch('PUT', `/inbox/${id}/status`, { status: 'avvist' }); it.status = 'avvist'; it.by = S.settings.by; it.handledAt = Date.now(); toast('Avvist', 2500); }
  catch (e) { toast(hubErr(e), 6000); }
  render();
}
function recentMonths(n) {
  let [y, m] = todayISO().slice(0, 7).split('-').map(Number); const out = [];
  for (let k = 0; k < n; k++) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (--m < 1) { m = 12; y--; } }
  return out;
}
const RECENT_N = 10;
function recentRows(siteId) {
  const byId = {};
  for (const mo of Object.values(S.hubMonths || {})) for (const r of mo.rows || []) byId[r.id] = r;
  for (const i of Object.values(S.ins)) if (i.status === 'complete' && TPL[i.templateId] && i.date) byId[i.id] = hubRec(i);
  return Object.values(byId).filter(r => r.tpl !== 'avvik' && (!siteId || r.siteId === siteId)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || 0) - (a.at || 0)).slice(0, RECENT_N);
}
function actsStatus() {
  const c = hubCfg(); if (!c) return '';
  let drafts = 0, unsent = 0, shared = 0;
  for (const i of Object.values(S.ins)) if (TPL[i.templateId]) for (const a of Object.values(i.answers)) for (const act of a.actions || []) {
    if (act.done || !(act.text || '').trim()) continue;
    if (i.status !== 'complete') drafts++; else if (!act.hubSig) unsent++; else shared++;
  }
  const remote = Object.values(S.hubActs || {}).filter(r => !r.done).length;
  if (S.actsErr) return `<p class="t-bad small">Delte handlinger: ${esc(S.actsErr)}</p>`;
  const parts = [`${remote} åpne i Hub`, drafts ? `${drafts} i kladder (deles ikke)` : '', unsent ? `${unsent} venter på sending` : ''].filter(Boolean);
  return `<p class="muted small">Delte handlinger: ${parts.join(' · ')}</p>`;
}
function recentHtml(siteId) {
  const rows = recentRows(siteId), c = hubCfg(), mo = S.hubMonths && S.hubMonths[recentMonths(1)[0]];
  const fresh = mo ? new Date(mo.at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : null;
  let h = `<section><h2 class="h2">Siste inspeksjoner</h2>`;
  h += rows.length ? `<div class="list">${rows.map(r => `<button class="mrow" data-act="recent-pdf" data-id="${esc(r.id)}"><span class="rc-title">${esc(r.name)}</span><span class="rc-sub">${siteId ? '' : esc(SITES.find(s => s.id === r.siteId)?.short || '') + ' · '}${fmt(r.date)}${r.by ? ' · ' + esc(r.by) : ''}${r.flags ? ` · <b class="t-bad">${r.flags} avvik</b>` : ''}</span><span class="pdf-tag" aria-hidden="true">PDF</span><span class="sr">Åpne PDF-rapport</span></button>`).join('')}</div>` : '<p class="empty">Ingen fullførte inspeksjoner ennå.</p>';
  h += actsStatus();
  h += c ? `<div class="tr-line"><span class="${S.hubErrMsg ? 't-bad ' : 'muted '}small">${S.hubErrMsg ? esc(S.hubErrMsg) : fresh ? 'Oppdatert kl. ' + fresh : 'Ikke hentet ennå'}</span><button class="link" data-act="hub-sync">${S.hubBusy ? 'Oppdaterer…' : 'Oppdater nå'}</button></div>`
    : '<p class="muted small">Koble til Argus Hub under Innstillinger for å se det alle har gjort.</p>';
  return h + '</section>';
}

async function hubBlob(path) {
  const c = hubCfg(); if (!c) throw new Error('Hub er ikke satt opp');
  const r = await fetch(c.url + path, { headers: { 'x-argus-code': c.code } });
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.blob();
}
async function openRecentPdf(id) {
  if (S.busy) return;
  const ins = S.ins[id];
  let rec = null; for (const mo of Object.values(S.hubMonths || {})) for (const r of mo.rows || []) if (r.id === id) rec = r;
  S.busy = true; toast('Henter PDF…', 8000);
  try {
    let blob, name;
    if (ins && ins.status === 'complete' && TPL[ins.templateId]) { blob = await buildReport(ins); name = pdfName(ins); }
    else {
      if (!hubCfg()) throw new Error('Koble til Hub under Innstillinger for å åpne PDF fra andre.');
      if (!navigator.onLine) throw new Error('Du må ha nett for å hente denne PDF-en.');
      blob = await hubBlob('/pdf/' + encodeURIComponent(id));
      name = `${rec ? rec.name + ' ' + fmt(rec.date) : 'Rapport'}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    }
    S.ready_file = { file: new File([blob], name, { type: 'application/pdf' }), title: 'PDF-rapporten er klar', canOpen: true };
    $('#toast').hidden = true;
  } catch (e) {
    toast(e && e.status === 404 ? 'Fant ingen PDF i Hub for denne inspeksjonen. Den ble kanskje fullført uten nett.' : e && e.status ? hubErr(e) : (e && e.message || 'Kunne ikke hente PDF') , 6000);
  }
  S.busy = false; render();
}

/* ---------- Oppstart ---------- */
(async () => {
  render();
  try {
    await DB.open();
    for (const i of await DB.all('inspections')) S.ins[i.id] = i;
    S.ready = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    S.error = 'Lagringen på enheten er ikke tilgjengelig. Privat nettlesing blokkerer den; åpne appen fra hjemskjermen.';
  }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded && S.view !== 'ins') { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
  syncTrello(); hubSync();
  window.addEventListener('online', () => { syncTrello(); hubSync(); });
  let hubLast = Date.now();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - hubLast > 60000) { hubLast = Date.now(); syncTrello(); hubSync(); } });
})();
