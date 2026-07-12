const Busboy = require('busboy');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const allowedTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};
const uploadRoot = path.resolve(process.env.EDITOR_UPLOAD_DIR || path.resolve(__dirname, '../../web/uploads'));

function signatureMatches(buffer, mime) {
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/gif') return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

async function removeFile(filePath) {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
}

function handleImageUpload(req, res, helpers) {
  const { send } = helpers;
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength && contentLength > MAX_IMAGE_BYTES + 1024 * 1024) return send(res, 413, { error: 'imagem_muito_grande' });

  return new Promise((resolve) => {
    let settled = false;
    let filePath = null;
    let fileName = null;
    let fileMime = null;
    let fileSize = 0;
    let fileError = null;
    let writeDone = Promise.resolve();

    const finish = async (status, data) => {
      if (settled) return;
      settled = true;
      if (status !== 201) await removeFile(filePath);
      resolve(send(res, status, data));
    };

    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 }
      });
    } catch (_) {
      return finish(400, { error: 'upload_invalido' });
    }

    parser.on('file', (fieldName, file, info) => {
      if (fieldName !== 'file' || fileName) {
        file.resume();
        return;
      }
      const extension = allowedTypes[info.mimeType];
      if (!extension) {
        fileError = 'formato_de_imagem_invalido';
        file.resume();
        return;
      }

      fileMime = info.mimeType;
      fileName = `${crypto.randomUUID()}.${extension}`;
      filePath = path.join(uploadRoot, fileName);
      const output = fs.createWriteStream(filePath, { flags: 'wx' });
      writeDone = new Promise((resolveWrite, rejectWrite) => {
        output.once('finish', resolveWrite);
        output.once('error', rejectWrite);
        file.once('error', rejectWrite);
      });
      file.on('data', (chunk) => { fileSize += chunk.length; });
      file.once('limit', () => { fileError = 'imagem_muito_grande'; });
      file.pipe(output);
    });
    parser.once('filesLimit', () => { fileError = 'apenas_uma_imagem_por_vez'; });
    parser.once('error', () => { fileError = fileError || 'upload_invalido'; });
    parser.once('finish', async () => {
      try {
        await writeDone;
        if (fileError) return finish(400, { error: fileError });
        if (!fileName || !filePath) return finish(400, { error: 'imagem_obrigatoria' });
        if (fileSize < 1 || fileSize > MAX_IMAGE_BYTES) return finish(400, { error: 'imagem_muito_grande' });
        const content = await fs.promises.readFile(filePath);
        if (!signatureMatches(content, fileMime)) return finish(400, { error: 'arquivo_nao_e_imagem' });
        return finish(201, { location: `/uploads/${fileName}` });
      } catch (_) {
        return finish(500, { error: 'falha_no_upload' });
      }
    });

    fs.promises.mkdir(uploadRoot, { recursive: true }).then(() => req.pipe(parser)).catch(() => finish(500, { error: 'pasta_de_upload_indisponivel' }));
  });
}

async function handleEditorRoutes(req, res, user, url, helpers) {
  if (req.method !== 'POST' || url.pathname !== '/api/editor/images') return false;
  if (!user || !['owner', 'admin'].includes(user.role)) return helpers.send(res, 403, { error: 'sem_permissao' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) return helpers.send(res, 415, { error: 'multipart_obrigatorio' });
  return handleImageUpload(req, res, helpers);
}

module.exports = { handleEditorRoutes, MAX_IMAGE_BYTES, signatureMatches };
