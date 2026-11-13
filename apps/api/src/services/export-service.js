'use strict';

/**
 * Unified table export for every list screen: CSV, XLSX and PDF.
 *
 * The generators are dependency-free on purpose. A real XLSX is a ZIP of XML
 * entries and a minimal PDF is a few text objects; both are small enough to
 * build exactly here, so production never downloads a third-party binary.
 *
 * Every consumer passes the same `columns` / `rows` model:
 *   columns: [{ key, label, format?, width?, align? }]
 *   rows:    plain objects (decimal strings from NUMERIC columns are fine)
 */

// ---------------------------------------------------------------- shared ----

function formatCell(row, column) {
  const raw = row[column.key];
  if (raw === undefined || raw === null) return '';
  switch (column.format) {
    case 'money': {
      const n = Number(raw);
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }
    case 'int': {
      const n = Number(raw);
      return Number.isFinite(n) ? String(Math.trunc(n)) : '';
    }
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : '';
    }
    case 'percent': {
      const n = Number(raw);
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }
    case 'date': {
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      return String(raw).slice(0, 10);
    }
    case 'datetime': {
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    default:
      return String(raw);
  }
}

function numericValue(row, column) {
  const raw = row[column.key];
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function columnWidths(columns, rows) {
  const widths = columns.map((column) => {
    const explicit = Number(column.width || 0);
    if (explicit > 0) return explicit;
    let longest = String(column.label || '').length;
    for (const row of rows.slice(0, 200)) longest = Math.max(longest, formatCell(row, column).length);
    return Math.min(Math.max(Math.ceil(longest * 0.95) + 2, 10), 52);
  });
  return widths;
}

// ------------------------------------------------------------------ csv ----

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const lines = [header];
  for (const row of rows) lines.push(columns.map((column) => csvCell(formatCell(row, column))).join(','));
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

// ----------------------------------------------------------------- xlsx ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date) {
  const stamp = date || new Date();
  const time = (stamp.getHours() << 11) | (stamp.getMinutes() << 5) | (Math.floor(stamp.getSeconds() / 2));
  const time16 = ((stamp.getMonth() + 1) << 5) | stamp.getDate() | ((stamp.getFullYear() - 1980) << 9);
  return { time: time & 0xffff, date: time16 & 0xffff };
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const stamp = zipDateTime();
  const dosTime = stamp.time;
  const dosDate = stamp.date;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(0, 8); // stored, no compression
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    chunks.push(local, name, data);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(dosTime, 12);
    record.writeUInt16LE(dosDate, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...chunks, centralBuffer, end]);
}

function xmlEscape(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    // XML 1.0 forbids most control characters.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

const XLSX_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
};

function toXlsx(columns, rows, sheetName) {
  // Widths in "character units", roughly one unit per character.
  const widths = columnWidths(columns, rows);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  const sheetRows = [];
  const headerCells = columns.map((column, index) => {
    const ref = String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String.fromCharCode(64 + Math.floor(index / 26)) : '') + '1';
    return '<c r="' + ref + '" s="1" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(column.label) + '</t></is></c>';
  });
  sheetRows.push('<row r="1">' + headerCells.join('') + '</row>');

  rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = columns.map((column, index) => {
      const colLetter = columnLetter(index);
      const ref = colLetter + excelRow;
      const style = rowIndex % 2 === 1 ? ' s="2"' : '';
      const numeric = (column.format === 'money' || column.format === 'number' || column.format === 'int' || column.format === 'percent')
        ? numericValue(row, column) : null;
      if (numeric !== null) return '<c r="' + ref + '"' + style + '><v>' + String(numeric) + '</v></c>';
      return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(formatCell(row, column)) + '</t></is></c>';
    });
    sheetRows.push('<row r="' + excelRow + '">' + cells.join('') + '</row>');
  });

  const colsXml = '<cols>' + widths.map((width, index) =>
    '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'
  ).join('') + '</cols>';
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<dimension ref="A1:' + columnLetter(columns.length - 1) + String(rows.length + 1) + '"/>'
    + '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + colsXml
    + '<sheetData>' + sheetRows.join('') + '</sheetData>'
    + '<autoFilter ref="A1:' + columnLetter(columns.length - 1) + String(rows.length + 1) + '"/>'
    + '</worksheet>';

  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView activeTab="0"/></bookViews>'
    + '<sheets><sheet name="' + xmlEscape(String(sheetName || 'Export').slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets>'
    + '</workbook>';

  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2">'
    + '<font><sz val="10"/><color rgb="FF16241F"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="3">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF0B534A"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="1"><border/></borders>'
    + '<cellXfs count="3">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '</cellXfs>'
    + '</styleSheet>';

  return buildZip([
    { path: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { path: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { path: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { path: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { path: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
    { path: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') }
  ]);
}

function columnLetter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ------------------------------------------------------------------ pdf ----

function pdfText(value) {
  // A conservative WinAnsi-ish mapping. Anything unsupported becomes '?'.
  const map = {
    '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...',
    '•': '-', ' ': ' ', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'á': 'a', 'à': 'a', 'â': 'a',
    'ä': 'a', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c', 'š': 's', 'ž': 'z', 'ć': 'c', 'ď': 'd', 'ř': 'r',
    '·': '-', '©': '(c)', '€': 'EUR', '×': 'x', '÷': '/', '±': '+/-', '©': '(c)', '®': '(r)', '™': '(tm)', '°': ' deg', '¼': '1/4', '½': '1/2', '¾': '3/4'
  };
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[‘’“”–—…• ]/g, (ch) => map[ch] !== undefined ? map[ch] : '?')
    .replace(/[^\x20-\x7E]/g, (ch) => (map[ch] !== undefined ? map[ch] : '?'));
}

function pdfEscape(value) {
  return pdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function truncateToWidth(text, width, charWidth) {
  const maxChars = Math.max(1, Math.floor(width / charWidth));
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function toPdf({ title, subtitle, columns, rows, generatedAt, footer }) {
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 36;
  const contentW = PAGE_W - MARGIN * 2;
  const footerH = 26;
  const headerH = 20;
  const titleBlockH = 56;
  const rowH = 15;
  const fontSize = 8.5;
  const charWidth = 4.7;

  const widths = columns.map((column) => {
    const explicit = Number(column.width || 0);
    return explicit > 0 ? explicit / 52 : 0; // normalise if caller used xlsx units
  });
  const natural = columnWidths(columns, rows).map((w) => w / 52);
  const weights = widths.some((w) => w > 0)
    ? widths.map((w, i) => (w > 0 ? w : natural[i]))
    : natural;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const colWidths = weights.map((w) => (w / totalWeight) * contentW);

  const generated = generatedAt ? new Date(generatedAt) : new Date();
  const generatedLabel = 'Generated ' + generated.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const objects = [];
  const pageContents = [];

  function renderHeader(content) {
    // Title block
    content.push('BT /F1 15 Tf ' + MARGIN + ' 800 Td (' + pdfEscape(title || 'Export') + ') Tj ET');
    content.push('BT /F2 8.5 Tf ' + MARGIN + ' 785 Td 0.42 0.52 0.47 rg (' + pdfEscape(subtitle || '') + ') Tj ET');
    content.push('BT /F2 8.5 Tf ' + MARGIN + ' 773 Td 0.42 0.52 0.47 rg (' + pdfEscape(generatedLabel) + ') Tj ET');
    // Accent rule
    content.push(MARGIN + ' 766 m ' + (MARGIN + contentW) + ' 766 l 0.043 0.325 0.29 RG 2.4 w S');
    // Table header background
    content.push(MARGIN + ' ' + (766 - headerH - 4) + ' ' + contentW + ' ' + headerH + ' re 0.043 0.325 0.29 rg f 0 g');
    let x = MARGIN;
    for (let i = 0; i < columns.length; i += 1) {
      content.push('BT /F1 8.5 Tf ' + (x + 4) + ' ' + (766 - headerH / 2 - 1) + ' Td 1 1 1 rg (' + pdfEscape(truncateToWidth(columns[i].label, colWidths[i] - 8, charWidth)) + ') Tj 0 g ET');
      x += colWidths[i];
    }
    return 766 - headerH - 4; // y position of the header bottom
  }

  function renderRows(content, rowStart, rowEnd, headerBottom) {
    let y = headerBottom - 2;
    let zebra = 0;
    for (let i = rowStart; i < rowEnd; i += 1) {
      const row = rows[i];
      zebra += 1;
      if (zebra % 2 === 0) {
        content.push(MARGIN + ' ' + (y - rowH + 4) + ' ' + contentW + ' ' + rowH + ' re 0.965 0.976 0.969 rg f 0 g');
      }
      let x = MARGIN;
      for (let col = 0; col < columns.length; col += 1) {
        const text = formatCell(row, columns[col]);
        const align = columns[col].align === 'right' ? 'right' : 'left';
        const value = truncateToWidth(text, colWidths[col] - 8, charWidth);
        const textWidth = value.length * charWidth;
        const tx = align === 'right' ? x + colWidths[col] - 4 - textWidth : x + 4;
        content.push('BT /F2 8.5 Tf ' + tx.toFixed(1) + ' ' + (y - rowH + 7) + ' Td (' + pdfEscape(value) + ') Tj ET');
        x += colWidths[col];
      }
      y -= rowH;
    }
    return y;
  }

  function renderFooter(content, pageIndex, pageTotal) {
    content.push(MARGIN + ' ' + footerH + ' m ' + (MARGIN + contentW) + ' ' + footerH + ' l 0.85 0.89 0.87 RG 0.8 w S');
    content.push('BT /F2 7.5 Tf ' + MARGIN + ' 15 Td 0.42 0.52 0.47 rg (' + pdfEscape(footer || 'Re-EL ECD') + ') Tj ET');
    const label = 'Page ' + (pageIndex + 1) + ' of ' + pageTotal;
    content.push('BT /F2 7.5 Tf ' + (MARGIN + contentW - 50) + ' 15 Td 0.42 0.52 0.47 rg (' + pdfEscape(label) + ') Tj ET');
  }

  // Paginate rows
  const usable = PAGE_H - MARGIN - titleBlockH - footerH - 30;
  const rowsPerPage = Math.max(1, Math.floor((usable - headerH - 10) / rowH));
  const pages = [];
  for (let start = 0; start < rows.length; start += rowsPerPage) {
    pages.push(rows.slice(start, Math.min(start + rowsPerPage, rows.length)));
  }
  if (!pages.length) pages.push([]);
  const totalPages = pages.length;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const content = [];
    const headerBottom = renderHeader(content);
    const absoluteStart = pageIndex * rowsPerPage;
    renderRows(content, absoluteStart, Math.min(absoluteStart + rowsPerPage, rows.length), headerBottom);
    renderFooter(content, pageIndex, totalPages);
    pageContents.push(content.join('\n'));
  }

  // Assemble the document.
  let nextId = 3; // 1 = catalogue, 2 = pages
  const fontId = nextId; nextId += 1;
  const pageIds = [];
  const contentIds = [];
  for (let i = 0; i < totalPages; i += 1) {
    pageIds.push(nextId); nextId += 1;
    contentIds.push(nextId); nextId += 1;
  }

  const kids = pageIds.map((id) => id + ' 0 R').join(' ');
  objects.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.push({ id: 2, body: '<< /Type /Pages /Kids [' + kids + '] /Count ' + totalPages + ' >>' });
  objects.push({ id: fontId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' });

  for (let i = 0; i < totalPages; i += 1) {
    objects.push({
      id: pageIds[i],
      body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] '
        + '/Resources << /Font << /F1 ' + fontId + ' 0 R /F2 ' + fontId + ' 0 R >> >> '
        + '/Contents ' + contentIds[i] + ' 0 R >>'
    });
    const stream = Buffer.from(pageContents[i], 'utf8');
    objects.push({
      id: contentIds[i],
      body: '<< /Length ' + stream.length + ' >>\nstream\n' + pageContents[i] + '\nendstream'
    });
  }

  objects.sort((a, b) => a.id - b.id);

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  let offset = chunks[0].length;
  const offsets = new Map([[0, 0]]);
  for (const object of objects) {
    const head = Buffer.from(object.id + ' 0 obj\n', 'utf8');
    const body = Buffer.from(object.body, 'utf8');
    const tail = Buffer.from('\nendobj\n', 'utf8');
    offsets.set(object.id, offset);
    chunks.push(head, body, tail);
    offset += head.length + body.length + tail.length;
  }
  const xrefOffset = offset;
  const xrefLines = ['xref', '0 ' + (objects.length + 1), '0000000000 65535 f '];
  for (let i = 1; i <= objects.length; i += 1) {
    xrefLines.push(String(offsets.get(i)).padStart(10, '0') + ' 00000 n ');
  }
  const trailer = ['trailer', '<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>', 'startxref', String(xrefOffset), '%%EOF'];
  chunks.push(Buffer.from(xrefLines.join('\n') + '\n', 'utf8'));
  chunks.push(Buffer.from(trailer.join('\n'), 'utf8'));
  return Buffer.concat(chunks);
}

/**
 * Branded multi-page document (manuals and legal policies).
 * Text flows with headings, paragraphs and numbered steps instead of a
 * table, so it reads as a manual while reusing the same dependency-free
 * PDF machinery as toPdf.
 */
function toDocumentPdf({ title, subtitle, organisationName, intro, sections, updatedAt, version, footer }) {
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 56;
  const contentW = PAGE_W - MARGIN * 2;
  const TITLE_CHARS = 88;
  const BODY_CHARS = 118;
  const GREEN = '0.043 0.325 0.29';

  function wrap(text, chars) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length <= chars) { line = next; continue; }
      if (line) lines.push(line);
      line = word.length > chars ? word.slice(0, chars) : word;
    }
    if (line) lines.push(line);
    return lines;
  }

  const items = [];
  const push = (text, kind) => { for (const line of wrap(text, kind === 'body' ? BODY_CHARS : TITLE_CHARS)) items.push({ line, kind }); };
  push(title || 'Document', 'title');
  if (subtitle) push(subtitle, 'subtitle');
  if (organisationName) push(organisationName, 'subtitle');
  const stamp = updatedAt ? new Date(updatedAt) : new Date();
  push('Updated ' + stamp.toISOString().slice(0, 10) + (version ? ' · v' + version : ''), 'subtitle');
  items.push({ line: '', kind: 'gap' });
  for (const para of intro || []) { push(para, 'body'); items.push({ line: '', kind: 'gap' }); }
  for (const section of sections || []) {
    items.push({ line: section.heading || 'Section', kind: 'heading' });
    for (const para of section.paragraphs || []) { push(para, 'body'); items.push({ line: '', kind: 'gap' }); }
    let n = 0;
    for (const step of section.steps || []) { n += 1; push(n + '. ' + step, 'body'); }
    items.push({ line: '', kind: 'gap' });
  }

  const pages = [];
  let current = [];
  let y = PAGE_H - MARGIN;
  const heights = { title: 26, subtitle: 15, heading: 22, body: 13, gap: 8 };
  const flush = () => { pages.push(current); current = []; y = PAGE_H - MARGIN; };
  for (const item of items) {
    const h = heights[item.kind] || 13;
    if (y - h < MARGIN + 30) flush();
    current.push({ ...item, y });
    y -= h;
  }
  if (current.length || !pages.length) flush();

  const pageContents = pages.map((page) => {
    const content = [];
    content.push('0 ' + (PAGE_H - 26) + ' ' + PAGE_W + ' 6 re ' + GREEN + ' rg f 0 g');
    for (const item of page) {
      if (item.kind === 'gap') continue;
      if (item.kind === 'title') content.push('BT /F1 20 Tf ' + MARGIN + ' ' + item.y + ' Td 0.055 0.17 0.149 rg (' + pdfEscape(item.line) + ') Tj ET');
      else if (item.kind === 'subtitle') content.push('BT /F2 10 Tf ' + MARGIN + ' ' + item.y + ' Td 0.42 0.52 0.47 rg (' + pdfEscape(item.line) + ') Tj ET');
      else if (item.kind === 'heading') content.push('BT /F1 13 Tf ' + MARGIN + ' ' + item.y + ' Td ' + GREEN + ' rg (' + pdfEscape(item.line) + ') Tj ET');
      else content.push('BT /F2 10 Tf ' + MARGIN + ' ' + item.y + ' Td 0.055 0.17 0.149 rg (' + pdfEscape(item.line) + ') Tj ET');
    }
    return content.join('\n');
  });

  let nextId = 3;
  const fontId = nextId; nextId += 1;
  const pageIds = [];
  const contentIds = [];
  for (let i = 0; i < pages.length; i += 1) { pageIds.push(nextId); nextId += 1; contentIds.push(nextId); nextId += 1; }
  const objects = [];
  const kids = pageIds.map((id) => id + ' 0 R').join(' ');
  objects.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.push({ id: 2, body: '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>' });
  objects.push({ id: fontId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' });
  for (let i = 0; i < pages.length; i += 1) {
    const hasTitle = pages[i].some((it) => it.kind === 'title');
    const header = hasTitle ? '' : 'BT /F2 8 Tf ' + MARGIN + ' ' + (PAGE_H - MARGIN + 8) + ' Td 0.42 0.52 0.47 rg (' + pdfEscape((organisationName || 'Re-EL ECD') + ' - ' + (title || '')) + ') Tj ET\n';
    const foot = 'BT /F2 7.5 Tf ' + MARGIN + ' 20 Td 0.42 0.52 0.47 rg (' + pdfEscape(footer || ('Re-EL ECD · ' + (organisationName || ''))) + ') Tj ET\n'
      + 'BT /F2 7.5 Tf ' + (PAGE_W - MARGIN - 60) + ' 20 Td 0.42 0.52 0.47 rg (' + pdfEscape('Page ' + (i + 1) + ' of ' + pages.length) + ') Tj ET';
    const full = header + (pageContents[i] || '') + '\n' + foot;
    objects.push({
      id: pageIds[i],
      body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] '
        + '/Resources << /Font << /F1 ' + fontId + ' 0 R /F2 ' + fontId + ' 0 R >> >> '
        + '/Contents ' + contentIds[i] + ' 0 R >>'
    });
    const stream = Buffer.from(full, 'utf8');
    objects.push({ id: contentIds[i], body: '<< /Length ' + stream.length + ' >>\nstream\n' + full + '\nendstream' });
  }
  objects.sort((a, b) => a.id - b.id);
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  let offset = chunks[0].length;
  const offsets = new Map([[0, 0]]);
  for (const object of objects) {
    const head = Buffer.from(object.id + ' 0 obj\n', 'utf8');
    const body = Buffer.from(object.body, 'utf8');
    const tail = Buffer.from('\nendobj\n', 'utf8');
    offsets.set(object.id, offset);
    chunks.push(head, body, tail);
    offset += head.length + body.length + tail.length;
  }
  const xrefOffset = offset;
  const xrefLines = ['xref', '0 ' + (objects.length + 1), '0000000000 65535 f '];
  for (let i = 1; i <= objects.length; i += 1) xrefLines.push(String(offsets.get(i)).padStart(10, '0') + ' 00000 n ');
  const trailer = ['trailer', '<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>', 'startxref', String(xrefOffset), '%%EOF'];
  chunks.push(Buffer.from(xrefLines.join('\n') + '\n', 'utf8'));
  chunks.push(Buffer.from(trailer.join('\n'), 'utf8'));
  return Buffer.concat(chunks);
}

module.exports = { toCsv, toXlsx, toPdf, toDocumentPdf, formatCell };
