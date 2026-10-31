// Argus Hub – Cloudflare Worker (gratisnivå)
// Oppsett: se hub/README.md
// Bindinger: KV-namespace "ARGUS" og hemmelighet (secret) "CODE".

const ORIGINS = ['https://heose.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_PDF = 20 * 1024 * 1024;

const cors = req => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type, x-argus-code',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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

    if (!env.CODE || req.headers.get('x-argus-code') !== env.CODE) return json(req, { error: 'Feil kode' }, 401);

    try {
      // GET /ping
      if (req.method === 'GET' && p[0] === 'ping') return json(req, { ok: true, ts: Date.now() });

      // PUT /log/:id   (JSON: { id, date, ... })
      if (req.method === 'PUT' && p[0] === 'log' && p[1]) {
        const rec = await req.json();
        const ym = String(rec.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym)) return json(req, { error: 'Ugyldig dato' }, 400);
        rec.id = p[1]; rec.hubAt = Date.now();
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
