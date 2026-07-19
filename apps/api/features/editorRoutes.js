const Busboy = require('busboy');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const allowedTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};
const videoTypes = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov'
};
const trainingMediaTypes = {
  ...videoTypes,
  'image/gif': 'gif'
};
const uploadRoot = path.resolve(process.env.EDITOR_UPLOAD_DIR || path.resolve(__dirname, '../../web/uploads'));

function signatureMatches(buffer, mime) {
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/gif') return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function videoSignatureMatches(buffer, mime) {
  if (mime === 'video/mp4' || mime === 'video/quicktime') return buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mime === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === 'video/ogg') return buffer.subarray(0, 4).toString('ascii') === 'OggS';
  return false;
}

function trainingMediaSignatureMatches(buffer, mime) {
  return mime === 'image/gif' ? signatureMatches(buffer, mime) : videoSignatureMatches(buffer, mime);
}

async function removeFile(filePath) {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
}

function handleMediaUpload(req, res, helpers, mediaType) {
  const { send } = helpers;
  const isVideo = mediaType === 'video';
  const isTrainingMedia = mediaType === 'training';
  const maxBytes = isVideo || isTrainingMedia ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  const types = isVideo ? videoTypes : (isTrainingMedia ? trainingMediaTypes : allowedTypes);
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength && contentLength > maxBytes + 1024 * 1024) return send(res, 413, { error: isVideo ? 'video_muito_grande' : 'imagem_muito_grande' });

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
        limits: { fileSize: maxBytes, files: 1, fields: 2 }
      });
    } catch (_) {
      return finish(400, { error: 'upload_invalido' });
    }

    parser.on('file', (fieldName, file, info) => {
      if (fieldName !== 'file' || fileName) {
        file.resume();
        return;
      }
      const extension = types[info.mimeType];
      if (!extension) {
        fileError = isVideo ? 'formato_de_video_invalido' : 'formato_de_imagem_invalido';
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
      file.once('limit', () => { fileError = isVideo ? 'video_muito_grande' : 'imagem_muito_grande'; });
      file.pipe(output);
    });
    parser.once('filesLimit', () => { fileError = 'apenas_uma_imagem_por_vez'; });
    parser.once('error', () => { fileError = fileError || 'upload_invalido'; });
    parser.once('finish', async () => {
      try {
        await writeDone;
        if (fileError) return finish(400, { error: fileError });
        if (!fileName || !filePath) return finish(400, { error: 'imagem_obrigatoria' });
        if (fileSize < 1 || fileSize > maxBytes) return finish(400, { error: isVideo ? 'video_muito_grande' : 'imagem_muito_grande' });
        const content = await fs.promises.readFile(filePath);
        const validSignature = isTrainingMedia ? trainingMediaSignatureMatches(content, fileMime) : (isVideo ? videoSignatureMatches(content, fileMime) : signatureMatches(content, fileMime));
        if (!validSignature) return finish(400, { error: isVideo ? 'arquivo_nao_e_video' : 'arquivo_nao_e_imagem' });
        return finish(201, { location: `/uploads/${fileName}` });
      } catch (_) {
        return finish(500, { error: 'falha_no_upload' });
      }
    });

    fs.promises.mkdir(uploadRoot, { recursive: true }).then(() => req.pipe(parser)).catch(() => finish(500, { error: 'pasta_de_upload_indisponivel' }));
  });
}

async function handleEditorRoutes(req, res, user, url, helpers) {
  if (req.method !== 'POST' || !['/api/editor/images', '/api/editor/videos', '/api/training/videos'].includes(url.pathname)) return false;
  const isTrainingVideo = url.pathname === '/api/training/videos';
  const isSocialVideo = url.pathname === '/api/editor/videos';
  const allowedRoles = isTrainingVideo ? ['owner', 'admin', 'staff'] : ['owner', 'admin', 'student'];
  const isImage = url.pathname === '/api/editor/images';
  if (!user || (!isImage && !allowedRoles.includes(user.role))) return helpers.send(res, 403, { error: 'sem_permissao' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) return helpers.send(res, 415, { error: 'multipart_obrigatorio' });
  return handleMediaUpload(req, res, helpers, isTrainingVideo ? 'training' : (isSocialVideo ? 'video' : 'image'));
}

module.exports = { handleEditorRoutes, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, signatureMatches, videoSignatureMatches, trainingMediaSignatureMatches };
