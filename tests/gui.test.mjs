// Røyktest av forsiden med faner, innstillinger og fremdrift i inspeksjon.
// Kjør: node tests/gui.test.mjs   (sett NODE_PATH hvis Playwright ligger globalt; krever Playwright og Chrome; Hub er mocket, innholdet er oppdiktet)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');   // require finner også Playwright via NODE_PATH
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const src = fs.readFileSync(path.join(root, 'tests/dummy-innhold.js'), 'utf8');
const inbox = [{ id: 'm1', at: Date.now(), status: 'ny', where: 'Butikk A', text: 'Lekkasje', name: 'Test', phone: '12345678', pics: 0 }];

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
  if (u.pathname === '/inbox') return j({ items: inbox });
  if (u.pathname === '/actions') return j({ items: [] });
  if (u.pathname === '/links') return j({ error: 'Ingen lenker' }, 404);
  return j({ ok: true });
});
await page.addInitScript(([s]) => {
  if (localStorage.getItem('insp-settings')) return;
  localStorage.setItem('insp-settings', JSON.stringify({ by: 'Test Testesen', company: 'Testfirma', hub: { url: 'https://hub.test', code: 'kode' } }));
  localStorage.setItem('insp-content', JSON.stringify({ at: 1, src: s }));
}, [src]);
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png') }); };
const txt = sel => page.locator(sel).first().innerText();
const low = async sel => (await txt(sel)).toLowerCase();   // overskrifter vises med store bokstaver

await page.goto(base);
await page.waitForSelector('#tabs:not([hidden])');
check('fire faner', await page.locator('#tabs .tab').count() === 4);
check('I dag er valgt', (await txt('#tabs .tab[aria-current="page"]')).includes('I dag'));
check('tittel er I dag', (await txt('.brand-name')) === 'I dag');
check('tre runder forfaller', await page.locator('.row-card.due').count() === 3);
check('Meld avvik ligger fast', await page.locator('.fabbar [data-act="avvik-new"]').isVisible());
await page.waitForSelector('.inbox-card');
check('innmelding vises på I dag', (await txt('.inbox-card')).includes('Ny innmelding'));
check('merke på Mer for ny innmelding', (await txt('#tabs .tab[data-id="more"] .badge')).startsWith('1'));
await shot('1-i-dag');

// Start en runde: faner skjules, fremdrift og fast linje vises
await page.locator('.row-card.due [data-act="new"][data-tpl="uke_a"]').click();
await page.waitForSelector('#prog');
check('faner skjult i inspeksjon', await page.locator('#tabs').isHidden());
check('fremdrift 0 av 4', (await txt('#prog')).includes('0 av 4 besvart'));
check('fast linje med neste ubesvarte', (await txt('#insbar')).includes('Neste ubesvarte (4 igjen)'));
await page.locator('[data-act="set"][data-key="runde.lys"][data-val="Ok"]').click();
check('fremdrift 1 av 4 etter svar', (await txt('#prog')).includes('1 av 4 besvart'));
await page.locator('[data-act="set"][data-key="runde.nodlys"][data-val="Ikke OK"]').click();
check('avvik telles i fremdrift', (await txt('#prog')).includes('1 avvik'));
await page.locator('#n-runde\\.trykk').fill('6,5');
check('fremdrift oppdateres ved tall uten ny opptegning', (await txt('#prog')).includes('3 av 4 besvart'));
await page.locator('#insbar [data-act="next-open"]').click();
check('neste ubesvarte markeres', await page.locator('#it-runde\\.dorer.pulse').count() === 1);
await shot('2-inspeksjon');
await page.locator('[data-act="set"][data-key="runde.dorer"][data-val="Ok"]').click();
check('linjen bytter når alt er besvart', (await txt('#insbar')).includes('Alt er besvart'));

// Tilbake: påbegynt runde vises, og runden er ute av Forfaller
await page.locator('#topbar .back').click();
check('påbegynt vises under Pågår', (await low('#app')).includes('pågår'));
check('påbegynt runde er ute av Forfaller', await page.locator('.row-card.due').count() === 2);

// Bygg
await page.locator('#tabs .tab[data-id="sites"]').click();
check('to bygg', await page.locator('.sitebtn').count() === 2);
check('siste inspeksjoner ligger under Bygg', (await low('#app')).includes('siste inspeksjoner'));
await shot('3-bygg');
await page.locator('.sitebtn').first().click();
check('byggside åpnes med faner', (await txt('.bar-title')) === 'Testbygg A' && await page.locator('#tabs').isVisible());
check('Bygg er valgt på byggsiden', (await txt('#tabs .tab[aria-current="page"]')).includes('Bygg'));
await page.locator('#topbar .back').click();
check('tilbake til bygglisten', await page.locator('.sitebtn').count() === 2);

// Handlinger: lag en handling i kladden og se at den telles
await page.locator('#tabs .tab[data-id="acts"]').click();
check('ingen åpne handlinger', (await txt('#app')).includes('Ingen åpne handlinger'));
await page.locator('#tabs .tab[data-id="today"]').click();
await page.locator('.row-main[data-act="open"]').first().click();
await page.locator('[data-act="act-add"][data-key="runde.nodlys"]').click();
await page.locator('.act textarea').first().fill('Bytt lyskilde');
await page.locator('#topbar .back').click();
check('handling med frist vises på I dag', (await low('#app')).includes('handlinger med frist') && (await txt('#app')).includes('Bytt lyskilde'));
check('merke på Handlinger', (await txt('#tabs .tab[data-id="acts"] .badge')).startsWith('1'));
await page.locator('#tabs .tab[data-id="acts"]').click();
check('handlingen står under Handlinger', await page.locator('.act-line').count() === 1);

// Mer og innstillinger i tre deler
await page.locator('#tabs .tab[data-id="more"]').click();
check('fem rader under Mer', await page.locator('.gr').count() === 5);
await shot('4-mer');
await page.locator('.gr[data-id="me"]').click();
check('Meg: navn, notater og sikkerhetskopi', await page.locator('#set-by').inputValue() === 'Test Testesen' && await page.locator('[data-act="export"]').count() === 1 && await page.locator('[data-lnote]').count() === 3);
await page.locator('#set-co').fill('Nytt firma');
await page.locator('#topbar .back').click();
check('firmanavn lagres', (await txt('.ver')).includes('Nytt firma'));
await page.locator('.gr[data-id="conn"]').click();
check('Tilkobling: Hub, Trello og versjon', await page.locator('#hub-url').inputValue() === 'https://hub.test' && await page.locator('[data-act="tr-test"]').count() === 1 && await page.locator('[data-act="force-update"]').count() === 1);
await page.locator('#topbar .back').click();
await page.locator('.gr[data-id="admin"]').click();
check('Administrator: innholdsfil', await page.locator('[data-act="content-upload"]').count() === 1);
await page.locator('[data-act="links-open"]').click();
check('lenkesiden åpnes fra Administrator', (await txt('.bar-title')) === 'Del lenker');
await page.locator('#topbar .back').click();
check('tilbake fra lenker går til Mer', await page.locator('.gr').count() === 5);
await page.locator('.gr[data-act="inbox-open"]').click();
check('innboks åpnes fra Mer', (await txt('.bar-title')) === 'Innmeldinger');
await page.locator('#topbar .back').click();

// Fullfør runden: den forsvinner fra Pågår
await page.locator('#tabs .tab[data-id="today"]').click();
await page.locator('.row-main[data-act="open"]').first().click();
await page.locator('#insbar [data-act="go-finish"]').click();
await page.locator('.finish [data-act="finish"]').click();
await page.waitForFunction(() => !document.querySelector('#prog'), null, { timeout: 15000 });
check('fullført runde har ikke fremdriftslinje', await page.locator('#insbar').isHidden());
await page.evaluate(() => { const b = document.querySelector('[data-act="close-sheet"]'); if (b) b.click(); });
await page.locator('#topbar .back').click();
check('ingen påbegynte etter fullføring', !(await low('#app')).includes('pågår'));
check('fullført ukentlig runde er ute av Forfaller', await page.locator('.row-card.due [data-tpl="uke_a"]').count() === 0);

// Gjenganger: samme punkt med avvik tre runder på rad
await page.locator('#tabs .tab[data-id="sites"]').click();
await page.locator('.sitebtn[data-id="b"]').click();
for (let n = 1; n <= 3; n++) {
  await page.locator('.tpl[data-tpl="uke_b"]').click();
  await page.locator('[data-act="set"][data-key="runde.lys"][data-val="Ok"]').click();
  await page.locator('[data-act="set"][data-key="runde.nodlys"][data-val="Ikke OK"]').click();
  check(`runde ${n}: gjenganger-linje ${n === 3 ? 'vises' : 'vises ikke'}`, (await page.locator('#it-runde\\.nodlys .rep-line').count()) === (n === 3 ? 1 : 0));
  await page.locator('.finish [data-act="finish"]').click();
  await page.waitForFunction(() => !document.querySelector('#prog'), null, { timeout: 15000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-sheet"]'); if (b) b.click(); });
  await page.locator('#topbar .back').click();
}
await page.locator('[data-act="anl-toggle"]').click();
check('anlegget merkes som gjenganger i listen', (await txt('.anl[data-id="b_nodlys"]')).includes('gjenganger'));
await page.locator('.anl[data-id="b_nodlys"]').click();
check('varsel om gjenganger på anleggssiden', (await txt('.notice.rep')).includes('Nødlys er i orden'));
await shot('5-gjenganger');

// Innmelding med lokale fra QR-merket
await page.route('https://argus-hub.osebergdrift-2e2.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ id: 'a', name: 'Testbygg A', cats: [{ id: 'lokale', label: 'Arbeid i eget lokale', sub: '' }, { id: 'fellesareal', label: 'Arbeid i fellesareal', sub: '' }], lokaler: ['Butikk A'] }) }));
await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.goto(base + 'melding.html?b=a&l=Butikk%20A');
await page.waitForSelector('#s2:not([hidden])');
check('lokale er ferdig utfylt fra lenken', await page.locator('#where').inputValue() === 'Butikk A' && await page.locator('#cats input[value="lokale"]').isChecked());
await page.locator('#cats input[value="fellesareal"]').check();
check('lokalet tømmes ved bytte til fellesareal', await page.locator('#where').inputValue() === '');
await shot('6-melding');
await page.goto(base + 'melding.html?b=a');
await page.waitForSelector('#cats input');
check('uten l i lenken er ingenting forhåndsvalgt', await page.locator('#s2').isHidden());

check('ingen JavaScript-feil', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(fails ? `\n${fails} feil` : '\nAlt ok');
process.exit(fails ? 1 : 0);
