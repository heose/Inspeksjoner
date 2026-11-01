// Argus Hub – Cloudflare Worker (gratisnivå)
// Oppsett: se hub/README.md
// Bindinger: KV-namespace "ARGUS".
// Secrets: CODE (felles kode, administrator), eller CODES (JSON: {"henrik":"kode1","kari":"kode2"}) og ADMINS (navn, kommaseparert).
// Ekstern innmelding: secret TURNSTILE_SECRET (robotsjekk). Åpen adresse: POST /melding. Resten krever kode.

const ORIGINS = ['https://heose.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
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
async function varsle(env) {
  const token = SECRET(env, 'pushover_token'), user = SECRET(env, 'pushover_user');
  if (!token || !user) return;
  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, user, title: 'Argus', message: 'Ny innmelding venter på godkjenning', url: 'https://heose.github.io/Inspeksjoner/', url_title: 'Åpne Argus' }).toString(),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
  } catch (e) { /* ignorer */ }
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
  if (!v.success || (v.hostname && v.hostname !== 'heose.github.io' && v.hostname !== 'localhost')) return json(req, { error: 'Robotsjekken feilet. Last siden på nytt og prøv igjen.' }, 400);

  const t = x => String(x == null ? '' : x).trim();
  const text = t(d.text), name = t(d.name), phone = t(d.phone), where = t(d.where);
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
  await env.ARGUS.put(`inbox:${id}`, JSON.stringify({ id, at: Date.now(), status: 'ny', where, text, name, phone, pics: bytes.length }), { expirationTtl: MELD_TTL });
  await varsle(env);
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
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    const p = url.pathname.split('/').filter(Boolean);

    if (p[0] === 'melding' && !p[1]) { try { return await melding(req, env); } catch (e) { return json(req, { error: 'Noe gikk galt. Prøv igjen, eller ring.' }, 500); } }

    const ip = req.headers.get('CF-Connecting-IP') || 'ukjent', failKey = 'fail:' + ip;
    const fails = parseInt(await env.ARGUS.get(failKey) || '0', 10);
    if (fails >= MAX_FAILS) return json(req, { error: 'For mange forsøk. Vent 15 minutter.' }, 429);
    const user = who(req, env);
    if (!user) { await env.ARGUS.put(failKey, String(fails + 1), { expirationTtl: FAIL_WINDOW }); return json(req, { error: 'Feil kode' }, 401); }

    try {
      // GET /ping
      if (req.method === 'GET' && p[0] === 'ping') return json(req, { ok: true, ts: Date.now() });

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
            await env.ARGUS.put(`inbox:${p[1]}`, JSON.stringify(rec), { expirationTtl: MELD_TTL });
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
        await env.ARGUS.put(`log:${ym}:${p[1]}`, JSON.stringify(rec));
        return json(req, { ok: true });
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
