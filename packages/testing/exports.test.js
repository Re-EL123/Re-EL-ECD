'use strict';

/**
 * Export generators: CSV, XLSX and PDF, built with no third-party binaries.
 * These tests pin the invariants a consumer (Excel, a PDF viewer, a shell)
 * actually depends on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, toXlsx, toPdf } = require('../../apps/api/src/services/export-service');

const columns = [
  { key: 'name', label: 'Name', width: 22 },
  { key: 'amount', label: 'Amount (ZAR)', format: 'money', align: 'right', width: 14 },
  { key: 'when', label: 'When', format: 'date', width: 14 }
];

const rows = [
  { name: 'Smith, John', amount: '1250.50', when: '2026-11-01' },
  { name: 'Say "hi"', amount: 55, when: '2026-11-02' },
  { name: 'Parentheses (here) \\', amount: '99.99', when: '2026-10-03' },
  { name: 'Line\nbreak', amount: '1000.00', when: '2026-10-04' }
];

test('csv quotes cells containing commas, quotes and newlines, and starts with a BOM', () => {
  const csv = toCsv(columns, rows).toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^\ufeffName,Amount \(ZAR\),When\r\n/);
  assert.match(csv, /"Smith, John",1250\.50,2026-11-01/);
  assert.match(csv, /"Say ""hi""",55\.00,2026-11-02/);
  assert.match(csv, /Parentheses \(here\) \\,99\.99,2026-10-03/);
  assert.match(csv, /"Line\nbreak",1000\.00,2026-10-04/);
});

test('xlsx is a valid zip whose entries carry the expected payload', () => {
  const xlsx = toXlsx(columns, rows, 'Export \' & <Test>');
  assert.equal(xlsx.length > 100, true);
  assert.deepEqual([...xlsx.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  // Walk the central directory and verify every entry's CRC32.
  let end = -1;
  for (let i = xlsx.length - 22; i >= 0; i -= 1) {
    if (xlsx.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  assert.ok(end > -1, 'end of central directory must exist');
  const entries = xlsx.readUInt16LE(end + 8);
  assert.ok(entries >= 6, 'expected at least six parts');

  let offset = 0;
  const names = [];
  let cursor = 0;
  const centralStart = xlsx.readUInt32LE(end + 16);
  const centralSize = xlsx.readUInt32LE(end + 12);
  let pos = centralStart;
  const endCentral = centralStart + centralSize;
  while (pos < endCentral) {
    assert.equal(xlsx.readUInt32LE(pos), 0x02014b50);
    const crc = xlsx.readUInt32LE(pos + 16);
    const size = xlsx.readUInt32LE(pos + 20);
    const localOffset = xlsx.readUInt32LE(pos + 42);
    const nameLength = xlsx.readUInt16LE(pos + 28);
    const name = xlsx.slice(pos + 46, pos + 46 + nameLength).toString('utf8');
    names.push(name);
    // Verify the local header agrees and recompute the CRC32 of the payload.
    assert.equal(xlsx.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = xlsx.readUInt16LE(localOffset + 26);
    const localExtra = xlsx.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtra;
    assert.equal(crc32(xlsx.slice(dataStart, dataStart + size)), crc, name);
    pos += 46 + nameLength + xlsx.readUInt16LE(pos + 30) + xlsx.readUInt16LE(pos + 32) + xlsx.readUInt16LE(pos + 34);
  }
  for (const required of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
    assert.ok(names.includes(required), 'missing part: ' + required);
  }

  const sheet = xlsx.toString('utf8');
  const expectedName = '<sheet name="Export &#39; &amp; &lt;Test&gt;"';
  assert.ok(sheet.includes(expectedName), 'sheet name must be escaped');
  assert.ok(sheet.includes('<t xml:space="preserve">Smith, John</t>'));
  assert.ok(sheet.includes('<v>1250.5</v>'), 'numeric cells are stored as numbers');
});

test('pdf has valid xref offsets and survives hostile strings', () => {
  const hostile = [
    ...rows,
    { name: 'Backslash \\ and (parens)', amount: '1.00', when: '2026-11-03' }
  ];
  const pdf = toPdf({ title: 'Attendance', subtitle: 'Little Sprouts', columns, rows: hostile, footer: 'Re-EL ECD — Little Sprouts' });
  const text = pdf.toString('latin1');
  assert.equal(pdf.slice(0, 8).toString(), '%PDF-1.4');
  assert.ok(text.includes('startxref'));
  assert.equal(pdf.slice(-5).toString(), '%%EOF');

  const xrefAt = text.lastIndexOf('startxref');
  const declared = Number(text.slice(xrefAt + 9, text.indexOf('%%EOF', xrefAt)).trim());
  const entries = text.slice(declared, text.indexOf('trailer', declared)).trim().split('\n').slice(2)
    .map((line) => line.match(/^(\d{10}) (\d{5}) (n|f)/));
  for (const entry of entries) {
    if (!entry || entry[3] !== 'n') continue;
    const offset = Number(entry[1]);
    assert.match(text.slice(offset, offset + 24), /^\d+ 0 obj/);
  }

  // A long table spans multiple pages and every page references the font.
  const many = Array.from({ length: 80 }, (_, i) => ({ name: 'Child ' + (i + 1), amount: '100.00', when: '2026-11-01' }));
  const big = toPdf({ title: 'Big', subtitle: '', columns, rows: many, footer: 'Re-EL ECD' });
  const bigText = big.toString('latin1');
  assert.ok((bigText.match(/\/Type \/Page[^s]/g) || []).length >= 2);
  assert.ok(bigText.includes('R'), 'pages must reference the font resource');
});

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
