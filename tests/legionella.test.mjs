// Legionellaspyling: leietakeroversikt, bildepunkt, temperaturgrenser, PDF og leietakere videre til neste runde.
// Kjør: node tests/legionella.test.mjs   (sett NODE_PATH hvis Playwright ligger globalt; krever Playwright og Chrome; Hub er mocket)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const src = fs.readFileSync(path.join(root, 'hub/maler/legionellaspyling.js'), 'utf8') + `
const TEMPLATES = [legionella('leg_a', 'Testbygg A', 'a', ['Butikk A', 'Kafé B']),
  { id: 'avvik', name: 'Avviksmelding', site: '', hidden: true, sections: [{ id: 'avvik', title: 'Avvik', items: [{ id: 'feil', type: 'avvik', label: 'Beskriv avviket' }] }] }];
const SITES = [{ id: 'a', tl: 'a', name: 'Testbygg A', short: 'TA', tpls: ['leg_a'] }];
return { TEMPLATES, TRELLO: { done: 'x', board: 'y', lists: { a: 'la' } }, SITES, ANLEGG: [], LINKS: [] };`;

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FEIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fails++; };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'nb-NO' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.route('https://hub.test/**', route => {
  const u = new URL(route.request().url()), m = route.request().method(), j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname === '/content') return j({ src, at: 1 });
  if (u.pathname === '/rev') return j({ rev: '1' });
  if (u.pathname.startsWith('/month/')) return j({ rows: [] });
  if (u.pathname === '/inbox') return j({ items: [] });
  if (u.pathname === '/actions') return j({ items: [] });
  if (u.pathname === '/links') return j({ error: 'Ingen lenker' }, 404);
  return j({ ok: true });
});
await page.addInitScript(([s]) => {
  if (localStorage.getItem('insp-settings')) return;
  localStorage.setItem('insp-settings', JSON.stringify({ by: 'Test Testesen', company: 'Testfirma', hub: { url: 'https://hub.test', code: 'kode' } }));
  localStorage.setItem('insp-content', JSON.stringify({ at: 1, src: s }));
}, [src]);
const shot = async (n, full = false) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: full }); };
const txt = sel => page.locator(sel).first().innerText();

await page.goto(base);
await page.waitForSelector('#tabs:not([hidden])');
await page.locator('.row-card.due [data-act="new"][data-tpl="leg_a"]').click();
await page.waitForSelector('.ovw');
check('oversikt med to leietakere fra listen', await page.locator('.ovw-row').count() === 2);
check('leietakernavn i oversikt og overskrift', (await txt('.ovw-row')).includes('Butikk A') && (await txt('#inst-lt\\#1 .sec-h')).includes('Kafé B'));
check('leietaker uten status viser Ikke startet', (await txt('.ovw-row')).includes('Ikke startet'));
check('spylepunkter skjult før status er valgt', await page.locator('#it-lt\\#0\\.antall').count() === 0);

// Bildepunkt (valgfritt) i sentralen
check('bildeknapp vises', (await txt('#it-sentral\\.foto_sentral [data-act="photo"]')) === 'Ta bilde');
const before = await txt('#prog');
await page.evaluate(() => document.querySelector('#it-sentral\\.foto_sentral [data-act="photo"]').click());
await page.locator('#filepick').setInputFiles(path.join(root, 'icon-512.png'));
await page.waitForSelector('#it-sentral\\.foto_sentral .thumb');
check('valgfritt bilde endrer ikke antall punkter', parseInt((await txt('#prog')).split(' av ')[1]) === parseInt(before.split(' av ')[1]));
check('knappen blir Ta flere bilder', (await txt('#it-sentral\\.foto_sentral [data-act="photo"]')).includes('flere'));

// Temperaturgrense: minst 70 °C ut fra sentralen
await page.locator('#n-sentral\\.vv_under').fill('66');
check('for lav temperatur markeres uten ny opptegning', await page.locator('#it-sentral\\.vv_under.is-flag').count() === 1 && (await txt('[data-lim="sentral.vv_under"]')).includes('minst 70'));
await page.locator('#n-sentral\\.vv_under').fill('75');
check('markering forsvinner ved 75 °C', await page.locator('#it-sentral\\.vv_under.is-flag').count() === 0);

await page.locator('[data-act="set"][data-key="lt#0.status"][data-val="Spylt"]').click();
check('spylepunkter vises når status er Spylt', await page.locator('#it-lt\\#0\\.antall').count() === 1);
await page.locator('#n-lt\\#0\\.antall').fill('3');
await page.locator('[data-act="set"][data-key="lt#0.samtidig"][data-val="Nei"]').click();

await page.locator('#t-lt\\#1\\.navn').fill('Kafé Bris');
check('nytt navn oppdateres i overskrift og oversikt', (await txt('[data-inst="lt#1"]')) === 'Kafé Bris' && (await txt('[data-ovw="lt#1"]')) === 'Kafé Bris');
await page.locator('[data-act="set"][data-key="lt#1.status"][data-val="Ikke aktuelt"]').click();
check('Ikke aktuelt gir Ferdig i oversikten', (await txt('.ovw-row[data-p="lt#1"]')).includes('Ferdig'));
check('avvik vises i oversikten', (await txt('.ovw-row[data-p="lt#0"]')).includes('avvik') && (await txt('.ovw-row[data-p="lt#0"]')).includes('3 stk'));
await page.locator('[data-act="rep-add"][data-sec="lt"]').click();
await page.locator('#t-lt\\#2\\.navn').fill('Frisør C');
await page.locator('[data-act="set"][data-key="lt#2.status"][data-val="Ikke tilgang"]').click();
check('tre leietakere i oversikten', await page.locator('.ovw-row').count() === 3);
await page.locator('.ovw-row[data-p="lt#2"]').click();
await shot('leg-1-skjema', true);

// Fullfør og lag PDF
await page.locator('#insbar [data-act="go-finish"]').click();
await page.locator('.finish [data-act="finish"]').click();
await page.locator('.finish [data-act="finish-force"]').click();
await page.waitForFunction(() => !document.querySelector('#prog'), null, { timeout: 15000 });
check('PDF lages uten feil', errors.length === 0, errors.join(' | '));
if (shots) { const b64 = await page.evaluate(async () => { const ins = Object.values(S.ins).find(i => i.templateId === 'leg_a'); const out = await buildReport(ins); const u = out instanceof Blob ? new Uint8Array(await out.arrayBuffer()) : new Uint8Array(out); let s = ''; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); }); fs.writeFileSync(path.join(shots, 'legionella.pdf'), Buffer.from(b64, 'base64')); }
await page.evaluate(() => { const b = document.querySelector('[data-act="close-sheet"]'); if (b) b.click(); });
await page.locator('#topbar .back').click();

// Neste runde starter med samme leietakere som forrige
await page.locator('#tabs .tab[data-id="sites"]').click();
await page.locator('.sitebtn[data-id="a"]').click();
await page.locator('.tpl[data-tpl="leg_a"]').click();
await page.waitForSelector('.ovw');
const names = await page.locator('.ovw-name').allInnerTexts();
check('ny runde har leietakerne fra forrige runde', names.join('|') === 'Butikk A|Kafé Bris|Frisør C', names.join('|'));
check('ny runde har ingen svar', (await txt('.ovw')).includes('0 av 3 ferdig'));

check('ingen JavaScript-feil', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(fails ? `\n${fails} feil` : '\nAlt ok');
process.exit(fails ? 1 : 0);
