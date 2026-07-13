const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgres://localhost/academia_test';
const { validVideoSource, slugifyLevel } = require('../features/trainingRoutes');
const { normalizePermissions, slugifyProfile } = require('../features/accessProfileRoutes');
const { videoSignatureMatches, trainingMediaSignatureMatches, MAX_VIDEO_BYTES } = require('../features/editorRoutes');

test('aceita fontes de video http, https e uploads locais', () => {
  assert.equal(validVideoSource('https://cdn.example.com/treino.mp4'), true);
  assert.equal(validVideoSource('http://videos.example.com/a.webm'), true);
  assert.equal(validVideoSource('/uploads/exercicio-123.mp4'), true);
  assert.equal(validVideoSource(''), true);
});

test('rejeita fontes de video inseguras ou malformadas', () => {
  assert.equal(validVideoSource('javascript:alert(1)'), false);
  assert.equal(validVideoSource('ftp://example.com/treino.mp4'), false);
  assert.equal(validVideoSource('/uploads/../segredo.mp4'), false);
  assert.equal(validVideoSource('x'.repeat(1001)), false);
});

test('valida assinaturas dos formatos de video aceitos', () => {
  const mp4 = Buffer.alloc(16);
  mp4.write('ftyp', 4, 'ascii');
  assert.equal(videoSignatureMatches(mp4, 'video/mp4'), true);
  assert.equal(videoSignatureMatches(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm'), true);
  assert.equal(videoSignatureMatches(Buffer.from('OggS'), 'video/ogg'), true);
  assert.equal(videoSignatureMatches(Buffer.from('not-a-video'), 'video/mp4'), false);
  assert.equal(MAX_VIDEO_BYTES, 50 * 1024 * 1024);
});

test('valida GIF como demonstracao animada de exercicio', () => {
  assert.equal(trainingMediaSignatureMatches(Buffer.from('GIF89a'), 'image/gif'), true);
  assert.equal(trainingMediaSignatureMatches(Buffer.from('not-a-gif'), 'image/gif'), false);
  assert.equal(trainingMediaSignatureMatches(Buffer.from('OggS'), 'video/ogg'), true);
});

test('cria slug seguro para niveis personalizados', () => {
  assert.equal(slugifyLevel('Força e Hipertrofia'), 'forca-e-hipertrofia');
  assert.equal(slugifyLevel('  Nível 2  '), 'nivel-2');
  assert.equal(slugifyLevel('!!!'), '');
});

test('cria perfil configuravel com permissoes explicitas', () => {
  assert.equal(slugifyProfile('Operação de Acesso'), 'operacao-de-acesso');
  const permissions = normalizePermissions({ finance: true, training: false }, 'staff');
  assert.equal(permissions.finance, true);
  assert.equal(permissions.training, false);
  assert.equal(permissions.members, false);
});
