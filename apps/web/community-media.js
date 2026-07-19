(function () {
  const maxOutputBytes = 5 * 1024 * 1024;
  const maxInputBytes = 20 * 1024 * 1024;
  const maxDimension = 1600;

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await window.createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (_) { try { return await window.createImageBitmap(file); } catch (_) {} }
    }
    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('imagem_invalida')); image.src = source; });
      return image;
    } finally { URL.revokeObjectURL(source); }
  }

  async function prepareImage(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG, GIF ou WebP.');
    if (file.type === 'image/gif') {
      if (file.size > maxOutputBytes) throw new Error('GIFs animados não podem ultrapassar 5 MB.');
      return file;
    }
    if (file.size > maxInputBytes) throw new Error('A imagem original não pode ultrapassar 20 MB.');
    const image = await decodeImage(file);
    const sourceWidth = Number(image.width || image.naturalWidth);
    const sourceHeight = Number(image.height || image.naturalHeight);
    if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 100000000) { image.close?.(); throw new Error('A resolução desta imagem é muito grande.'); }
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height); image.close?.();
    let blob = await canvasBlob(canvas, 'image/webp', 0.82);
    let outputType = 'image/webp';
    if (blob && blob.type !== 'image/webp') { blob = await canvasBlob(canvas, 'image/jpeg', 0.84); outputType = 'image/jpeg'; }
    if (!blob) throw new Error('Não foi possível otimizar a imagem.');
    if (blob.size > maxOutputBytes) throw new Error('A imagem otimizada ainda ultrapassa 5 MB.');
    if (file.size <= maxOutputBytes && blob.size >= file.size) return file;
    const baseName = String(file.name || 'foto').replace(/\.[^.]+$/, '').slice(0, 80) || 'foto';
    return new File([blob], `${baseName}.${outputType === 'image/webp' ? 'webp' : 'jpg'}`, { type: outputType, lastModified: Date.now() });
  }

  window.CommunityMedia = { prepareImage, maxDimension, maxOutputBytes };
}());
