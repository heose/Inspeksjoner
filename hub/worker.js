// Argus Hub – Cloudflare Worker (gratisnivå)
// Oppsett: se hub/README.md
// Bindinger: KV-namespace "ARGUS".
// Secrets: CODE (felles kode, administrator), eller CODES (JSON: {"henrik":"kode1","kari":"kode2"}) og ADMINS (navn, kommaseparert).
// Ekstern innmelding: secret TURNSTILE_SECRET (robotsjekk). Åpen adresse: POST /melding. Resten krever kode.
// Snøvarsel: Cron Trigger (0 */3 * * *) + secrets PUSHOVER_*, TRELLO_*. Test: GET /snow og POST /snow?test=1.

const ORIGINS = ['https://argus.osebergdrift.no', 'https://heose.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_PDF = 20 * 1024 * 1024, MAX_CONTENT = 1024 * 1024;
const MAX_FAILS = 10, FAIL_WINDOW = 900; // 10 feil kode-forsøk per IP per 15 min

// Sammenligner uten å røpe hvor langt forsøket kom
const same = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
function who(req, env) {
  const c = req.headers.get('x-argus-code'); if (!c) return null;
  let users = {}; try { users = JSON.parse(env.CODES || '{}'); } catch (e) {}
  const admins = String(env.ADMINS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  let hit = null;
  for (const [name, code] of Object.entries(users)) if (code && same(code, c)) hit = { name, admin: admins.includes(name.toLowerCase()) };
  if (!hit && env.CODE && same(env.CODE, c)) hit = { name: 'felles', admin: true };
  return hit;
}

// Trello-proxy: nøkkel og token (secrets TRELLO_KEY og TRELLO_TOKEN) legges på her.
// Bare disse kallene mot tavlen Vaktmester er tillatt.
const BOARD = '69fd92b5f73c4c4645f0a9b2', ID = '[0-9a-f]{24}';
const TR_ALLOW = [
  ['GET', new RegExp(`^boards/${BOARD}$`)],
  ['GET', new RegExp(`^boards/${BOARD}/(members|labels|cards/all)$`)],
  ['POST', /^labels$/],
  ['POST', /^cards$/],
  ['GET', new RegExp(`^cards/${ID}$`)],
  ['PUT', new RegExp(`^cards/${ID}$`)],
  ['POST', new RegExp(`^cards/${ID}/attachments$`)],
];

// ---------- Ekstern innmelding (åpen, uten kode, men med robotsjekk og grenser) ----------
const SECRET = (env, n) => { const k = Object.keys(env).find(x => x.toLowerCase() === n); return k ? env[k] : undefined; };
const MELD_TTL = 90 * 86400, MAX_BODY = 6 * 1024 * 1024, MAX_PICS = 3, MAX_PIC_CHARS = 2 * 1024 * 1024;
const MELD_PER_HOUR = 5, MELD_PER_DAY = 100;
const fromB64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

// Varsel til telefonen via Pushover. Ingen persondata i varselet. Feil her skal aldri stoppe innmeldingen.
// Uten argument: standardvarselet om ny innmelding. Returnerer true hvis Pushover tok imot varselet.
async function varsle(env, o = {}) {
  const token = SECRET(env, 'pushover_token'), user = SECRET(env, 'pushover_user');
  if (!token || !user) return false;
  try {
    const r = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, user, title: o.title || 'Argus', message: o.message || 'Ny innmelding venter på godkjenning', url: o.url || 'https://argus.osebergdrift.no/', url_title: o.urlTitle || 'Åpne Argus', priority: String(o.priority || 0) }).toString(),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    return r.ok;
  } catch (e) { return false; }
}

// Versjonsnøkkel: endres hver gang noe nytt skrives (logg, handling, innmelding). Appene leser den (1 lesing) og henter
// bare lister når den er endret. Sparer list-kall i KV, som har en gratisgrense på 1 000 per døgn.
const bump = env => env.ARGUS.put('rev', String(Date.now())).catch(() => {});
const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
function cleanAct(b, id) {
  return {
    id, iid: cut(b.iid, 64), key: cut(b.key, 120), text: cut(b.text, 600), due: /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : '',
    who: cut(b.who, 60), prio: ['Lav', 'Middels', 'Høy'].includes(b.prio) ? b.prio : 'Lav',
    done: !!b.done, doneAt: cut(b.doneAt, 10), doneBy: cut(b.doneBy, 60), closedIn: cut(b.closedIn, 80),
    tr: b.tr && b.tr.id ? { id: cut(b.tr.id, 40), url: cut(b.tr.url, 200) } : null,
    tpl: cut(b.tpl, 100), tplId: cut(b.tplId, 40), siteId: cut(b.siteId, 20), date: cut(b.date, 10), by: cut(b.by, 60),
    anl: Array.isArray(b.anl) ? b.anl.slice(0, 20).map(x => cut(x, 40)) : [], upd: Number(b.upd) || 0,
  };
}

// ---------- Snøvarsel (Cron Trigger, f.eks. hver 3. time) ----------
// Henter prognosen fra MET (Locationforecast 2.0). Ved snø de neste 24 timene sendes push (Pushover)
// og det lages et Trello-kort med sjekkliste på Olsrød Park-listen. Maks ett varsel per 18 timer.
// Cron settes i Cloudflare: Settings → Trigger Events → Cron Triggers → 0 */3 * * *
const SNOW = {
  name: 'Olsrød Park', lat: 59.30, lon: 10.40,       // Tolvsrød, Tønsberg. Omtrentlig punkt, justér ved behov.
  list: '69fd92efa0fbbbd4a10fc0ee',                  // Trello-liste for OP på tavla Vaktmester
  maxTemp: 1.0,                                      // °C: nedbør ved og under dette regnes som snø
  minHour: 0.1,                                      // mm/t som må til for å telle
  mm12: 2.0,                                         // varsel når summen i et 12-timersvindu når dette (≈ 2 cm våt snø)
  months: [10, 11, 0, 1, 2],                         // nov–mar (JS: 0 = januar)
  quiet: 18 * 3600,                                  // sekunder mellom varsler
  ua: 'ArgusHub/1.0 github.com/heose/Inspeksjoner',  // MET krever identifiserbar User-Agent
};
const SNOW_TODO = [
  'Merke p-plasser (snørydding)',
  'Sjekke at rømningsveier og nødutganger er frie for snø og is',
  'Brøyte/strø inngangsparti, varemottak og rømningsveier',
  'Sjekke at atkomst for brannvesen, brannkum og sprinklerinntak er fri',
  'Sjekke tak, nedløp og sluk',
  'Sjekke at ytterdører og porter fungerer',
  'Varsle leietakere ved behov',
];
const osloDay = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
const osloClock = d => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }).format(d);

async function snowForecast(now = new Date()) {
  const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${SNOW.lat.toFixed(4)}&lon=${SNOW.lon.toFixed(4)}`, {
    headers: { 'User-Agent': SNOW.ua },
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!r.ok) throw new Error('MET ' + r.status);
  const j = await r.json(), t0 = now.getTime(), hours = [];
  for (const e of (j.properties && j.properties.timeseries) || []) {
    const t = Date.parse(e.time), h1 = e.data && e.data.next_1_hours;
    if (!h1 || t + 3600e3 <= t0 || t >= t0 + 24 * 3600e3) continue;
    const temp = e.data.instant.details.air_temperature, mm = (h1.details && h1.details.precipitation_amount) || 0, sym = (h1.summary && h1.summary.symbol_code) || '';
    const snowy = /snow|sleet/.test(sym) || (temp <= SNOW.maxTemp && mm >= SNOW.minHour);
    hours.push({ t, temp, mm, sym, snowy, snow: snowy ? mm : 0 });
  }
  let peak = 0, at = -1;
  for (let i = 0; i < hours.length; i++) {
    let s = 0; for (let k = i; k < Math.min(i + 12, hours.length); k++) s += hours[k].snow;
    if (s > peak) { peak = s; at = i; }
  }
  const win = at < 0 ? [] : hours.slice(at, at + 12), first = win.find(h => h.snowy);
  return {
    trigger: peak >= SNOW.mm12 && !!first, peak: Math.round(peak * 10) / 10, start: first ? first.t : null,
    tmin: win.length ? Math.min(...win.map(h => h.temp)) : null, n: hours.length,
    hours: hours.map(h => ({ t: new Date(h.t).toISOString(), temp: h.temp, mm: h.mm, sym: h.sym, snowy: h.snowy })),
  };
}

async function snowCard(env, f, msg) {
  const key = SECRET(env, 'trello_key'), token = SECRET(env, 'trello_token');
  if (!key || !token) return null;
  const tr = async (path, params) => {
    const u = new URL('https://api.trello.com/1/' + path);
    u.searchParams.set('key', key); u.searchParams.set('token', token);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u.toString(), { method: 'POST' });
    if (!r.ok) throw new Error('Trello ' + r.status);
    return r.json();
  };
  const due = new Date(Math.max(Date.now() + 3600e3, f.start - 2 * 3600e3)).toISOString();
  const c = await tr('cards', { idList: SNOW.list, pos: 'top', due, name: `Snøberedskap ${SNOW.name} – ${osloDay(new Date(f.start))}`, desc: msg + '\n\nKilde: MET Locationforecast. Opprettet automatisk av Argus Hub.' });
  try {
    const cl = await tr(`cards/${c.id}/checklists`, { name: 'Snøberedskap' });
    for (const x of SNOW_TODO) await tr(`checklists/${cl.id}/checkItems`, { name: x });
  } catch (e) { /* kortet finnes uansett */ }
  return { id: c.id, shortUrl: c.shortUrl };
}

// o.dry: bare analyse. o.force: hopp over sesong. Ellers full kjøring med dempning og utsending.
async function snowCheck(env, o = {}) {
  const now = new Date();
  if (!o.force && !SNOW.months.includes(now.getUTCMonth())) return { skipped: 'utenfor sesong' };
  const f = await snowForecast(now);
  if (o.dry || !f.trigger) return { ...f, sent: false };
  if (await env.ARGUS.get('snow:last')) return { ...f, sent: false, quiet: true };
  const mm = f.peak.toFixed(f.peak < 10 ? 1 : 0).replace('.', ',');
  const msg = `Snø ventet ved ${SNOW.name} fra kl. ${osloClock(new Date(f.start))}: ca. ${mm} mm nedbør (omtrent ${Math.round(f.peak)}–${Math.round(f.peak * 2)} cm snø) i løpet av 12 t, ned til ${Math.round(f.tmin)} °C.`;
  let card = null; try { card = await snowCard(env, f, msg); } catch (e) { /* push går uansett */ }
  const pushed = await varsle(env, { title: 'Argus – snø', message: msg + (card ? ' Trello-kort er laget.' : ''), url: card && card.shortUrl, urlTitle: card ? 'Åpne kortet' : undefined });
  if (card || pushed) await env.ARGUS.put('snow:last', JSON.stringify({ at: Date.now(), card: card && card.shortUrl }), { expirationTtl: SNOW.quiet });
  return { ...f, sent: !!(card || pushed), pushed, card: card && card.shortUrl };
}

// Bygg og kategorier for meldingssiden (melding.html?b=op). Id-ene er de samme som i SITES i content.js.
// Leietakerlister ligger i KV (nøkkel mcfg:<bygg>) og hentes av siden, så navn ikke havner i det offentlige repoet.
const CATS = {
  lokale: { label: 'Arbeid i eget lokale', short: 'Eget lokale', sub: 'Gjelder lokalet du leier. Gjelder det nøkkel, skriv det i beskrivelsen.' },
  fellesareal: { label: 'Arbeid i fellesareal', short: 'Fellesareal', sub: 'Gang, parkering, uteområde, tekniske rom.' },
  skade: { label: 'Skade / hærverk', short: 'Skade/hærverk', sub: 'Noe er ødelagt eller utsatt for skade.' },
  brikke: { label: 'Ny adgangsbrikke', short: 'Adgangsbrikke', sub: 'Bestill ny brikke, for eksempel ved tap eller ny beboer.' },
};
// over: tekster som overstyrer kategorien for ett bygg (SVK er boliger, ikke leietakere)
const BYGG = {
  op: { name: 'Olsrød Park', cats: ['lokale', 'fellesareal', 'skade'] },
  vk: { name: 'Vekterkvartalet', cats: ['lokale', 'fellesareal', 'skade'] },
  svk: { name: 'Sameiet VK', cats: ['lokale', 'fellesareal', 'skade', 'brikke'], over: {
    lokale: { label: 'Arbeid i din leilighet', short: 'Egen leilighet', sub: 'Gjelder arbeid i leiligheten din.', where: 'Hvilken leilighet?', hint: 'F.eks. leilighetsnummer eller seksjon.', text: 'Hva skal gjøres? Beskriv arbeidet og hvor i leiligheten.' },
  } },
};
const catOf = (b, id) => ({ ...CATS[id], ...((BYGG[b] && BYGG[b].over && BYGG[b].over[id]) || {}) });
const cleanLokaler = a => [...new Set((Array.isArray(a) ? a : []).map(x => cut(x, 80).trim()).filter(Boolean))].slice(0, 300);

// Åpen: GET /melding/config            -> liste over bygg
//       GET /melding/config?b=op       -> navn, kategorier og leietakerliste for bygget
async function meldingConfig(req, env, url) {
  const b = url.searchParams.get('b');
  if (!b) return json(req, { bygg: Object.entries(BYGG).map(([id, x]) => ({ id, name: x.name })) });
  const x = BYGG[b]; if (!x) return json(req, { error: 'Ukjent bygg' }, 404);
  let lokaler = []; try { lokaler = cleanLokaler(JSON.parse(await env.ARGUS.get('mcfg:' + b) || '[]')); } catch (e) { /* ingen liste */ }
  const r = json(req, { id: b, name: x.name, cats: x.cats.map(id => { const c = catOf(b, id); return { id, label: c.label, sub: c.sub, where: c.where, hint: c.hint, text: c.text }; }), lokaler });
  r.headers.set('cache-control', 'public, max-age=60');
  return r;
}

async function melding(req, env) {
  const o = req.headers.get('Origin');
  if (o && !ORIGINS.includes(o)) return json(req, { error: 'Ikke tillatt' }, 403);
  if (req.method !== 'POST') return json(req, { error: 'Ikke tillatt' }, 405);
  if (parseInt(req.headers.get('content-length') || '0', 10) > MAX_BODY) return json(req, { error: 'Meldingen er for stor' }, 413);
  const ip = req.headers.get('CF-Connecting-IP') || 'ukjent';
  const hour = new Date().toISOString().slice(0, 13), day = hour.slice(0, 10);
  const rk = `rl:${ip}:${hour}`, dk = `rl:day:${day}`;
  const n = parseInt(await env.ARGUS.get(rk) || '0', 10), nd = parseInt(await env.ARGUS.get(dk) || '0', 10);
  if (nd >= MELD_PER_DAY) return json(req, { error: 'Mottaket er midlertidig stengt. Ring i stedet.' }, 429);
  if (n >= MELD_PER_HOUR) return json(req, { error: 'For mange meldinger fra deg nå. Prøv igjen om en time, eller ring.' }, 429);
  await env.ARGUS.put(rk, String(n + 1), { expirationTtl: 3700 });
  await env.ARGUS.put(dk, String(nd + 1), { expirationTtl: 90000 });

  let d; try { d = await req.json(); } catch (e) { return json(req, { error: 'Ugyldig melding' }, 400); }
  if (d.website) return json(req, { ok: true }); // skjult felt: roboter fyller det ut
  const tsSecret = SECRET(env, 'turnstile_secret');
  if (!tsSecret) return json(req, { error: 'Mottaket er ikke ferdig satt opp' }, 500);
  const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: tsSecret, response: String(d.token || ''), remoteip: ip }) });
  const v = await vr.json().catch(() => ({}));
  if (!v.success || (v.hostname && !['argus.osebergdrift.no', 'heose.github.io', 'localhost'].includes(v.hostname))) return json(req, { error: 'Robotsjekken feilet. Last siden på nytt og prøv igjen.' }, 400);

  const t = x => String(x == null ? '' : x).trim();
  const text = t(d.text), name = t(d.name), phone = t(d.phone), where = t(d.where);
  // Bygg og kategori (ny side). Uten b fungerer den gamle siden som før.
  const site = t(d.b), cat = t(d.cat), urgent = !!d.urgent;
  if (site) {
    if (!BYGG[site]) return json(req, { error: 'Ukjent bygg. Åpne lenken på nytt.' }, 400);
    if (!BYGG[site].cats.includes(cat)) return json(req, { error: 'Velg hva det gjelder.' }, 400);
  }
  if (where.length < 2 || where.length > 100) return json(req, { error: 'Skriv hvilket bygg eller hvilken leietaker det gjelder.' }, 400);
  if (text.length < 5 || text.length > 2000) return json(req, { error: 'Beskriv saken med 5 til 2000 tegn.' }, 400);
  if (name.length < 2 || name.length > 80) return json(req, { error: 'Skriv navnet ditt.' }, 400);
  if (!/^[+\d][\d\s()+-]{5,29}$/.test(phone)) return json(req, { error: 'Skriv et telefonnummer vi kan ringe.' }, 400);
  const pics = Array.isArray(d.pics) ? d.pics.slice(0, MAX_PICS) : [];
  const bytes = [];
  for (const p of pics) {
    if (typeof p !== 'string' || p.length > MAX_PIC_CHARS) return json(req, { error: 'Et bilde er for stort.' }, 400);
    let u; try { u = fromB64(p); } catch (e) { return json(req, { error: 'Ugyldig bilde.' }, 400); }
    if (u[0] !== 0xFF || u[1] !== 0xD8 || u[2] !== 0xFF) return json(req, { error: 'Bare JPEG-bilder er tillatt.' }, 400);
    bytes.push(u);
  }
  const id = crypto.randomUUID();
  for (let i = 0; i < bytes.length; i++) await env.ARGUS.put(`inboxpic:${id}:${i}`, bytes[i], { expirationTtl: MELD_TTL });
  await env.ARGUS.put(`inbox:${id}`, JSON.stringify({ id, at: Date.now(), status: 'ny', where, text, name, phone, pics: bytes.length, ...(site ? { site, cat, urgent } : {}) }), { expirationTtl: MELD_TTL });
  await bump(env);
  const hast = cat === 'skade' || urgent;
  await varsle(env, site ? { title: 'Argus – ' + BYGG[site].name, message: `Ny innmelding (${catOf(site, cat).short}${urgent ? ', haster' : ''}) venter på godkjenning`, priority: hast ? 1 : 0 } : {});
  return json(req, { ok: true });
}

const cors = req => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type, x-argus-code',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(snowCheck(env).catch(e => console.log('snow: ' + (e && e.message || e))));
  },
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    const p = url.pathname.split('/').filter(Boolean);

    if (p[0] === 'melding' && p[1] === 'config' && !p[2] && req.method === 'GET') { try { return await meldingConfig(req, env, url); } catch (e) { return json(req, { error: 'Noe gikk galt' }, 500); } }
    if (p[0] === 'melding' && !p[1]) { try { return await melding(req, env); } catch (e) { return json(req, { error: 'Noe gikk galt. Prøv igjen, eller ring.' }, 500); } }

    const ip = req.headers.get('CF-Connecting-IP') || 'ukjent', failKey = 'fail:' + ip;
    const fails = parseInt(await env.ARGUS.get(failKey) || '0', 10);
    if (fails >= MAX_FAILS) return json(req, { error: 'For mange forsøk. Vent 15 minutter.' }, 429);
    const user = who(req, env);
    if (!user) { await env.ARGUS.put(failKey, String(fails + 1), { expirationTtl: FAIL_WINDOW }); return json(req, { error: 'Feil kode' }, 401); }

    try {
      // GET /ping
      if (req.method === 'GET' && p[0] === 'ping') return json(req, { ok: true, ts: Date.now() });
      if (req.method === 'GET' && p[0] === 'rev' && !p[1]) return json(req, { rev: await env.ARGUS.get('rev') });

      // PUT /melding/config?b=op (bare administrator): leietakerliste for meldingssiden. Body: { "lokaler": ["Butikk A", ...] }
      if (p[0] === 'melding' && p[1] === 'config' && req.method === 'PUT') {
        if (!user.admin) return json(req, { error: 'Bare administrator' }, 403);
        const b = url.searchParams.get('b'); if (!BYGG[b || '']) return json(req, { error: 'Ukjent bygg' }, 404);
        let d; try { d = await req.json(); } catch (e) { return json(req, { error: 'Ugyldig JSON' }, 400); }
        const l = cleanLokaler(d && d.lokaler);
        await env.ARGUS.put('mcfg:' + b, JSON.stringify(l));
        return json(req, { ok: true, n: l.length });
      }

      // GET /snow  –  analyse av prognosen uten å sende noe.  POST /snow (bare administrator): kjør som cron.  POST /snow?test=1: send testvarsel.
      if (p[0] === 'snow' && !p[1]) {
        if (req.method === 'GET') return json(req, await snowCheck(env, { dry: true, force: true }));
        if (req.method === 'POST') {
          if (!user.admin) return json(req, { error: 'Bare administrator' }, 403);
          if (url.searchParams.get('test')) return json(req, { ok: await varsle(env, { title: 'Argus – test', message: 'Testvarsel for snøvarsling' }) });
          return json(req, await snowCheck(env));
        }
      }

      // /trello/<sti>  – videresendes til api.trello.com/1/<sti>
      if (p[0] === 'trello') {
        const TKEY = SECRET(env, 'trello_key'), TTOKEN = SECRET(env, 'trello_token');
        if (!TKEY || !TTOKEN) return json(req, { error: 'Trello er ikke satt opp i Hub' }, 500);
        const rest = p.slice(1).join('/');
        if (!TR_ALLOW.some(([m, re]) => m === req.method && re.test(rest))) return json(req, { error: 'Ikke tillatt' }, 403);
        const u = new URL('https://api.trello.com/1/' + rest);
        for (const [k, v] of url.searchParams) if (k !== 'key' && k !== 'token') u.searchParams.set(k, v);
        u.searchParams.set('key', TKEY); u.searchParams.set('token', TTOKEN);
        const init = { method: req.method, headers: {} };
        if (req.method !== 'GET') {
          init.body = await req.arrayBuffer();
          const ct = req.headers.get('content-type'); if (ct) init.headers['content-type'] = ct;
        }
        const r = await fetch(u.toString(), init);
        return new Response(r.body, { status: r.status, headers: { ...cors(req), 'content-type': r.headers.get('content-type') || 'application/json' } });
      }

      // Innmeldinger fra eksterne: GET /inbox, GET /inbox/:id/pic/:n, PUT /inbox/:id/status
      if (p[0] === 'inbox') {
        if (req.method === 'GET' && !p[1]) {
          const items = []; let cursor;
          do {
            const l = await env.ARGUS.list({ prefix: 'inbox:', cursor });
            const vals = await Promise.all(l.keys.map(k => env.ARGUS.get(k.name)));
            for (const x of vals) if (x) items.push(JSON.parse(x));
            cursor = l.list_complete ? null : l.cursor;
          } while (cursor);
          items.sort((a, b) => b.at - a.at);
          return json(req, { items: items.slice(0, 60) });
        }
        if (p[1] && /^[\w-]{8,64}$/.test(p[1])) {
          if (req.method === 'GET' && p[2] === 'pic' && /^\d$/.test(p[3] || '')) {
            const v = await env.ARGUS.get(`inboxpic:${p[1]}:${p[3]}`, 'arrayBuffer');
            if (!v) return json(req, { error: 'Finnes ikke' }, 404);
            return new Response(v, { headers: { ...cors(req), 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
          }
          if (req.method === 'PUT' && p[2] === 'status') {
            const d = await req.json();
            if (!['godkjent', 'avvist', 'ny'].includes(d.status)) return json(req, { error: 'Ugyldig status' }, 400);
            const cur = await env.ARGUS.get(`inbox:${p[1]}`); if (!cur) return json(req, { error: 'Finnes ikke' }, 404);
            const rec = JSON.parse(cur); rec.status = d.status; rec.by = user.name; rec.handledAt = Date.now(); if (d.card) rec.card = String(d.card).slice(0, 200);
            await env.ARGUS.put(`inbox:${p[1]}`, JSON.stringify(rec), { expirationTtl: MELD_TTL }); await bump(env);
            return json(req, { ok: true });
          }
        }
      }

      // GET /content  –  PUT /content (bare administrator): sjekklister, bygg og anleggsregister som skript
      if (p[0] === 'content' && !p[1]) {
        if (req.method === 'GET') {
          const { value, metadata } = await env.ARGUS.getWithMetadata('content');
          if (!value) return json(req, { error: 'Ingen innhold' }, 404);
          return json(req, { src: value, at: (metadata && metadata.at) || 0 });
        }
        if (req.method === 'PUT') {
          if (!user.admin) return json(req, { error: 'Bare administrator kan laste opp innhold' }, 403);
          const src = await req.text();
          if (!src || src.length > MAX_CONTENT) return json(req, { error: 'Ugyldig størrelse' }, 400);
          await env.ARGUS.put('content', src, { metadata: { at: Date.now(), by: user.name } });
          return json(req, { ok: true, bytes: src.length });
        }
      }

      // GET /links  –  PUT /links (bare administrator): lenker og skjema som deles fra Argus
      if (p[0] === 'links' && !p[1]) {
        if (req.method === 'GET') {
          const { value, metadata } = await env.ARGUS.getWithMetadata('links');
          if (!value) return json(req, { error: 'Ingen lenker' }, 404);
          return json(req, { links: JSON.parse(value), at: (metadata && metadata.at) || 0 });
        }
        if (req.method === 'PUT') {
          if (!user.admin) return json(req, { error: 'Bare administrator kan endre lenker' }, 403);
          let d; try { d = await req.json(); } catch (e) { return json(req, { error: 'Ugyldig JSON' }, 400); }
          if (!d || !Array.isArray(d.links) || d.links.length > 60) return json(req, { error: 'Ugyldig liste' }, 400);
          const clean = [];
          for (const l of d.links) {
            const str = (v, n) => String(v == null ? '' : v).slice(0, n);
            const url = str(l && l.url, 1500).trim();
            if (!/^https:\/\//i.test(url)) return json(req, { error: 'Lenker må starte med https://' }, 400);
            clean.push({ id: str(l.id, 40) || Math.random().toString(36).slice(2, 10), title: str(l.title, 100).trim() || 'Uten navn', desc: str(l.desc, 200).trim(), url, group: l.group === 'intern' ? 'intern' : 'share' });
          }
          await env.ARGUS.put('links', JSON.stringify(clean), { metadata: { at: Date.now(), by: user.name } });
          return json(req, { ok: true, n: clean.length });
        }
      }

      // PUT /log/:id   (JSON: { id, date, ... })
      if (req.method === 'PUT' && p[0] === 'log' && p[1]) {
        const rec = await req.json();
        const ym = String(rec.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym)) return json(req, { error: 'Ugyldig dato' }, 400);
        rec.id = p[1]; rec.hubAt = Date.now(); rec.user = user.name;
        const lk = `log:${ym}:${p[1]}`, fantes = await env.ARGUS.get(lk);
        await env.ARGUS.put(lk, JSON.stringify(rec)); await bump(env);
        // Push når et avvik registreres første gang, uavhengig av hvem som melder. Gamle poster og oppdateringer varsler ikke.
        const nytt = !fantes && (Number(rec.flags) > 0 || rec.tpl === 'avvik') && String(rec.date || '') >= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
        if (nytt) {
          const t = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
          const n = Number(rec.flags) || 0, na = Number(rec.nact) || 0;
          const hva = rec.tpl === 'avvik' ? 'Avvik meldt' : `${n} avvik i ${t(rec.name, 60)}`;
          await varsle(env, { title: 'Argus – avvik', message: `${hva}${rec.siteId ? ' · ' + t(rec.siteId, 10).toUpperCase() : ''}${na ? ` · ${na} ${na === 1 ? 'handling' : 'handlinger'}` : ''}${rec.by ? ' · ' + t(rec.by, 40) : ''}` });
        }
        return json(req, { ok: true });
      }

      // PUT /act/:id  –  delt handling fra en fullført inspeksjon. Senest endrede «utført»-status (upd) vinner.
      // GET /actions  –  alle delte handlinger (åpne, og utførte siste 30 dager)
      if (req.method === 'PUT' && p[0] === 'act' && p[1] && /^[\w-]{3,64}$/.test(p[1])) {
        let b; try { b = await req.json(); } catch (e) { return json(req, { error: 'Ugyldig JSON' }, 400); }
        const fresh = cleanAct(b, p[1]), key = `act:${p[1]}`, curS = await env.ARGUS.get(key);
        if (curS) {
          const cur = JSON.parse(curS);
          if ((cur.upd || 0) > fresh.upd) Object.assign(fresh, { done: cur.done, doneAt: cur.doneAt, doneBy: cur.doneBy, closedIn: cur.closedIn, upd: cur.upd });
        }
        const next = JSON.stringify(fresh);
        if (next !== curS) { await env.ARGUS.put(key, next, fresh.done ? { expirationTtl: 30 * 86400 } : undefined); await bump(env); }
        return json(req, { ok: true });
      }
      if (req.method === 'GET' && p[0] === 'actions' && !p[1]) {
        const items = []; let cursor;
        do {
          const l = await env.ARGUS.list({ prefix: 'act:', cursor });
          const vals = await Promise.all(l.keys.map(k => env.ARGUS.get(k.name)));
          for (const x of vals) if (x) items.push(JSON.parse(x));
          cursor = l.list_complete ? null : l.cursor;
        } while (cursor && items.length < 1000);
        return json(req, { items });
      }

      // GET /month/YYYY-MM
      if (req.method === 'GET' && p[0] === 'month' && /^\d{4}-\d{2}$/.test(p[1] || '')) {
        const out = []; let cursor;
        do {
          const l = await env.ARGUS.list({ prefix: `log:${p[1]}:`, cursor });
          const vals = await Promise.all(l.keys.map(k => env.ARGUS.get(k.name)));
          for (const v of vals) if (v) out.push(JSON.parse(v));
          cursor = l.list_complete ? null : l.cursor;
        } while (cursor);
        return json(req, { ym: p[1], rows: out, ts: Date.now() });
      }

      // PUT /pdf/:id (binær PDF)  –  GET /pdf/:id
      if (p[0] === 'pdf' && p[1] && /^[\w-]{3,64}$/.test(p[1])) {
        if (req.method === 'PUT') {
          const buf = await req.arrayBuffer();
          if (buf.byteLength > MAX_PDF) return json(req, { error: 'For stor' }, 413);
          await env.ARGUS.put(`pdf:${p[1]}`, buf, { metadata: { name: url.searchParams.get('name') || p[1] + '.pdf', size: buf.byteLength } });
          return json(req, { ok: true, size: buf.byteLength });
        }
        if (req.method === 'GET') {
          const { value, metadata } = await env.ARGUS.getWithMetadata(`pdf:${p[1]}`, 'arrayBuffer');
          if (!value) return json(req, { error: 'Finnes ikke' }, 404);
          const name = encodeURIComponent((metadata && metadata.name) || p[1] + '.pdf');
          return new Response(value, { headers: { ...cors(req), 'content-type': 'application/pdf', 'content-disposition': `inline; filename*=UTF-8''${name}` } });
        }
      }
      return json(req, { error: 'Ukjent adresse' }, 404);
    } catch (e) {
      return json(req, { error: String(e && e.message || e) }, 500);
    }
  },
};
