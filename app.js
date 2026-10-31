'use strict';
/* Argus – offline inspeksjonsapp. Data lagres i IndexedDB på enheten. */

/* ---------- Sjekklister ---------- */
const yn  = (id, label, o = {}) => ({ id, type: 'yn', label, ...o });
const ok  = (id, label, o = {}) => ({ id, type: 'ok', label, ...o });
const okm = (id, label, o = {}) => ({ id, type: 'okm', label, ...o });
const num = (id, label, unit, o = {}) => ({ id, type: 'number', label, unit, ...o });
const txt = (id, label, o = {}) => ({ id, type: 'text', label, ...o });
const dat = (id, label, o = {}) => ({ id, type: 'date', label, ...o });
const cho = (id, label, options, o = {}) => ({ id, type: 'choice', label, options, ...o });
const mul = (id, label, options, o = {}) => ({ id, type: 'multi', label, options, ...o });
const hd  = (id, label) => ({ id, type: 'heading', label });
const k12 = id => yn(id, 'Er det mindre enn 12 mnd siden siste sakkyndige kontroll?', { help: 'Hvis Nei: opprett handling og bestill service.' });

const vkBase = press => [
  ok('hovedventil', 'Hovedventil låst?'),
  ok('turbin', 'Turbinklokke ok?'),
  num('trykk_over', 'Trykk over', 'bar', { help: 'Ta gjerne bilde av loggboka.' }),
  num('trykk_under', 'Trykk under', 'bar'),
  ...(press ? [ok('press1', 'Alarmoverføring pressostat 1'), ok('press2', 'Alarmoverføring pressostat 2')] : []),
];
const vkTail = () => [
  hd('h_nokkel', 'Nøkkelboks'),
  yn('nokler', 'Har du husket å vri nøkler til normalposisjon?'),
  hd('h_alarm', 'Alarmtavle'),
  ok('sentral', 'Brannsentral ok'),
  ok('overforing', 'Alarmoverføring'),
];

const TEMPLATES = [
  {
    id: 'internkontroll', name: 'Periodisk internkontroll', site: 'Olsrød Park – Teknisk', months: 1,
    sections: [
      { id: 'endringer', title: 'Strukturelle og funksjonelle endringer i bygget', items: [
        yn('ombygg', 'Er det foretatt ombygninger av lokaler eller bygget siden forrige inspeksjon?', { flag: ['Ja'] }),
        txt('lokale', 'I hvilket lokale er ombygning utført?', { showIf: { item: 'ombygg', eq: 'Ja' } }),
        cho('arbeid', 'Hva slags arbeider er gjort?', ['Flytting av vegger', 'Nye gjennomføringer', 'Endring av dører', 'Annet'], { showIf: { item: 'ombygg', eq: 'Ja' } }),
        yn('egenregi', 'Skal det gjøres ferdigstillende arbeider i egen regi?', { flag: [], suggestOn: ['Ja'], help: 'Hvis Ja: opprett handling.', showIf: { item: 'ombygg', eq: 'Ja' } }),
        yn('brannceller', 'Kan endringene ha påvirket branncellebegrensende konstruksjoner?', { flag: ['Ja'], showIf: { item: 'ombygg', eq: 'Ja' } }),
        txt('entreprenor', 'Utførende entreprenør', { suggestOn: 'any', help: 'Entreprenøren bes sende dokumentasjon på at brannsikkerhetskrav er ivaretatt. Opprett handling med dato for oppfølging.', showIf: { item: 'brannceller', eq: 'Ja' } }),
        dat('befaring', 'Dato for befaring med entreprenør når arbeidene er ferdigstilt', { showIf: { item: 'ombygg', eq: 'Ja' } }),
      ] },
      { id: 'brann', title: 'Brann', items: [yn('tavle', 'Branntavle OK?'), k12('k12')] },
      { id: 'sprinkler', title: 'Sprinkleranlegg', items: [
        yn('finnes', 'Er det sprinkleranlegg i bygget?', { flag: [] }),
        yn('merket', 'Adgang til sprinkleranlegg er merket på dør', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('ryddig', 'Sprinklerrom er ryddig og i orden', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('ventiler', 'Stengeventiler er sikret/låst og merket', { showIf: { item: 'finnes', ne: 'Nei' } }),
        yn('loggbok', 'Loggbok er oppdatert og uten merknader', { showIf: { item: 'finnes', ne: 'Nei' } }),
        { ...k12('k12'), showIf: { item: 'finnes', ne: 'Nei' } },
      ] },
      { id: 'romning', title: 'Rømningsveier', items: [yn('ok', 'Er rømningsveier kontrollert og funnet i orden?')] },
      { id: 'ledelys', title: 'Markeringslys / ledelys', items: [
        yn('ok', 'Er markeringslys/ledelys OK?'),
        yn('avvik', 'Er det laget avvik?', { showIf: { item: 'ok', eq: 'Nei' } }),
      ] },
      { id: 'slokke', title: 'Håndslokkeapparater', items: [yn('ok', 'Er slokkeapparat sjekket og funnet i orden?'), k12('k12')] },
      { id: 'slanger', title: 'Brannslanger', items: [yn('ok', 'Er brannslangene sjekket og funnet i orden?'), k12('k12')] },
      { id: 'royk', title: 'Røykventilasjon / branngardiner', items: [yn('ok', 'Er røykventilasjon/branngardiner sjekket og funnet i orden?'), k12('k12')] },
      { id: 'dorer', title: 'Branndører og porter', items: [yn('ok', 'Er branndører og porter sjekket og funnet i orden?'), k12('k12')] },
    ],
  },
  {
    id: 'sprinkel_vk', name: 'Brann og sprinkeltest VK', site: 'Vekterkvartalet – Teknisk', months: 1,
    sections: [
      { id: 'sted', title: 'Hvilket sted', items: [mul('hvor', 'Hvor testes det?', ['Næring', 'Leiligheter trinn 1-3', 'Leiligheter trinn 4'])] },
      { id: 'naering', title: 'Næring', showIf: { item: 'sted.hvor', includes: 'Næring' }, items: [...vkBase(true), ...vkTail()] },
      { id: 'leil13', title: 'Leiligheter trinn 1-3', showIf: { item: 'sted.hvor', includes: 'Leiligheter trinn 1-3' }, items: [...vkBase(false), ...vkTail()] },
      { id: 'leil4', title: 'Leiligheter trinn 4', showIf: { item: 'sted.hvor', includes: 'Leiligheter trinn 4' }, items: [
        ...vkBase(false),
        hd('h_varme', 'Varmekabel sprinkler'),
        yn('sept_april', 'Er måneden i perioden sept–april?', { flag: [], neutral: true, auto: 'septApril' }),
        yn('varmekabel', 'Er test ok på både VK1 og VK2?', { showIf: { item: 'sept_april', eq: 'Ja' } }),
        ...vkTail(),
      ] },
      { id: 'innkobling', title: 'Innkobling', items: [yn('summer', 'Koble inn summer på panel', { help: 'Bekreft at summer er koblet inn igjen.' })] },
    ],
  },
  {
    id: 'kloakk', name: 'Kloakktest', site: 'Olsrød Park – Teknisk', months: 1,
    sections: [
      { id: 'kum', title: 'Kloakkum', repeat: true, unit: 'Kum', defaultCount: 2, items: [
        cho('sted', 'Hvor testes det?', ['Gammel del', 'Level'], { allowOther: true }),
        ok('tilstand', 'Generell tilstand i kum'),
        ok('pumper', 'Funksjonstest pumper', { help: 'Kjør pumper manuelt i minst 30 sek.' }),
        yn('arskontroll', 'Har det vært årskontroll siden forrige månedlige test?', { flag: [], neutral: true }),
        yn('auto', 'Er pumper satt tilbake i AUTO?'),
      ] },
    ],
  },
  {
    id: 'vernerunde', name: 'Vernerunde kvartalsvis', site: 'Sameiet VK, Vekterkvartalet – Teknisk', months: 3,
    sections: [
      { id: 'nodlys', title: 'Nødlys', items: [okm('ok', 'Nødlys kontrollert og funnet i orden?', { help: 'Utføres egen kontroll av nødlys: velg Merknad og skriv i notat.' })] },
      { id: 'elektro', title: 'Elektro – sikringsskap og tavler', items: [ok('tavler', 'Visuell kontroll av sikringsskapene og sjekk rundt i tavlerom')] },
      { id: 'slukke', title: 'Slukkeutstyr', items: [
        yn('handslokkere', 'Håndslokkere kontrollert og funnet i orden?'),
        yn('slanger', 'Brannslanger kontrollert og funnet i orden?'),
        yn('frost', 'Dersom i kuldeperiode: sjekk også frostvakter i brannskap. Sjekket ok?'),
      ] },
      { id: 'romning', title: 'Rømningsveier', items: [yn('frie', 'Er rømningsveier frie og uten lagring?')] },
      { id: 'hjerte', title: 'Hjertestarter', items: [
        ok('ok', 'Kontroller at hjertestarter er i orden'),
        dat('batteri', 'Utløpsdato batteri', { expiry: true }),
        dat('pads', 'Datostempling pads/elektroder', { expiry: true }),
      ] },
      { id: 'andre', title: 'Andre observasjoner', items: [
        hd('h_orden', 'Orden og renhold'),
        ok('rent', 'Er det rent og ryddig?'),
        ok('kilde', 'Fungerer kildesorteringen?'),
        ok('utvendig', 'Sjekk bygg for skader utvendig'),
        yn('andre', 'Andre observasjoner som ikke passer inn i kategoriene over?', { flag: ['Ja'], help: 'Ta bilde og opprett handling.' }),
        yn('skjema', 'Er det noe annet som bør legges til i dette skjemaet?', { flag: [], neutral: true }),
      ] },
    ],
  },
];
const TPL = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));
const TYPES = {
  ok:  { opts: ['Ok', 'Ikke OK', 'N/A'], flag: ['Ikke OK'] },
  okm: { opts: ['Ok', 'Ikke OK', 'Merknad', 'N/A'], flag: ['Ikke OK'] },
  yn:  { opts: ['Ja', 'Nei', 'N/A'], flag: ['Nei'] },
};
const CHOICE_TYPES = ['yn', 'ok', 'okm', 'choice'];

/* ---------- Hjelpere ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  ins: {}, cur: null, view: 'home', ready: false, error: null,
  settings: { by: 'Henrik Oseberg', company: 'Oseberg Drift og Service' },
  pickKey: null, ready_file: null, confirmFinish: false, showAllHist: false, showSettings: false, busy: false,
};
try { Object.assign(S.settings, JSON.parse(localStorage.getItem('insp-settings') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('insp-settings', JSON.stringify(S.settings)); } catch (e) {} };

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
function isFlag(it, a) {
  if (!a || a.value == null || a.value === '') return false;
  if (it.type === 'date') return !!it.expiry && a.value < todayISO();
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
  const v = ins.answers[c.item]?.value;
  if (c.includes) return Array.isArray(v) && v.includes(c.includes);
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
    if (x.it.type === 'heading') continue;
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
function dueInfo(t, last) {
  if (!last) return { cls: 'na', text: 'Ikke utført i appen ennå' };
  const next = addMonths(last.date, t.months);
  const d = daysBetween(todayISO(), next);
  if (d < 0) return { cls: 'bad', text: 'Forfalt ' + fmt(next) };
  if (d <= 7) return { cls: 'warn', text: 'Forfaller ' + fmt(next) };
  return { cls: 'ok', text: 'Neste ' + fmt(next) };
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
  S.ins[ins.id] = ins; flush(ins.id);
  openIns(ins.id);
}
function openIns(id) { S.cur = id; S.view = 'ins'; S.confirmFinish = false; render(); window.scrollTo(0, 0); }
function goHome() { flushAll(); S.view = 'home'; S.cur = null; render(); window.scrollTo(0, 0); }

/* ---------- Visning ---------- */
const app = $('#app');
function setStatus(t) { const el = $('#save-status'); if (el) el.textContent = t; }
let toastTimer;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }

function render() {
  const bar = $('#topbar');
  if (S.view === 'ins' && cur()) {
    const t = TPL[cur().templateId];
    bar.innerHTML = `<button class="back" data-act="home" aria-label="Tilbake til oversikten">‹ Oversikt</button><div class="bar-title">${esc(t.name)}</div><div class="bar-status" id="save-status">Lagret</div>`;
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

function renderHome() {
  const all = Object.values(S.ins);
  const drafts = all.filter(i => i.status !== 'complete').sort((a, b) => b.updatedAt - a.updatedAt);
  const done = all.filter(i => i.status === 'complete').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
  let h = installHint();

  if (S.showSettings) {
    h += `<section class="panel settings"><h2 class="h2">Innstillinger</h2>
      <label class="fld"><span>Ditt navn (utført av, ansvarlig)</span><input id="set-by" data-set="by" value="${esc(S.settings.by)}"></label>
      <label class="fld"><span>Firmanavn i rapporter</span><input id="set-co" data-set="company" value="${esc(S.settings.company)}"></label>
      <h3 class="h3">Sikkerhetskopi</h3>
      <p class="muted small">Alt ligger bare på denne telefonen. Ta en kopi jevnlig og legg den i iCloud Drive eller Google Drive.</p>
      <div class="row-btns"><button class="btn" data-act="export">Lag sikkerhetskopi</button><button class="btn" data-act="import">Gjenopprett fra fil</button></div>
    </section>`;
  }

  h += `<section><h2 class="h2">Start inspeksjon</h2><div class="tpl-list">${TEMPLATES.map(t => {
    const last = done.find(i => i.templateId === t.id); const due = dueInfo(t, last);
    return `<button class="tpl" data-act="new" data-tpl="${t.id}">
      <span class="tpl-top"><span class="tpl-name">${esc(t.name)}</span><span class="freq">${t.months === 1 ? 'Månedlig' : t.months === 3 ? 'Kvartalsvis' : 'Hver ' + t.months + '. mnd'}</span></span>
      <span class="tpl-site">${esc(t.site)}</span>
      <span class="tpl-meta"><span class="pill ${due.cls}">${due.text}</span>${last ? `<span class="muted small">Sist ${fmt(last.date)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div></section>`;

  if (drafts.length) {
    h += `<section><h2 class="h2">Pågår</h2><div class="list">${drafts.map(i => {
      const st = stats(i); const t = TPL[i.templateId];
      return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
        <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${esc(i.site)} · ${fmt(i.date)}</span>
        <span class="rc-sub">${st.total - st.unanswered} av ${st.total} besvart${st.flags ? ` · <b class="t-bad">${st.flags} avvik</b>` : ''}</span></button>
        <button class="link danger" data-act="del-ins" data-id="${i.id}">Slett</button></div>`;
    }).join('')}</div></section>`;
  }

  const open = [];
  for (const i of all) for (const [key, a] of Object.entries(i.answers)) for (const act of a.actions || []) if (!act.done) open.push({ i, key, act });
  open.sort((x, y) => (x.act.due || '9').localeCompare(y.act.due || '9'));
  h += `<section><h2 class="h2">Åpne handlinger <span class="count">${open.length}</span></h2>`;
  h += open.length ? `<div class="list">${open.map(({ i, key, act }) => {
    const t = TPL[i.templateId]; const late = act.due && act.due < todayISO();
    return `<div class="act-line"><input type="checkbox" id="hd-${act.id}" data-hdone="${i.id}|${esc(key)}|${act.id}" aria-label="Merk som utført">
      <button class="row-main" data-act="open" data-id="${i.id}" data-focus="${esc(key)}">
      <span class="rc-title">${esc(act.text || '(uten beskrivelse)')}</span>
      <span class="rc-sub">${esc(t.name)} · ${fmt(i.date)}${act.due ? ` · <span class="${late ? 't-bad' : ''}">Frist ${fmt(act.due)}</span>` : ''}</span></button></div>`;
  }).join('')}</div>` : '<p class="empty">Ingen åpne handlinger.</p>';
  h += '</section>';

  const hist = S.showAllHist ? done : done.slice(0, 8);
  h += `<section><h2 class="h2">Fullførte</h2>`;
  h += done.length ? `<div class="list">${hist.map(i => {
    const st = stats(i); const t = TPL[i.templateId];
    return `<div class="row-card"><button class="row-main" data-act="open" data-id="${i.id}">
      <span class="rc-title">${esc(t.name)}</span><span class="rc-sub">${esc(i.site)} · ${fmt(i.date)}</span>
      <span class="rc-sub">${st.flags ? `<b class="t-bad">${st.flags} avvik</b>` : 'Ingen avvik'} · ${st.actions} handlinger</span></button>
      <button class="link" data-act="pdf" data-id="${i.id}">PDF</button></div>`;
  }).join('')}</div>${done.length > 8 && !S.showAllHist ? `<button class="link more" data-act="hist-all">Vis alle ${done.length}</button>` : ''}` : '<p class="empty">Fullførte inspeksjoner havner her.</p>';
  h += '</section>';
  return h;
}

function renderIns() {
  const ins = cur(); const tpl = TPL[ins.templateId]; const st = stats(ins);
  let h = `<section class="panel meta">
    <h1 class="ins-title">${esc(tpl.name)}</h1>
    ${ins.status === 'complete' ? `<p class="done-note">Fullført. Endringer lagres, og du kan lage ny PDF når som helst.</p>` : ''}
    <div class="fields">
      <label class="fld wide"><span>Sted</span><input id="m-site" data-meta="site" value="${esc(ins.site)}"></label>
      <label class="fld"><span>Dato</span><input id="m-date" type="date" data-meta="date" value="${esc(ins.date)}"></label>
      <label class="fld"><span>Utført av</span><input id="m-by" data-meta="by" value="${esc(ins.by)}"></label>
    </div></section>`;
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
    h += `<button class="btn primary big" data-act="${ins.status === 'complete' ? 'pdf' : 'finish'}" data-id="${ins.id}" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Lager PDF…' : ins.status === 'complete' ? 'Lag PDF på nytt' : 'Fullfør og lag PDF'}</button>`;
  }
  h += '</section>';
  return h;
}

function itemHTML(ins, it, key) {
  if (it.type === 'heading') return `<h3 class="sub">${esc(it.label)}</h3>`;
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
    ctl = `<input class="inp date" id="d-${k}" type="date" data-bind="${k}" data-field="value" data-rerender="1" value="${esc(a.value ?? '')}">${flag ? '<span class="t-bad small">Utløpt</span>' : ''}`;
  }
  const note = a.note != null ? `<textarea class="inp note" id="nt-${k}" rows="2" data-bind="${k}" data-field="note" placeholder="Notat">${esc(a.note)}</textarea>` : '';
  const thumbs = photos.length ? `<div class="thumbs">${photos.map((pid, ix) => `<button type="button" class="thumb" data-act="thumb" data-key="${k}" data-ix="${ix}" aria-label="Åpne bilde ${ix + 1}"><img data-pid="${pid}" alt=""></button>`).join('')}</div>` : '';
  const actsH = acts.map(act => actHTML(key, act)).join('');
  return `<div class="item${flag ? ' is-flag' : ''}" id="it-${k}">
    <div class="q">${esc(it.label)}</div>${it.help ? `<div class="help">${esc(it.help)}</div>` : ''}
    ${ctl}${note}${thumbs}${actsH}
    <div class="tools">
      <button type="button" class="tool" data-act="note" data-key="${k}">${a.note != null ? 'Skjul notat' : 'Notat'}</button>
      <button type="button" class="tool" data-act="photo" data-key="${k}">Bilde</button>
      <button type="button" class="tool${want && !acts.length ? ' prompt' : ''}" data-act="act-add" data-key="${k}">+ Handling</button>
    </div></div>`;
}
function actHTML(key, act) {
  const k = esc(key), base = `${k}|${act.id}`;
  return `<div class="act${act.done ? ' done' : ''}">
    <div class="act-h"><span class="act-tag">Handling</span><label class="chk"><input type="checkbox" id="ad-${act.id}" data-actf="${base}|done"${act.done ? ' checked' : ''}> Utført</label></div>
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
    <button class="btn primary big" data-act="share-file">Del eller lagre</button>
    <button class="btn" data-act="close-sheet">Lukk</button></div>`;
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
    case 'settings': S.showSettings = !S.showSettings; render(); break;
    case 'new': newInspection(b.dataset.tpl); break;
    case 'open': openIns(b.dataset.id); if (b.dataset.focus) { const el = document.getElementById('it-' + b.dataset.focus); if (el) el.scrollIntoView({ block: 'center' }); } break;
    case 'hist-all': S.showAllHist = true; render(); break;
    case 'del-ins':
      if (!b.dataset.armed) { arm(b, 'Bekreft sletting'); break; }
      { const victim = S.ins[b.dataset.id]; delete S.ins[b.dataset.id]; await DB.del('inspections', b.dataset.id);
        for (const a of Object.values(victim.answers)) for (const p of a.photos || []) DB.del('photos', p);
        render(); toast('Inspeksjonen er slettet'); }
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
      const st = stats(ins);
      if (st.unanswered && !S.confirmFinish) { S.confirmFinish = true; render(); break; }
      await finish(ins); break;
    }
    case 'finish-force': await finish(ins); break;
    case 'finish-cancel': S.confirmFinish = false; render(); break;
    case 'pdf': await makePdf(S.ins[b.dataset.id]); break;
    case 'share-file': shareFile(); break;
    case 'close-sheet': S.ready_file = null; renderSheet(); break;
    case 'export': await exportBackup(); break;
    case 'import': $('#importpick').click(); break;
  }
});
function arm(b, label) {
  const old = b.textContent; b.dataset.armed = '1'; b.textContent = label; b.classList.add('armed');
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old; b.classList.remove('armed'); } }, 3500);
}

document.addEventListener('input', e => {
  const el = e.target; const ins = cur();
  if (el.dataset.set) { S.settings[el.dataset.set] = el.value; saveSettings(); return; }
  if (!ins) return;
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
  if (el.dataset.hdone) {
    const [iid, key, id] = el.dataset.hdone.split('|'); const i = S.ins[iid];
    const act = (i?.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; touch(i); toast('Handlingen er merket som utført'); setTimeout(render, 350); }
    return;
  }
  if (!ins) return;
  if (el.dataset.actf && el.type === 'checkbox') {
    const [key, id] = el.dataset.actf.split('|');
    const act = (ins.answers[key]?.actions || []).find(x => x.id === id);
    if (act) { act.done = el.checked; touch(ins); render(); }
  } else if (el.dataset.rerender) render();
});

/* ---------- Bilder ---------- */
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Kunne ikke lese bildet')); i.src = src; }); }
async function toJpeg(src, max = 1600) {
  const img = await loadImage(src);
  let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
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
async function finish(ins) {
  ins.status = 'complete'; ins.completedAt = Date.now(); S.confirmFinish = false;
  touch(ins); await flush(ins.id);
  await makePdf(ins);
}
async function makePdf(ins) {
  if (!ins || S.busy) return;
  S.busy = true; if (S.view === 'ins') render(); else toast('Lager PDF…');
  try {
    await flushAll();
    const blob = await buildReport(ins);
    const t = TPL[ins.templateId];
    const name = `${t.name} ${ins.site.split(/[–,-]/)[0].trim()} ${fmt(ins.date).replace(/\./g, '-')}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    S.ready_file = { file: new File([blob], name, { type: 'application/pdf' }), title: 'PDF-rapporten er klar' };
  } catch (e) { toast('Kunne ikke lage PDF: ' + (e && e.message || e), 5000); console.error(e); }
  S.busy = false; render();
}

const C = { ink: [20, 33, 42], muted: [86, 104, 116], line: [214, 222, 227], band: [233, 238, 241], ok: [26, 122, 76], bad: [192, 23, 47], na: [94, 108, 118], sel: [15, 90, 125], actBg: [255, 245, 209], actLine: [226, 191, 61], actInk: [92, 71, 8], white: [255, 255, 255], accent: [15, 90, 125] };

async function buildReport(ins) {
  const tpl = TPL[ins.templateId]; const d = new PDFDoc();
  const W = 210, M = 16, CW = W - 2 * M, TOP = 18, BOT = 297 - 18, LH = 4.6;
  let y = TOP;
  const items = [...walk(tpl, ins)];
  const st = stats(ins);

  const pnum = {}, pinfo = {}; let pc = 0;
  for (const x of items) for (const pid of ins.answers[x.key]?.photos || []) {
    if (pid in pnum) continue;
    const rec = await DB.get('photos', pid).catch(() => null);
    if (!rec) continue;
    pnum[pid] = ++pc;
    pinfo[pid] = { data: new Uint8Array(await rec.blob.arrayBuffer()), w: rec.w, h: rec.h, label: x.it.label };
  }
  const need = h => { if (y + h > BOT) { d.addPage(); y = TOP; } };

  // Tittel
  d.text(S.settings.company, W - M, 11, { size: 8.5, bold: true, color: C.accent, align: 'right' });
  d.wrap(tpl.name, 20, true, CW).forEach(l => { y += 8; d.text(l, M, y, { size: 20, bold: true, color: C.ink }); });
  y += 7;
  d.text(`${fmt(ins.date)} / ${ins.by}`, M, y, { size: 11, color: C.muted });
  d.text(ins.status === 'complete' ? 'Fullført' : 'Utkast', W - M, y, { size: 9.5, bold: true, color: ins.status === 'complete' ? C.ok : C.na, align: 'right' });
  y += 5;
  const half = CW / 2 - 1;
  d.rect(M, y, half, 10, C.band); d.rect(M + half + 2, y, half, 10, C.band);
  d.text('Avvik', M + 3, y + 6.5, { size: 10, bold: true, color: C.ink }); d.text(String(st.flags), M + half - 3, y + 6.5, { size: 10, color: st.flags ? C.bad : C.ink, bold: !!st.flags, align: 'right' });
  d.text('Handlinger', M + half + 5, y + 6.5, { size: 10, bold: true, color: C.ink }); d.text(String(st.actions), W - M - 3, y + 6.5, { size: 10, color: C.ink, align: 'right' });
  y += 11;
  for (const [k, v] of [['Sted', ins.site], ['Utført dato', fmt(ins.date)], ['Utført av', ins.by]]) {
    d.text(k, M + 3, y + 6, { size: 10, bold: true, color: C.ink }); d.text(v || '', W - M - 3, y + 6, { size: 10, color: C.ink, align: 'right' });
    y += 9; d.line(M, y, W - M, y, C.line);
  }
  y += 4;

  function secHeader(title, right) {
    need(18); y += 3;
    d.rect(M, y, CW, 9, C.band);
    d.text(title, M + 3, y + 6, { size: 11, bold: true, color: C.ink });
    if (right) d.text(right, W - M - 3, y + 6, { size: 8.5, color: C.muted, align: 'right' });
    y += 10;
  }
  function actBlock(act) {
    const head = ['Handling', 'Ansvarlig: ' + (act.who || '-'), 'Prioritet: ' + (act.prio || '-'), 'Frist: ' + (act.due ? fmt(act.due) : '-')].concat(act.done ? ['Utført'] : []).join('   |   ');
    const hl = d.wrap(head, 8.5, false, CW - 8), tl = d.wrap(act.text || '(uten beskrivelse)', 10, false, CW - 8);
    const h = hl.length * 4 + tl.length * LH + 5;
    need(h + 1.5);
    d.rect(M, y, CW, h, C.actBg); d.rect(M, y, 1.2, h, C.actLine);
    let yy = y + 4.3;
    hl.forEach(l => { d.text(l, M + 4, yy, { size: 8.5, color: C.actInk }); yy += 4; });
    tl.forEach(l => { d.text(l, M + 4, yy + 0.8, { size: 10, color: C.ink }); yy += LH; });
    y += h + 1.5;
  }
  function itemBlock(x) {
    const { it, key } = x; const a = ins.answers[key] || {};
    if (it.type === 'heading') { need(12); y += 1.5; d.text(it.label, M + 2, y + 5, { size: 10, color: C.muted }); y += 7.5; d.line(M, y, W - M, y, C.line); return; }
    const v = a.value; let ans = null, tone = null;
    if (CHOICE_TYPES.includes(it.type) && v) { ans = v; tone = toneFor(it, v); }
    else if (it.type === 'multi' && Array.isArray(v) && v.length) { ans = v.join(', '); tone = 'sel'; }
    else if (it.type === 'number' && v != null && v !== '') ans = String(v).replace('.', ',') + (it.unit ? ' ' + it.unit : '');
    else if (it.type === 'date' && v) { ans = fmt(v); if (isFlag(it, a)) tone = 'bad'; }
    else if (it.type === 'text' && v) ans = v;
    const pillW = 52, pill = !!tone;
    const lines = d.wrap(it.label, 10, true, CW - pillW - 8);
    const al = ans != null ? d.wrap(ans, 10, false, pillW - 6) : [];
    const rowH = Math.max(lines.length, al.length, 1) * LH + 5;
    need(rowH + 1);
    lines.forEach((l, i) => d.text(l, M + 2, y + 5.2 + i * LH, { size: 10, bold: true, color: C.ink }));
    if (pill) d.rect(W - M - pillW, y + 0.6, pillW, rowH - 1.2, C[tone]);
    al.forEach((l, i) => d.text(l, W - M - 3, y + 5.2 + i * LH, { size: 10, color: pill ? C.white : C.ink, align: 'right' }));
    y += rowH;
    if (a.note) {
      for (const l of d.wrap(a.note, 9, false, CW - 4)) { need(4.4); d.text(l, M + 2, y + 3.4, { size: 9, color: C.muted }); y += 4.2; }
      y += 1.5;
    }
    const ps = (a.photos || []).filter(p => pinfo[p]);
    if (ps.length) {
      const th = 24; let x0 = M + 2; need(th + 7);
      for (const p of ps) {
        const pi = pinfo[p]; const tw = Math.min(th * pi.w / pi.h, CW - 4);
        if (x0 + tw > W - M) { x0 = M + 2; y += th + 7; need(th + 7); }
        d.image(pi.data, pi.w, pi.h, x0, y + 1, tw, th);
        d.text('Bilde ' + pnum[p], x0, y + th + 4.6, { size: 7.5, color: C.muted });
        x0 += tw + 5;
      }
      y += th + 7.5;
    }
    for (const act of a.actions || []) actBlock(act);
    d.line(M, y, W - M, y, C.line);
  }

  // Sammendrag
  const hits = items.filter(x => x.it.type !== 'heading' && (isFlag(x.it, ins.answers[x.key]) || (ins.answers[x.key]?.actions || []).length));
  secHeader('Avvik og handlinger', `${st.flags} avvik, ${st.actions} handlinger`);
  if (!hits.length) { need(9); d.text('Ingen avvik eller handlinger registrert.', M + 2, y + 5.5, { size: 10, color: C.muted }); y += 9; }
  for (const x of hits) {
    need(14);
    const ctx = x.sec.title + (x.sec.repeat ? ` – ${x.sec.unit} ${x.i + 1}` : '');
    d.text(ctx, M + 2, y + 4, { size: 8, color: C.muted }); y += 4.5;
    itemBlock(x);
  }

  // Alle seksjoner
  let last = null;
  for (const x of items) {
    const id = x.sec.id + '#' + x.i;
    if (id !== last) { last = id; secHeader(x.sec.title + (x.sec.repeat ? ` – ${x.sec.unit} ${x.i + 1}` : '')); }
    itemBlock(x);
  }

  // Bildeoversikt
  if (pc) {
    secHeader('Bildeoversikt', `${pc} ${pc === 1 ? 'bilde' : 'bilder'}`);
    const colW = (CW - 8) / 2, maxH = 95; const list = Object.keys(pnum).sort((a, b) => pnum[a] - pnum[b]);
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2).map(p => {
        const pi = pinfo[p]; let w = colW, h = w * pi.h / pi.w; if (h > maxH) { h = maxH; w = h * pi.w / pi.h; }
        return { p, pi, w, h, cap: d.wrap(`Bilde ${pnum[p]} – ${pi.label}`, 8.5, false, colW) };
      });
      const rowH = Math.max(...pair.map(o => o.h + 3 + o.cap.length * 3.8)) + 5;
      need(rowH);
      pair.forEach((o, j) => {
        const x0 = M + j * (colW + 8);
        d.image(o.pi.data, o.pi.w, o.pi.h, x0, y + 2, o.w, o.h);
        o.cap.forEach((l, k) => d.text(l, x0, y + o.h + 6 + k * 3.8, { size: 8.5, color: C.muted }));
      });
      y += rowH;
    }
  }

  // Bunntekst
  const n = d.pages.length;
  for (let i = 0; i < n; i++) {
    d.usePage(i);
    d.line(M, 297 - 13, W - M, 297 - 13, C.line);
    d.text(`${tpl.name} · ${ins.site} · ${fmt(ins.date)}`, M, 297 - 8.5, { size: 8, color: C.muted });
    d.text(`Side ${i + 1} av ${n}`, W - M, 297 - 8.5, { size: 8, color: C.muted, align: 'right' });
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
  const data = { app: 'oseberg-inspeksjon', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, inspections: await DB.all('inspections'), photos };
  const file = new File([JSON.stringify(data)], `inspeksjoner-sikkerhetskopi-${todayISO()}.json`, { type: 'application/json' });
  S.ready_file = { file, title: 'Sikkerhetskopien er klar' };
  $('#toast').hidden = true; renderSheet();
}
$('#importpick').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'oseberg-inspeksjon') throw new Error('Filen er ikke en sikkerhetskopi fra denne appen.');
    let added = 0;
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
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
