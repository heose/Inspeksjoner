'use strict';
/* Timeliste: hurtiglogging av oppdrag og timer til fakturagrunnlag.
   Lagres i IndexedDB (store «hours») på enheten. Faktiske start- og stopptider lagres rått.
   Avrunding til nærmeste halvtime skjer først i visning og summering, per oppdrag og dag,
   slik at regelen kan endres uten å miste rådata.
   Lastes før app.js: bare funksjoner her, ingenting kjøres før appen har laget S, DB og SITES. */

const H_STEP = 30;                                              // minutter per enhet
const hUnits = min => min > 0 ? Math.max(1, Math.round(min / H_STEP)) : 0;   // aldri 0 for arbeid som er utført
const hTxt = u => String(u / 2).replace('.', ',');              // enheter (halvtimer) til «3,5»
const hClock = min => Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
const hList = () => Object.values(S.hours || {});
const hRunning = () => hList().find(e => !e.end) || null;
const hMin = e => Math.max(0, Math.round(((e.end || Date.now()) - e.start) / 60000));
const hDay = ms => iso(new Date(ms));
const hHHMM = ms => new Date(ms).toTimeString().slice(0, 5);
const hParse = (d, t) => new Date(`${d}T${t}:00`).getTime();
const hSiteOf = id => SITES.find(s => s.id === id);
const hKindLabel = k => k === 'tillegg' ? 'Tillegg' : 'Fast avtale';
const hSave = e => { e.updatedAt = Date.now(); return DB.put('hours', clone(e)).catch(err => toast('Kunne ikke lagre timer: ' + (err && err.message || err), 5000)); };
const hTrunc = (s, n = 60) => { s = String(s || '').split('\n')[0]; return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- Mottakere (fakturamottakere) per bygg ---------- */
function hRecips(siteId) {
  const site = hSiteOf(siteId), base = Array.isArray(site && site.recipients) ? site.recipients : [];
  return [...new Set([...base, ...((S.settings.recip || {})[siteId] || [])])];
}

/* ---------- Posisjon: foreslår bygg, lagres aldri per føring ---------- */
function hGeoOf(site) {
  const g = (S.settings.geo || {})[site.id] || site.geo || null;
  return !g ? null : Array.isArray(g) ? { lat: g[0], lon: g[1] } : g;
}
function hDist(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon);
  const q = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}
function hGetPos(fresh) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null),
      { enableHighAccuracy: !!fresh, timeout: fresh ? 12000 : 5000, maximumAge: fresh ? 0 : 600000 });
  });
}
async function hNearest() {
  const p = await hGetPos(false); if (!p) return null;
  let best = null;
  for (const s of SITES) { const g = hGeoOf(s); if (!g) continue; const d = hDist(p, g); if (d <= 400 && (!best || d < best.d)) best = { s, d }; }
  return best && best.s;
}
async function hCalibrate() {
  const run = hRunning(), id = (run && run.siteId) || S.hPick || S.settings.hLastSite || (SITES[0] && SITES[0].id);
  if (!id) return;
  toast('Henter posisjon…', 12000);
  const p = await hGetPos(true);
  if (!p) { toast('Fikk ikke posisjon. Sjekk at Safari og Argus får bruke posisjon.', 5000); return; }
  (S.settings.geo ||= {})[id] = { lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) }; saveSettings();
  toast(`Posisjon lagret for ${hSiteOf(id).short}. Bygget foreslås nå ved start.`, 4500); render();
}

/* ---------- Start, stopp ---------- */
async function hStart() {
  if (hRunning()) return;
  const siteId = S.hPick || S.settings.hLastSite || SITES[0].id, chosen = !!S.hManual;
  const e = { id: uid(), user: S.settings.by, siteId, text: '', start: Date.now(), end: null, men: S.settings.hMen || 1, kind: S.settings.hKind || 'fast', link: null, split: {}, other: '', createdAt: Date.now() };
  S.hours[e.id] = e; S.hPick = null; S.hManual = false;
  S.settings.hLastSite = siteId; saveSettings();
  await hSave(e); render(); toast('Timer startet');
  if (!chosen) {    // ingen valgt bygg for hånd: foreslå etter posisjon, men aldri overstyr et valg du gjør selv
    const s = await hNearest();
    if (s && !e.end && !e.siteTouched && s.id !== e.siteId) { e.siteId = s.id; S.settings.hLastSite = s.id; saveSettings(); await hSave(e); render(); toast(`Startet på ${s.short}, valgt etter posisjon`); }
  }
}
function hStop() {
  const e = hRunning(); if (!e) return;
  e.end = Date.now(); hSave(e); hOpenSheet(e, false); render();
}

/* ---------- Skjema (ark) for stopp, redigering og manuell føring ---------- */
function hOpenSheet(e, manual) {
  S.hSheet = { id: e.id, manual: !!manual, newr: '', d: { date: hDay(e.start), from: hHHMM(e.start), to: hHHMM(e.end), siteId: e.siteId, text: e.text || '', men: e.men || 1, kind: e.kind || 'fast', link: e.link || null, split: { ...(e.split || {}) }, other: e.other || '' } };
  hRenderSheet();
}
function hNewManual() {
  const now = Date.now();
  hOpenSheet({ id: uid(), siteId: S.settings.hLastSite || SITES[0].id, text: '', start: now - 3600e3, end: now, men: S.settings.hMen || 1, kind: S.settings.hKind || 'fast', link: null, split: {}, other: '' }, true);
}
const hSheetMin = d => { const s = hParse(d.date, d.from), t = hParse(d.date, d.to); return t > s ? Math.round((t - s) / 60000) : 0; };
function hRenderSheet() {
  const el = $('#sheet'); if (!el) return;
  if (!S.hSheet) { el.dataset.hs = ''; el.hidden = !S.ready_file; if (!S.ready_file) el.innerHTML = ''; else renderSheet(); return; }
  el.dataset.hs = '1'; el.hidden = false; el.innerHTML = hSheetHTML();
}
function hSheetHTML() {
  const sh = S.hSheet, d = sh.d, min = hSheetMin(d), u = hUnits(min);
  let left = u; for (const n of Object.keys(d.split)) { d.split[n] = Math.max(0, Math.min(d.split[n], left)); left -= d.split[n]; }
  const names = [...hRecips(d.siteId), 'Annet'];
  const acts = openAll().filter(x => x.siteId === d.siteId);
  if (d.link && !acts.some(x => x.id === d.link.id)) acts.unshift({ id: d.link.id, text: d.link.text });
  const seg = (arr, on, act, key) => arr.map(([id, label]) => `<button type="button" ${on(id) ? 'data-tone="sel"' : ''} aria-pressed="${on(id)}" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`).join('');
  const rows = names.map(n => {
    const v = d.split[n] || 0;
    return `<div class="hs-row"><span class="hs-n">${esc(n)}</span><input type="range" min="0" max="${u}" step="1" value="${v}" data-hsplit="${esc(n)}" aria-label="Timer til ${esc(n)}"${u ? '' : ' disabled'}><b>${hTxt(v)} t</b></div>`
      + (n === 'Annet' ? `<input class="inp" id="hs-other" data-hs="other" placeholder="Hva gjelder «Annet»? (påkrevd)" value="${esc(d.other)}" autocomplete="off"${v ? '' : ' hidden'}>` : '');
  }).join('');
  const own = (S.settings.recip || {})[d.siteId] || [];
  return `<div class="sheet-card hs" data-hours role="dialog" aria-label="Timer">
    <p class="sheet-title">${sh.manual ? 'Legg til timer' : 'Timer'}</p>
    <div class="hs-total"><b>${hTxt(u)} t</b><span class="muted small">${min ? hClock(min) + ' faktisk' : 'Sluttid må være etter starttid'}${d.men > 1 && min ? ' · ' + hTxt(hUnits(min * d.men)) + ' mann-timer' : ''}</span></div>
    <div class="hs-times"><label class="fld"><span>Dato</span><input type="date" data-hs="date" value="${esc(d.date)}"></label>
      <label class="fld"><span>Fra</span><input type="time" data-hs="from" value="${esc(d.from)}"></label>
      <label class="fld"><span>Til</span><input type="time" data-hs="to" value="${esc(d.to)}"></label></div>
    <div class="seg" role="group" aria-label="Bygg">${seg(SITES.map(s => [s.id, s.short]), id => id === d.siteId, 'hs-site')}</div>
    <label class="fld"><span>Oppdrag</span><input class="inp" data-hs="text" placeholder="F.eks. bytte lyspærer trapp 2" value="${esc(d.text)}" autocomplete="off"></label>
    <div class="hs-line"><span class="hs-n">Antall mann</span><div class="numrow"><button type="button" class="btn" data-act="hs-men" data-d="-1" aria-label="Færre">−</button><b class="hs-men">${d.men}</b><button type="button" class="btn" data-act="hs-men" data-d="1" aria-label="Flere">+</button></div></div>
    <div class="seg" role="group" aria-label="Type">${seg([['fast', 'Fast avtale'], ['tillegg', 'Tillegg']], id => id === d.kind, 'hs-kind')}</div>
    <label class="fld"><span>Knytt til handling (valgfritt)</span><select class="inp" data-hs="link"><option value="">Ingen</option>${acts.map(x => `<option value="${esc(x.id)}"${d.link && d.link.id === x.id ? ' selected' : ''}>${esc(hTrunc(x.text) || '(uten beskrivelse)')}</option>`).join('')}</select></label>
    <h3 class="h3">Fordeling på mottakere</h3>
    <p class="muted small">Del økten på hvem som skal faktureres. Det som ikke er fordelt blir stående som «Ikke fordelt».</p>
    ${rows}
    <div class="hs-rest">Ikke fordelt <b id="hs-rest">${hTxt(left)} t</b></div>
    <div class="hs-add"><input class="inp" data-hs="newr" placeholder="Ny mottaker, f.eks. Legesenter" value="${esc(sh.newr)}" autocomplete="off"><button type="button" class="btn" data-act="hs-addr">Legg til</button></div>
    ${own.length ? `<details class="how"><summary>Rediger mottakere for ${esc(hSiteOf(d.siteId).short)}</summary><div class="hs-edit">${own.map(n => `<div class="hs-row"><span class="hs-n">${esc(n)}</span><button type="button" class="link danger" data-act="hs-delr" data-name="${esc(n)}">Fjern</button></div>`).join('')}</div></details>` : ''}
    <button type="button" class="btn primary big" data-act="hs-save">Lagre</button>
    <div class="row-btns"><button type="button" class="btn" data-act="hs-close">Lukk</button>${sh.manual ? '' : '<button type="button" class="btn" data-act="hs-del">Slett føringen</button>'}</div>
  </div>`;
}
async function hSaveSheet() {
  const sh = S.hSheet, d = sh.d, start = hParse(d.date, d.from), end = hParse(d.date, d.to);
  if (!(end > start)) { toast('Sluttid må være etter starttid.', 4000); return; }
  const u = hUnits(Math.round((end - start) / 60000));
  if ((d.split.Annet || 0) > 0 && !(d.other || '').trim()) { toast('Skriv en kommentar for «Annet».', 4000); return; }
  const split = {}; let left = u;
  for (const [n, v] of Object.entries(d.split)) { const x = Math.max(0, Math.min(v, left)); if (x) { split[n] = x; left -= x; } }
  const e = S.hours[sh.id] || { id: sh.id, user: S.settings.by, createdAt: Date.now() };
  const relink = !(e.link && d.link && e.link.id === d.link.id);
  Object.assign(e, { siteId: d.siteId, text: d.text.trim(), start, end, men: d.men, kind: d.kind, link: d.link, split, other: split.Annet ? d.other.trim() : '' });
  if (relink) delete e.cmtAt;
  S.hours[e.id] = e;
  Object.assign(S.settings, { hLastSite: d.siteId, hMen: d.men, hKind: d.kind }); saveSettings();
  await hSave(e);
  S.hSheet = null; hRenderSheet(); render();
  toast(`Lagret ${hTxt(u)} t`);
  hoursFlushComments();
}

/* ---------- Summering: minutter per oppdrag og dag, så avrundet til halvtime ---------- */
function hAlloc(g) {
  const raw = {}; let alloc = 0;
  for (const e of g.entries) {
    const m = hMin(e), u = hUnits(m), mm = m * (e.men || 1);
    for (const [n, v] of Object.entries(e.split || {})) { if (!v || !u) continue; const x = Math.min(1, v / u) * mm; raw[n] = (raw[n] || 0) + x; alloc += x; }
  }
  raw['Ikke fordelt'] = Math.max(0, g.pm - alloc);
  const names = Object.keys(raw), tot = names.reduce((a, n) => a + raw[n], 0) || 1;
  const ex = names.map(n => { const x = raw[n] / tot * g.units; return { n, f: Math.floor(x), r: x - Math.floor(x) }; });
  let rest = g.units - ex.reduce((a, x) => a + x.f, 0);
  for (const x of [...ex].sort((a, b) => b.r - a.r)) { if (rest <= 0) break; x.f++; rest--; }   // størst rest først, summen stemmer alltid
  const out = {}; for (const x of ex) if (x.f) out[x.n] = x.f;
  return out;
}
function hGroups(ym) {
  const m = new Map();
  for (const e of hList()) {
    if (!e.end) continue; const day = hDay(e.start); if (!day.startsWith(ym)) continue;
    const key = [day, e.siteId, nrm(e.text), e.kind || 'fast'].join('|');
    const g = m.get(key) || { day, siteId: e.siteId, text: (e.text || '').trim(), kind: e.kind === 'tillegg' ? 'tillegg' : 'fast', entries: [], pm: 0, others: [], men: 1 };
    g.entries.push(e); g.pm += hMin(e) * (e.men || 1); g.men = Math.max(g.men, e.men || 1);
    if ((e.other || '').trim()) g.others.push(e.other.trim());
    m.set(key, g);
  }
  const out = [...m.values()];
  for (const g of out) { g.units = hUnits(g.pm); g.cat = hAlloc(g); }
  return out.sort((a, b) => b.day.localeCompare(a.day) || a.siteId.localeCompare(b.siteId) || a.text.localeCompare(b.text, 'nb'));
}
function hTotals(groups) {
  const t = {};
  for (const g of groups) for (const [cat, u] of Object.entries(g.cat)) { const r = (t[g.siteId + '|' + cat] ||= { siteId: g.siteId, cat, fast: 0, tillegg: 0 }); r[g.kind] += u; }
  const so = id => SITES.findIndex(s => s.id === id);
  return Object.values(t).sort((a, b) => so(a.siteId) - so(b.siteId) || (a.cat === 'Ikke fordelt') - (b.cat === 'Ikke fordelt') || a.cat.localeCompare(b.cat, 'nb'));
}

/* ---------- Visning ---------- */
function hHomeHTML() {
  if (!SITES.length || !S.settings.timer) return '';
  const run = hRunning(), today = todayISO(), ym = today.slice(0, 7), gs = hGroups(ym);
  const tu = gs.filter(g => g.day === today).reduce((a, g) => a + g.units, 0), mu = gs.reduce((a, g) => a + g.units, 0);
  const pick = run ? run.siteId : (S.hPick || S.settings.hLastSite || SITES[0].id), site = hSiteOf(pick) || SITES[0];
  const segs = SITES.map(s => `<button type="button" ${s.id === pick ? 'data-tone="sel"' : ''} aria-pressed="${s.id === pick}" data-act="h-site" data-id="${s.id}">${esc(s.short)}</button>`).join('');
  let h = `<section class="panel hrs" data-hours><div class="hrs-top"><h2 class="h2">Timer</h2><span class="muted small">I dag ${hTxt(tu)} t · denne måneden ${hTxt(mu)} t</span></div>`;
  if (run) {
    h += `<div class="hrs-run"><span class="hrs-dot" aria-hidden="true"></span><b id="h-el" class="hrs-el">${hClock(hMin(run))}</b><span class="muted small">siden ${hHHMM(run.start)}</span></div>
      <input class="inp" data-hrun="text" placeholder="Hva gjør du? (kan fylles ut ved stopp)" value="${esc(run.text)}" autocomplete="off">
      <div class="seg" role="group" aria-label="Bygg">${segs}</div>
      <button type="button" class="btn primary big hrs-go stop" data-act="h-stop">Stopp</button>
      <button type="button" class="link danger" data-act="h-cancel">Forkast timeren</button>`;
  } else {
    h += `<div class="seg" role="group" aria-label="Bygg">${segs}</div><button type="button" class="btn primary big hrs-go" data-act="h-start">Start</button>`;
  }
  return h + `<div class="hrs-foot"><button type="button" class="link" data-act="h-open">Månedsoversikt ›</button><button type="button" class="link" data-act="h-geo">${hGeoOf(site) ? 'Oppdater' : 'Lagre'} posisjon for ${esc(site.short)}</button></div></section>`;
}
function hMonthHTML() {
  const ym = S.hMonth || todayISO().slice(0, 7), [y, mo] = ym.split('-').map(Number), gs = hGroups(ym), tot = hTotals(gs);
  const sum = gs.reduce((a, g) => a + g.units, 0);
  const ents = hList().filter(e => e.end && hDay(e.start).startsWith(ym)).sort((a, b) => b.start - a.start);
  let h = `<section><div class="hm-nav"><button type="button" class="btn" data-act="h-month" data-d="-1" aria-label="Forrige måned">‹</button><b>${MONTHS[mo - 1]} ${y}</b><button type="button" class="btn" data-act="h-month" data-d="1" aria-label="Neste måned">›</button></div>
    <div class="panel"><div class="hs-total"><b>${hTxt(sum)} t</b><span class="muted small">mann-timer, avrundet per oppdrag og dag</span></div>`;
  for (const s of SITES) {
    const rows = tot.filter(r => r.siteId === s.id); if (!rows.length) continue;
    h += `<h3 class="h3">${esc(s.name)} · ${hTxt(rows.reduce((a, r) => a + r.fast + r.tillegg, 0))} t</h3>`
      + rows.map(r => `<div class="hm-row"><span>${esc(r.cat)}</span><span class="muted small">${r.fast ? 'Fast ' + hTxt(r.fast) + ' t' : ''}${r.fast && r.tillegg ? ' · ' : ''}${r.tillegg ? 'Tillegg ' + hTxt(r.tillegg) + ' t' : ''}</span></div>`).join('');
  }
  if (!gs.length) h += '<p class="empty">Ingen timer ført denne måneden.</p>';
  h += `</div><div class="row-btns"><button type="button" class="btn primary" data-act="h-xlsx"${gs.length ? '' : ' disabled'}>Last ned Excel</button><button type="button" class="btn" data-act="h-new">Legg til manuelt</button></div></section>`;
  if (gs.length) {
    h += `<section><h2 class="h2">Oppdrag per dag <span class="count">${gs.length}</span></h2><div class="list">${gs.map(g => {
      const cats = Object.entries(g.cat).filter(([n]) => n !== 'Ikke fordelt' || Object.keys(g.cat).length > 1).map(([n, u]) => `${esc(n)} ${hTxt(u)} t`).join(' · ');
      return `<div class="mrow"><span class="rc-title">${esc(g.text || '(uten beskrivelse)')}</span><span class="rc-sub">${fmt(g.day)} · ${esc(hSiteOf(g.siteId)?.short || '')} · <b>${hTxt(g.units)} t</b> · ${hKindLabel(g.kind)}${g.men > 1 ? ' · ' + g.men + ' mann' : ''}</span>${cats ? `<span class="rc-sub">${cats}</span>` : ''}${g.others.length ? `<span class="rc-sub">Annet: ${esc(g.others.join('; '))}</span>` : ''}</div>`;
    }).join('')}</div></section>
    <section><h2 class="h2">Føringer <span class="count">${ents.length}</span></h2><div class="list">${ents.map(e => `<div class="row-card"><button type="button" class="row-main" data-act="h-edit" data-id="${e.id}">
      <span class="rc-title">${esc(e.text || '(uten beskrivelse)')}</span><span class="rc-sub">${fmt(hDay(e.start))} · ${hHHMM(e.start)}–${hHHMM(e.end)} · ${hClock(hMin(e))} · ${esc(hSiteOf(e.siteId)?.short || '')}${(e.men || 1) > 1 ? ' · ' + e.men + ' mann' : ''}${e.link ? ' · koblet til handling' : ''}</span></button></div>`).join('')}</div></section>`;
  }
  return h;
}

/* ---------- Excel ---------- */
function hExcel(ym) {
  const gs = hGroups(ym), tot = hTotals(gs), X = XLSX, hdr = t => ({ v: t, s: 1 });
  const [y, mo] = ym.split('-').map(Number), siteName = id => hSiteOf(id)?.name || id;
  const sum = [[hdr('Bygg'), hdr('Mottaker'), hdr('Fast avtale (t)'), hdr('Tillegg (t)'), hdr('Sum (t)')]];
  tot.forEach((r, i) => sum.push([siteName(r.siteId), r.cat, { v: r.fast / 2, s: 4 }, { v: r.tillegg / 2, s: 4 }, { f: `C${i + 2}+D${i + 2}`, v: (r.fast + r.tillegg) / 2, s: 4 }]));
  const n = tot.length + 1, S1 = tot.reduce((a, r) => a + r.fast, 0) / 2, S2 = tot.reduce((a, r) => a + r.tillegg, 0) / 2;
  if (tot.length) sum.push([{ v: 'Sum', s: 5 }, null, { f: `SUM(C2:C${n})`, v: S1, s: 7 }, { f: `SUM(D2:D${n})`, v: S2, s: 7 }, { f: `SUM(E2:E${n})`, v: S1 + S2, s: 7 }]);
  const det = [[hdr('Dato'), hdr('Bygg'), hdr('Oppdrag'), hdr('Mottaker'), hdr('Type'), hdr('Timer'), hdr('Merknad')]];
  for (const g of [...gs].reverse()) for (const [cat, u] of Object.entries(g.cat)) det.push([{ v: X.serial(g.day), s: 2 }, siteName(g.siteId), g.text || '(uten beskrivelse)', cat, hKindLabel(g.kind), { v: u / 2, s: 4 }, cat === 'Annet' ? g.others.join('; ') : '']);
  const raw = [[hdr('Dato'), hdr('Fra'), hdr('Til'), hdr('Minutter'), hdr('Mann'), hdr('Bygg'), hdr('Oppdrag'), hdr('Type'), hdr('Bruker'), hdr('Koblet handling')]];
  for (const e of hList().filter(e => e.end && hDay(e.start).startsWith(ym)).sort((a, b) => a.start - b.start))
    raw.push([{ v: X.serial(hDay(e.start)), s: 2 }, hHHMM(e.start), hHHMM(e.end), { v: hMin(e), s: 3 }, { v: e.men || 1, s: 3 }, siteName(e.siteId), e.text || '', hKindLabel(e.kind), e.user || '', e.link ? e.link.text || '' : '']);
  const blob = XLSX.build({ sheets: [
    { name: 'Oppsummering', rows: sum, cols: [26, 26, 16, 14, 12], freeze: { c: 0, r: 1 } },
    { name: 'Fakturagrunnlag', rows: det, cols: [12, 24, 40, 24, 14, 10, 30], freeze: { c: 0, r: 1 } },
    { name: 'Rått tidsspor', rows: raw, cols: [12, 8, 8, 10, 8, 24, 40, 14, 18, 34], freeze: { c: 0, r: 1 } },
  ] });
  const name = `Timer ${MONTHS[mo - 1]} ${y}.xlsx`;
  S.ready_file = { file: new File([blob], name, { type: blob.type }), title: 'Excel-filen er klar' };
  render();
}

/* ---------- Trello: kommentar med timer når en koblet handling er lukket ---------- */
function hActState(aid) {
  for (const i of Object.values(S.ins)) for (const a of Object.values(i.answers || {})) for (const act of a.actions || []) if (act.id === aid) return { done: !!act.done, card: act.trello && act.trello.id };
  const r = (S.hubActs || {})[aid];
  return r ? { done: !!r.done, card: r.tr && r.tr.id } : null;
}
async function hoursFlushComments() {
  if (S.hFlushing || !trelloCfg() || !navigator.onLine) return;
  const by = {};
  for (const e of hList()) if (e.end && e.link && e.link.id && !e.cmtAt) (by[e.link.id] ||= []).push(e);
  S.hFlushing = true;
  try {
    for (const [aid, es] of Object.entries(by)) {
      const st = hActState(aid); if (!st || !st.done || !st.card) continue;
      const pm = es.reduce((a, e) => a + hMin(e) * (e.men || 1), 0), men = Math.max(...es.map(e => e.men || 1));
      await tfetch('POST', `cards/${st.card}/actions/comments`, { text: `Timer ført i Argus: ${hTxt(hUnits(pm))} timer, ${men} mann` });
      for (const e of es) { e.cmtAt = Date.now(); await hSave(e); }
    }
  } catch (err) { console.warn('Timer-kommentar til Trello', err); }
  S.hFlushing = false;
}

/* ---------- Hendelser (kalles fra app.js) ---------- */
async function hClick(act, b) {
  const sh = S.hSheet;
  switch (act) {
    case 'h-start': await hStart(); break;
    case 'h-stop': hStop(); break;
    case 'h-cancel': {
      if (!b.dataset.armed) { arm(b, 'Trykk igjen for å forkaste'); break; }
      const e = hRunning(); if (e) { delete S.hours[e.id]; await DB.del('hours', e.id); render(); toast('Timeren er forkastet'); }
      break;
    }
    case 'h-site': {
      const e = hRunning();
      if (e) { e.siteId = b.dataset.id; e.siteTouched = true; S.settings.hLastSite = e.siteId; saveSettings(); hSave(e); } else { S.hPick = b.dataset.id; S.hManual = true; }
      render(); break;
    }
    case 'h-geo': await hCalibrate(); break;
    case 'h-open': S.view = 'hours'; S.hMonth = S.hMonth || todayISO().slice(0, 7); render(); window.scrollTo(0, 0); break;
    case 'h-month': { const [y, m] = (S.hMonth || todayISO().slice(0, 7)).split('-').map(Number), d = new Date(y, m - 1 + +b.dataset.d, 1); S.hMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); render(); break; }
    case 'h-new': hNewManual(); break;
    case 'h-edit': { const e = S.hours[b.dataset.id]; if (e && e.end) hOpenSheet(e, false); break; }
    case 'h-xlsx': hExcel(S.hMonth || todayISO().slice(0, 7)); break;
    case 'hs-site': if (sh) { sh.d.siteId = b.dataset.id; sh.d.split = {}; sh.d.link = null; hRenderSheet(); } break;
    case 'hs-kind': if (sh) { sh.d.kind = b.dataset.id; hRenderSheet(); } break;
    case 'hs-men': if (sh) { sh.d.men = Math.max(1, Math.min(9, sh.d.men + +b.dataset.d)); hRenderSheet(); } break;
    case 'hs-addr': {
      if (!sh) break; const name = (sh.newr || '').trim(); if (!name) { toast('Skriv navnet på mottakeren først.'); break; }
      if (name.toLowerCase() === 'annet' || name.toLowerCase() === 'ikke fordelt') { toast('Det navnet er reservert.'); break; }
      const list = ((S.settings.recip ||= {})[sh.d.siteId] ||= []);
      if (!hRecips(sh.d.siteId).some(n => nrm(n) === nrm(name))) { list.push(name); saveSettings(); }
      sh.newr = ''; hRenderSheet(); break;
    }
    case 'hs-delr': {
      if (!sh) break; if (!b.dataset.armed) { arm(b, 'Trykk igjen'); break; }
      const id = sh.d.siteId, n = b.dataset.name; S.settings.recip[id] = (S.settings.recip[id] || []).filter(x => x !== n); delete sh.d.split[n]; saveSettings(); hRenderSheet(); break;
    }
    case 'hs-save': await hSaveSheet(); break;
    case 'hs-close': S.hSheet = null; hRenderSheet(); render(); break;
    case 'hs-del': {
      if (!sh) break; if (!b.dataset.armed) { arm(b, 'Trykk igjen for å slette'); break; }
      delete S.hours[sh.id]; await DB.del('hours', sh.id); S.hSheet = null; hRenderSheet(); render(); toast('Føringen er slettet'); break;
    }
  }
}
function hInput(el, type) {
  if (el.dataset.hrun === 'text') {
    const e = hRunning(); if (e) { e.text = el.value; clearTimeout(S.hTimer); S.hTimer = setTimeout(() => hSave(e), 400); }
    return;
  }
  const sh = S.hSheet; if (!sh) return;
  const d = sh.d;
  if (el.dataset.hsplit !== undefined) {
    if (type !== 'input') return;
    const u = hUnits(hSheetMin(d)), n = el.dataset.hsplit;
    const others = Object.entries(d.split).filter(([k]) => k !== n).reduce((a, [, v]) => a + v, 0);
    const v = Math.max(0, Math.min(+el.value, u - others)); el.value = v; d.split[n] = v;
    const lab = el.parentElement.querySelector('b'); if (lab) lab.textContent = hTxt(v) + ' t';
    const rest = $('#hs-rest'); if (rest) rest.textContent = hTxt(u - others - v) + ' t';
    if (n === 'Annet') { const o = $('#hs-other'); if (o) o.hidden = v === 0; }
    return;
  }
  switch (el.dataset.hs) {
    case 'text': d.text = el.value; break;
    case 'other': d.other = el.value; break;
    case 'newr': sh.newr = el.value; break;
    case 'date': case 'from': case 'to': if (type === 'change' && el.value) { d[el.dataset.hs] = el.value; hRenderSheet(); } break;
    case 'link': if (type === 'change') {
      const x = openAll().find(z => z.id === el.value);
      d.link = x ? { id: x.id, text: x.text } : null;
      if (x && !d.text.trim()) d.text = String(x.text || '').split('\n')[0];
      hRenderSheet();
    } break;
  }
}
setInterval(() => { const r = typeof hRunning === 'function' && S && S.hours ? hRunning() : null, el = r && document.getElementById('h-el'); if (el) el.textContent = hClock(hMin(r)); }, 15000);
