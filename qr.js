'use strict';
/* Minimal QR-kodegenerator (byte-modus, feilretting M, versjon 1–20). Virker uten nett.
   Bruk: qrSvg(tekst) → SVG-streng. Algoritmen følger QR-standarden (ISO 18004). */
const QR = (() => {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAXV = 20, FORMAT_M = 0;

  const rawModules = v => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];

  // Reed-Solomon over GF(256)
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; };
  const rsDivisor = deg => { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; };
  const rsRemainder = (data, div) => { const r = new Array(div.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); } return r; };

  const alignPositions = v => {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, res = [6];
    for (let pos = v * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  };

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 1;
    for (; v <= MAXV; v++) { const cap = dataCodewords(v) * 8; if (4 + 8 * (v < 10 ? 1 : 2) + bytes.length * 8 <= cap) break; }
    if (v > MAXV) throw new Error('For lang tekst til QR-kode');
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const capBits = dataCodewords(v) * 8;
    put(0, Math.min(4, capBits - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

    // del i blokker, legg på feilretting, flett
    const nb = NUM_BLOCKS[v], ecl = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8), shortBlocks = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const blocks = [], div = rsDivisor(ecl);
    for (let i = 0, k = 0; i < nb; i++) {
      const len = shortLen - ecl + (i < shortBlocks ? 0 : 1); const dat = data.slice(k, k + len); k += len;
      const ec = rsRemainder(dat, div); if (i < shortBlocks) dat.push(0); blocks.push(dat.concat(ec));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((bl, j) => { if (i !== shortLen - ecl || j >= shortBlocks) out.push(bl[i]); });
    return { v, codewords: out };
  }

  function build(v, codewords) {
    const size = v * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(v), n = ap.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = mask => {
      const d = (FORMAT_M << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((d << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // data i sikksakk
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
    return { size, mod, fn, drawFormat };
  }

  const maskBit = (m, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
  const applyMask = (q, m) => { for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (!q.fn[y][x] && maskBit(m, x, y)) q.mod[y][x] = !q.mod[y][x]; };

  function penalty(q) {
    const s = q.size, g = q.mod; let p = 0;
    const runs = line => { let pen = 0, run = 1; for (let i = 1; i < s; i++) { if (line[i] === line[i - 1]) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; } else run = 1; } return pen; };
    for (let y = 0; y < s; y++) { p += runs(g[y]); p += runs(g.map(r => r[y])); }
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) { const c = g[y][x]; if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3; }
    const pat = [true, false, true, true, true, false, true, false, false, false, false], pat2 = pat.slice().reverse();
    const finderLike = line => { let n = 0; for (let i = 0; i + 11 <= s; i++) { if (pat.every((b, k) => line[i + k] === b)) n++; if (pat2.every((b, k) => line[i + k] === b)) n++; } return n; };
    for (let y = 0; y < s; y++) { p += 40 * finderLike(g[y]); p += 40 * finderLike(g.map(r => r[y])); }
    let dark = 0; g.forEach(r => r.forEach(c => { if (c) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }

  function matrix(text) {
    const { v, codewords } = encode(text);
    let best = null, bestPen = Infinity;
    for (let m = 0; m < 8; m++) {
      const q = build(v, codewords); applyMask(q, m); q.drawFormat(m);
      const pen = penalty(q); if (pen < bestPen) { bestPen = pen; best = q; }
    }
    return best;
  }

  function svg(text, { quiet = 4 } = {}) {
    const q = matrix(text), n = q.size + quiet * 2; let d = '';
    for (let y = 0; y < q.size; y++) { let x = 0; while (x < q.size) { if (!q.mod[y][x]) { x++; continue; } let e = x; while (e < q.size && q.mod[y][e]) e++; d += `M${x + quiet} ${y + quiet}h${e - x}v1h${-(e - x)}z`; x = e; } }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR-kode"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { svg, matrix };
})();
if (typeof module !== 'undefined') module.exports = QR;
