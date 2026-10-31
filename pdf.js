/* Minimal PDF-skriver: tekst (Helvetica), fylte flater, linjer og JPEG-bilder. Ingen avhengigheter. */
'use strict';
const HW=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const HBW=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,556,278,556,500,1000,556,556,333,1000,667,333,1000,556,611,556,556,278,278,500,500,350,556,1000,333,1000,556,333,944,556,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
const PDFDoc = (() => {
  const K = 72 / 25.4;
  const CP = {0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
  const f = n => (Math.round(n * 100) / 100).toString();
  function enc(s) {
    const out = [];
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c === 9) out.push(32);
      else if (c < 32) continue;
      else if (c < 256 && !(c >= 0x80 && c < 0xA0)) out.push(c);
      else if (CP[c]) out.push(CP[c]);
      else if (c === 0x2212) out.push(45);
      else out.push(63);
    }
    return out;
  }
  function bytes(str) {
    const b = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 255;
    return b;
  }
  const rgb = c => c.map(v => (v / 255).toFixed(3)).join(' ');

  class Doc {
    constructor() { this.H = 297; this.pages = []; this.images = []; this.addPage(); }
    addPage() { this.cur = []; this.pages.push(this.cur); }
    usePage(i) { this.cur = this.pages[i]; }
    width(s, size, bold) {
      const t = bold ? HBW : HW; let w = 0;
      for (const c of enc(s)) w += t[c] || 556;
      return w * size / 1000 / K;
    }
    wrap(s, size, bold, maxW) {
      const out = [];
      for (const para of String(s).split(/\r?\n/)) {
        const words = para.split(/ +/); let line = '';
        for (let w of words) {
          const test = line ? line + ' ' + w : w;
          if (this.width(test, size, bold) <= maxW) { line = test; continue; }
          if (line) out.push(line);
          while (this.width(w, size, bold) > maxW && w.length > 1) {
            let i = w.length - 1;
            while (i > 1 && this.width(w.slice(0, i), size, bold) > maxW) i--;
            out.push(w.slice(0, i)); w = w.slice(i);
          }
          line = w;
        }
        out.push(line);
      }
      return out;
    }
    rect(x, y, w, h, fill) {
      this.cur.push(`${rgb(fill)} rg ${f(x*K)} ${f((this.H-y-h)*K)} ${f(w*K)} ${f(h*K)} re f`);
    }
    line(x1, y1, x2, y2, color, lw = 0.2) {
      this.cur.push(`${rgb(color)} RG ${f(lw*K)} w ${f(x1*K)} ${f((this.H-y1)*K)} m ${f(x2*K)} ${f((this.H-y2)*K)} l S`);
    }
    text(s, x, y, o = {}) {
      const size = o.size || 10, bold = !!o.bold, color = o.color || [0,0,0];
      const w = this.width(s, size, bold);
      if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
      let str = '';
      for (const b of enc(s)) str += (b === 40 || b === 41 || b === 92) ? '\\' + String.fromCharCode(b) : String.fromCharCode(b);
      this.cur.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${f(x*K)} ${f((this.H-y)*K)} Td (${str}) Tj ET`);
    }
    image(data, pw, ph, x, y, w, h) {
      let i = this.images.findIndex(im => im.data === data);
      if (i < 0) { this.images.push({ data, w: pw, h: ph }); i = this.images.length - 1; }
      this.cur.push(`q ${f(w*K)} 0 0 ${f(h*K)} ${f(x*K)} ${f((this.H-y-h)*K)} cm /Im${i} Do Q`);
    }
    output() {
      const chunks = []; let len = 0; const off = [];
      const push = s => { const b = typeof s === 'string' ? bytes(s) : s; chunks.push(b); len += b.length; };
      const obj = (n, parts) => { off[n] = len; push(`${n} 0 obj\n`); (Array.isArray(parts) ? parts : [parts]).forEach(push); push('\nendobj\n'); };
      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const fi = 5, fp = 5 + this.images.length;
      const pageIds = this.pages.map((_, i) => fp + i * 2);
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${this.pages.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      this.images.forEach((im, i) => obj(fi + i, [
        `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`,
        im.data, '\nendstream']));
      const xo = this.images.map((_, i) => `/Im${i} ${fi + i} 0 R`).join(' ');
      this.pages.forEach((ops, i) => {
        const pid = pageIds[i], cb = bytes(ops.join('\n'));
        obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${pid + 1} 0 R >>`);
        obj(pid + 1, [`<< /Length ${cb.length} >>\nstream\n`, cb, '\nendstream']);
      });
      const total = fp + this.pages.length * 2;
      const xref = len;
      let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
      for (let n = 1; n < total; n++) x += String(off[n]).padStart(10, '0') + ' 00000 n \n';
      push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
      return new Blob(chunks, { type: 'application/pdf' });
    }
  }
  return Doc;
})();
