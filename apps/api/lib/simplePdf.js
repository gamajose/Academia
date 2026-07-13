function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function buildSimplePdf(title, lines = []) {
  const safeTitle = escapeText(title);
  const normalizedLines = lines.map(escapeText);
  const pageChunks = [];
  for (let index = 0; index < normalizedLines.length || index === 0; index += 38) {
    pageChunks.push(normalizedLines.slice(index, index + 38));
  }

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    ''
  ];
  const pageObjectNumbers = [];
  for (const chunk of pageChunks) {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    const streamParts = ['BT', '/F1 18 Tf', '50 790 Td', `(${safeTitle}) Tj`, '/F1 11 Tf'];
    for (const line of chunk) streamParts.push(`0 -18 Td (${line}) Tj`);
    streamParts.push('ET');
    const stream = streamParts.join('\n');
    pageObjectNumbers.push(pageObjectNumber);
    objects.push(`PAGE_${pageObjectNumber}`);
    objects.push(`${contentObjectNumber} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`);
  }

  const fontObjectNumber = objects.length + 1;
  objects.push(`${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>\nendobj\n`;
  for (const pageObjectNumber of pageObjectNumbers) {
    const contentObjectNumber = pageObjectNumber + 1;
    objects[pageObjectNumber - 1] = `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

module.exports = { buildSimplePdf };
