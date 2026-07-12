(function () {
  const DIRECT_VIDEO_EXTENSIONS = /\.(?:mp4|webm|ogv|ogg|mov)(?:[?#].*)?$/i;

  function isDirectVideoUrl(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (text.startsWith('/uploads/')) return DIRECT_VIDEO_EXTENSIONS.test(text);
    try {
      const url = new URL(text, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) && DIRECT_VIDEO_EXTENSIONS.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function buildVideo(url) {
    const video = document.createElement('video');
    video.className = 'exercise-video-preview';
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.controls = true;
    video.setAttribute('aria-label', 'Demonstração do exercício');
    video.src = url;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), { once: true });
    return video;
  }

  function appendVideoPreview(container, url) {
    if (!container || !url) return;
    const text = String(url).trim();
    container.replaceChildren();
    if (isDirectVideoUrl(text)) {
      const video = buildVideo(text);
      const fallback = document.createElement('a');
      fallback.className = 'mini-button secondary';
      fallback.href = text;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Abrir vídeo';
      fallback.hidden = true;
      video.addEventListener('error', () => { video.hidden = true; fallback.hidden = false; });
      container.append(video, fallback);
      return;
    }

    const link = document.createElement('a');
    link.className = 'mini-button secondary';
    link.href = text;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Abrir vídeo na internet';
    container.appendChild(link);
  }

  window.AcademiaTrainingMedia = { isDirectVideoUrl, appendVideoPreview, buildVideo };
})();
