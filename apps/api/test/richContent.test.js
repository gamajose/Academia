const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRichHtml, sanitizeRichFields } = require('../lib/richContent');
const { signatureMatches } = require('../features/editorRoutes');

test('sanitiza tags perigosas e preserva recursos do editor', () => {
  const html = sanitizeRichHtml('<h2>Titulo</h2><p><strong>Texto</strong> <a href="https://example.com">link</a></p><table><tr><td>Celula</td></tr></table><script>alert(1)</script>');
  assert.match(html, /<h2>Titulo<\/h2>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /script|alert/);
});

test('rejeita links e imagens inseguros', () => {
  assert.throws(() => sanitizeRichHtml('<a href="javascript:alert(1)">x</a>'), /link_inseguro/);
  assert.throws(() => sanitizeRichHtml('<img src="data:image/png;base64,abc">'), /link_inseguro/);
});

test('aplica sanitizacao somente nos campos enviados', () => {
  const fields = sanitizeRichFields({ objective: '<b>Meta</b>' }, ['objective', 'notes']);
  assert.equal(fields.objective, '<b>Meta</b>');
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'notes'), false);
});

test('valida assinaturas dos formatos de imagem aceitos', () => {
  assert.equal(signatureMatches(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'), true);
  assert.equal(signatureMatches(Buffer.from('GIF89a'), 'image/gif'), true);
  assert.equal(signatureMatches(Buffer.from('RIFF1234WEBP'), 'image/webp'), true);
  assert.equal(signatureMatches(Buffer.from('not-an-image'), 'image/png'), false);
});
