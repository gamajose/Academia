(function () {
  const DIRECT_VIDEO_EXTENSIONS = /\.(?:mp4|webm|ogv|ogg|mov)(?:[?#].*)?$/i;
  const DIRECT_GIF_EXTENSIONS = /\.gif(?:[?#].*)?$/i;

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

  function isDirectGifUrl(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (text.startsWith('/uploads/')) return DIRECT_GIF_EXTENSIONS.test(text);
    try {
      const url = new URL(text, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) && DIRECT_GIF_EXTENSIONS.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function youtubeId(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || '';
      if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || '';
    } catch (_) { return ''; }
    return '';
  }

  function buildYoutubeEmbed(url) {
    const iframe = document.createElement('iframe');
    iframe.className = 'exercise-youtube-preview';
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId(url))}`;
    iframe.title = 'Demonstração do exercício';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    return iframe;
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

  function buildGif(url) {
    const image = document.createElement('img');
    image.className = 'exercise-gif-preview';
    image.alt = 'Demonstração animada do exercício';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = url;
    return image;
  }

  function appendMediaPreview(container, url) {
    if (!container || !url) return;
    const text = String(url).trim();
    container.replaceChildren();
    if (isDirectGifUrl(text)) {
      const image = buildGif(text);
      const fallback = document.createElement('a');
      fallback.className = 'mini-button secondary';
      fallback.href = text;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Abrir demonstração';
      fallback.hidden = true;
      image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
      container.append(image, fallback);
      return;
    }
    if (isDirectVideoUrl(text)) {
      const video = buildVideo(text);
      const fallback = document.createElement('a');
      fallback.className = 'mini-button secondary';
      fallback.href = text;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Abrir demonstração';
      fallback.hidden = true;
      video.addEventListener('error', () => { video.hidden = true; fallback.hidden = false; });
      container.append(video, fallback);
      return;
    }
    if (youtubeId(text)) {
      container.appendChild(buildYoutubeEmbed(text));
      return;
    }

    const link = document.createElement('a');
    link.className = 'mini-button secondary';
    link.href = text;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Abrir demonstração na internet';
    container.appendChild(link);
  }

  window.AcademiaTrainingMedia = { isDirectVideoUrl, isDirectGifUrl, youtubeId, appendMediaPreview, appendVideoPreview: appendMediaPreview, buildVideo, buildGif, buildYoutubeEmbed };
})();
