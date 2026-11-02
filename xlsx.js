/* Minimal xlsx-skriver: regneark med formler, enkel formatering og søylediagram med snittlinje. Ingen avhengigheter (zip uten komprimering). */
'use strict';
const XLSX = (() => {
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zip(files) {
    const parts = [], cen = []; let off = 0;
    const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(head, name, data);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
      off += head.length + name.length + data.length;
    }
    let cl = 0; for (const c of cen) cl += c.length;
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
    return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ref = (c, r) => col(c) + (r + 1);
  const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 + 25569; };
  const q = n => "'" + String(n).replace(/'/g, "''") + "'";

  /* stiler: 0 vanlig, 1 overskrift, 2 dato (dd.mm.åååå), 3 heltall, 4 en desimal, 5 fet tekst, 6 dato mnd åå, 7 fet tall en desimal, 8 netto-kolonne heltall (lys bakgrunn) */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="165" formatCode="#,##0.0"/><numFmt numFmtId="166" formatCode="mmm\\ yy"/></numFmts>
<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF058479"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F3F2"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs></styleSheet>`;

  function cellXml(c, r, v) {
    if (v == null || v === '') return '';
    const o = typeof v === 'object' ? v : { v }, s = o.s ? ` s="${o.s}"` : '', a = ref(c, r);
    if (o.f != null) return `<c r="${a}"${s}><f>${esc(o.f)}</f>${o.v == null ? '' : `<v>${o.v}</v>`}</c>`;
    if (typeof o.v === 'number') return `<c r="${a}"${s}><v>${o.v}</v></c>`;
    return `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
  }
  function sheetXml(sh, hasDrawing) {
    let rows = '';
    sh.rows.forEach((row, r) => {
      const cells = row.map((v, c) => cellXml(c, r, v)).join('');
      const ht = sh.rowHeights && sh.rowHeights[r] ? ` ht="${sh.rowHeights[r]}" customHeight="1"` : '';
      if (cells || ht) rows += `<row r="${r + 1}"${ht}>${cells}</row>`;
    });
    const fr = sh.freeze ? `<pane xSplit="${sh.freeze.c}" ySplit="${sh.freeze.r}" topLeftCell="${ref(sh.freeze.c, sh.freeze.r)}" activePane="bottomRight" state="frozen"/>` : '';
    const cols = sh.cols ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"${sh.noGrid ? ' showGridLines="0"' : ''}>${fr}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.5"/>${cols}<sheetData>${rows}</sheetData>${hasDrawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  }

  const numCache = (vals, fmt) => `<c:numCache><c:formatCode>${esc(fmt || 'General')}</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => v == null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
  const rpr = (sz, b) => `<a:defRPr sz="${sz}" b="${b ? 1 : 0}"/>`;
  function chartXml(ch) {
    const ser = ch.series.map((s, i) => {
      const common = `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>`;
      const cat = `<c:cat><c:numRef><c:f>${esc(ch.cat.f)}</c:f>${numCache(ch.cat.vals, 'mmm yy')}</c:numRef></c:cat>`;
      const val = `<c:val><c:numRef><c:f>${esc(s.f)}</c:f>${numCache(s.vals, '#,##0')}</c:numRef></c:val>`;
      if (s.type === 'line') return `<c:ser>${common}<c:spPr><a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`;
      return `<c:ser>${common}<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${cat}${val}</c:ser>`;
    });
    const bars = ch.series.map((s, i) => s.type === 'line' ? '' : ser[i]).join(''), lines = ch.series.map((s, i) => s.type === 'line' ? ser[i] : '').join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>`
      + `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr>${rpr(1100, 1)}</a:pPr><a:r><a:rPr lang="nb-NO" sz="1100" b="1"/><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
      + `<c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${bars}<c:gapWidth val="60"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>`
      + (lines ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>` : '')
      + `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="mmm\\ yy" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="DDDDDD"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>`
      + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  function drawingXml(charts) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">`
      + charts.map((ch, i) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${ch.a.c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.a.r0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${ch.a.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.a.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Diagram ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('') + '</xdr:wsDr>';
  }

  /* wb = { sheets: [{ name, rows, cols, freeze, noGrid, charts: [{ title, cat:{f,vals}, series:[{name,f,vals,type,color}], a:{c0,r0,c1,r1} }] }] } */
  function build(wb) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', files = [];
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    let nChart = 0, nDraw = 0, ct = '';
    wb.sheets.forEach((sh, i) => {
      const has = sh.charts && sh.charts.length;
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh, has) });
      ct += `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
      if (has) {
        const dn = ++nDraw; let rels = '';
        sh.charts.forEach((ch, j) => {
          const cn = ++nChart;
          files.push({ name: `xl/charts/chart${cn}.xml`, data: chartXml(ch) });
          ct += `<Override PartName="/xl/charts/chart${cn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
          rels += `<Relationship Id="rId${j + 1}" Type="${R}/chart" Target="../charts/chart${cn}.xml"/>`;
        });
        files.push({ name: `xl/drawings/drawing${dn}.xml`, data: drawingXml(sh.charts) });
        files.push({ name: `xl/drawings/_rels/drawing${dn}.xml.rels`, data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` });
        files.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>` });
        ct += `<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
      }
    });
    files.unshift(
      { name: '[Content_Types].xml', data: `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct}</Types>` },
      { name: '_rels/.rels', data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><bookViews><workbookView/></bookViews><sheets>${wb.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wb.sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${wb.sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES });
    return zip(files);
  }
  return { build, col, ref, serial, q };
})();

if (typeof module !== 'undefined') module.exports = XLSX;
