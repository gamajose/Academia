(function () {
  const token = localStorage.getItem('academiaToken') || '';
  const apiBase = localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const initials = (name) => String(name || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
  const formatDate = (value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  let previewUrl = '';
  let feedPosts = [];
  let activePostId = null;
  let postDetailModal = null;
  let postDeleteModal = null;
  let postDeleteResolver = null;
  let feedHasMore = true;
  let feedLoading = false;
  let feedObserver = null;
  const FEED_BATCH_SIZE = 5;

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    return data;
  }

  function setStatus(id, message, isError = false) {
    const status = byId(id);
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', isError);
  }

  function avatar(name, photo) {
    const host = document.createElement('span'); host.className = 'social-avatar';
    if (photo) { const image = document.createElement('img'); image.src = photo; image.alt = ''; image.loading = 'lazy'; host.appendChild(image); }
    else host.textContent = initials(name);
    return host;
  }

  function roleBadge(person) {
    const role = String(person.author_role || '');
    const profile = String(person.author_access_profile || '');
    const badge = document.createElement('span');
    if (role === 'staff' && profile === 'trainer') {
      badge.className = 'social-role-badge is-trainer'; badge.title = 'Personal trainer'; badge.setAttribute('aria-label', 'Personal trainer');
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10M2 10v4M22 10v4"/></svg>';
      return badge;
    }
    if (role === 'admin' || role === 'owner') {
      badge.className = 'social-role-badge is-verified'; badge.title = role === 'owner' ? 'Proprietário verificado' : 'Administrador verificado'; badge.setAttribute('aria-label', badge.title);
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="verified-shape" d="M12 1.8l2.4 2 3.1-.4 1.2 2.9 2.8 1.4-.5 3.1 1.5 2.7-2.2 2.2-.2 3.1-3.1.7-1.8 2.5-3-1-3 1-1.8-2.5-3.1-.7-.2-3.1-2.2-2.2 1.5-2.7-.5-3.1 2.8-1.4 1.2-2.9 3.1.4z"/><path class="verified-check" d="m7.2 12.2 3.1 3.1 6.6-7"/></svg>';
      return badge;
    }
    return null;
  }

  function appendAuthorName(host, person, gymSuffix = false) {
    const badge = roleBadge(person); const trainer = badge?.classList.contains('is-trainer');
    if (trainer) host.append(badge, document.createTextNode(' '));
    host.appendChild(document.createTextNode(`${person.author_name || 'Academia'}${gymSuffix && person.is_gym_post ? ' · Academia' : ''}`));
    if (badge && !trainer) host.append(document.createTextNode(' '), badge);
  }

  function renderMedia(post) {
    if (!post.media_url) return null;
    const host = document.createElement('div'); host.className = 'social-post-media';
    if (post.media_type === 'video' && window.AcademiaTrainingMedia && /(?:youtube\.com|youtu\.be)/i.test(post.media_url)) window.AcademiaTrainingMedia.appendVideoPreview(host, post.media_url);
    else if (post.media_type === 'image' || /\.(?:jpe?g|png|gif|webp)(?:[?#].*)?$/i.test(post.media_url)) { const image = document.createElement('img'); image.src = post.media_url; image.alt = 'Mídia da publicação'; image.loading = 'lazy'; host.appendChild(image); }
    else if (post.media_type === 'video' && /^\/uploads\/.*\.(?:mp4|webm|mov)(?:[?#].*)?$/i.test(post.media_url)) { const video = document.createElement('video'); video.src = post.media_url; video.controls = true; video.preload = 'metadata'; host.appendChild(video); }
    else { const link = document.createElement('a'); link.className = 'social-media-link'; link.href = post.media_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = post.media_type === 'video' ? 'Abrir vídeo ou Reels' : 'Abrir conteúdo compartilhado'; host.appendChild(link); }
    return host;
  }

  function makeImageOpenPost(media, post) {
    const image = media?.querySelector('img');
    if (!image) return;
    image.classList.add('social-post-image-open');
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', 'Abrir publicação e visualizar foto completa');
    const open = () => openPostDetail(post);
    image.addEventListener('click', open);
    image.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      open();
    });
  }

  function socialIconAction(type, label, count = null) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `social-icon-action is-${type}`; button.setAttribute('aria-label', label); button.title = label;
    const icons = {
      like: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/></svg>',
      comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.8-4.6A8.2 8.2 0 0 1 3 11.5a8.5 8.5 0 0 1 9-8.5 8.5 8.5 0 0 1 9 8.5z"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="social-instagram-dot" cx="17.4" cy="6.7" r="1"/></svg>'
    };
    button.innerHTML = icons[type] || '';
    if (count !== null) { const value = document.createElement('span'); value.textContent = String(count); button.appendChild(value); }
    return button;
  }

  async function shareInstagram(post) {
    const url = post.media_url || window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `Publicação de ${post.author_name}`, text: post.caption || 'BlueREC Academia', url });
      else { await navigator.clipboard?.writeText(url); window.open('https://www.instagram.com/', '_blank', 'noopener'); setStatus('admin-community-page-status', 'Link copiado. Cole-o na publicação do Instagram.'); }
    } catch (error) { if (error.name !== 'AbortError') setStatus('admin-community-page-status', 'Não foi possível compartilhar agora.', true); }
  }

  function renderComments(post, host) {
    const comments = document.createElement('div'); comments.className = 'social-comments';
    const form = document.createElement('form'); form.className = 'social-comment-form';
    form.innerHTML = '<div class="social-replying hidden"><span>Respondendo a <strong></strong></span><button type="button" aria-label="Cancelar resposta">×</button></div><div class="social-comment-composer"><input class="social-comment-input" type="text" maxlength="800" placeholder="Escreva um comentário..." aria-label="Comentário"><label class="social-comment-photo-button" title="Adicionar foto" aria-label="Adicionar foto"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8" cy="9" r="1.5"></circle><path d="m4 17 5-5 3 3 2-2 6 6"></path></svg><input class="social-comment-photo-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp"></label><button class="social-comment-submit" type="submit">Enviar</button></div><div class="social-comment-photo-preview hidden"><img alt="Prévia da foto"><button type="button" aria-label="Remover foto">×</button></div><small class="social-comment-error"></small>';
    const input = form.querySelector('.social-comment-input'); const fileInput = form.querySelector('.social-comment-photo-input'); const replyBar = form.querySelector('.social-replying'); const replyName = replyBar.querySelector('strong'); const preview = form.querySelector('.social-comment-photo-preview'); const previewImage = preview.querySelector('img'); const error = form.querySelector('.social-comment-error');
    let replyTarget = null; let commentPreviewUrl = '';
    const clearPhoto = () => { fileInput.value = ''; preview.classList.add('hidden'); previewImage.removeAttribute('src'); if (commentPreviewUrl) URL.revokeObjectURL(commentPreviewUrl); commentPreviewUrl = ''; };
    const setReply = (comment) => { replyTarget = comment; replyName.textContent = comment.author_name; replyBar.classList.remove('hidden'); input.placeholder = `Responder a ${comment.author_name}...`; input.focus(); };
    const clearReply = () => { replyTarget = null; replyBar.classList.add('hidden'); input.placeholder = 'Escreva um comentário...'; };
    replyBar.querySelector('button').addEventListener('click', clearReply); preview.querySelector('button').addEventListener('click', clearPhoto);
    fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (!file) return clearPhoto(); if (commentPreviewUrl) URL.revokeObjectURL(commentPreviewUrl); commentPreviewUrl = URL.createObjectURL(file); previewImage.src = commentPreviewUrl; preview.classList.remove('hidden'); });
    const likeComment = async (comment, button) => { try { button.disabled = true; await request('/api/student/admin-community/comments/like', { method: 'POST', body: JSON.stringify({ comment_id: comment.id }) }); await loadFeed(); } catch (likeError) { setStatus('admin-community-page-status', `Não foi possível curtir o comentário: ${likeError.message}`, true); } finally { button.disabled = false; } };
    const commentRow = (comment, isReply = false) => {
      const row = document.createElement('div'); row.className = `social-comment${isReply ? ' is-reply' : ''}`; row.appendChild(avatar(comment.author_name, comment.author_photo));
      const main = document.createElement('div'); main.className = 'social-comment-main'; const bubble = document.createElement('div'); bubble.className = 'social-comment-body';
      const author = document.createElement('button'); author.type = 'button'; author.className = 'social-comment-author'; appendAuthorName(author, comment); author.addEventListener('click', () => setReply(comment)); bubble.appendChild(author);
      if (comment.reply_to_name) { const mention = document.createElement('span'); mention.className = 'social-comment-mention'; mention.textContent = ` @${comment.reply_to_name}`; bubble.appendChild(mention); }
      if (comment.body) { const text = document.createElement('span'); text.textContent = ` ${comment.body}`; bubble.appendChild(text); }
      if (comment.photo_url) { const photo = document.createElement('img'); photo.className = 'social-comment-photo'; photo.src = comment.photo_url; photo.alt = `Foto enviada por ${comment.author_name}`; photo.loading = 'lazy'; bubble.appendChild(photo); }
      const actions = document.createElement('div'); actions.className = 'social-comment-actions'; const like = document.createElement('button'); like.type = 'button'; like.className = comment.viewer_liked ? 'is-liked' : ''; like.textContent = `${comment.viewer_liked ? '♥' : '♡'} Curtir${Number(comment.likes_count || 0) ? ` ${comment.likes_count}` : ''}`; like.addEventListener('click', () => likeComment(comment, like)); const reply = document.createElement('button'); reply.type = 'button'; reply.textContent = 'Responder'; reply.addEventListener('click', () => setReply(comment)); actions.append(like, reply); main.append(bubble, actions); row.appendChild(main);
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); setReply(comment); }); let touchStart = null; row.addEventListener('touchstart', (event) => { const touch = event.touches[0]; touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null; }, { passive: true }); row.addEventListener('touchend', (event) => { const touch = event.changedTouches[0]; if (touchStart && touch && Math.abs(touch.clientX - touchStart.x) >= 52 && Math.abs(touch.clientY - touchStart.y) < 42) setReply(comment); touchStart = null; }, { passive: true });
      return row;
    };
    const allComments = post.comments || []; const replies = new Map(); allComments.filter((comment) => comment.parent_comment_id).forEach((comment) => { const key = String(comment.parent_comment_id); if (!replies.has(key)) replies.set(key, []); replies.get(key).push(comment); });
    allComments.filter((comment) => !comment.parent_comment_id).forEach((comment) => { const thread = document.createElement('div'); thread.className = 'social-comment-thread'; thread.appendChild(commentRow(comment)); const children = replies.get(String(comment.id)) || []; if (children.length) { const nested = document.createElement('div'); nested.className = 'social-comment-replies'; children.forEach((reply) => nested.appendChild(commentRow(reply, true))); thread.appendChild(nested); } comments.appendChild(thread); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); const file = fileInput.files?.[0]; if (!input.value.trim() && !file) return; const button = form.querySelector('.social-comment-submit');
      try { button.disabled = true; error.textContent = ''; const photoUrl = file ? await uploadMedia(file, 'image') : null; await request('/api/student/admin-community/posts/comment', { method: 'POST', body: JSON.stringify({ post_id: post.id, body: input.value.trim(), photo_url: photoUrl, reply_to_comment_id: replyTarget?.id || null }) }); input.value = ''; clearPhoto(); clearReply(); await loadFeed(); }
      catch (requestError) { error.textContent = `Não foi possível comentar: ${requestError.message}`; }
      finally { button.disabled = false; }
    });
    host.append(comments, form);
  }

  function closePostDetail() {
    activePostId = null; postDetailModal?.classList.add('hidden');
    if (!document.querySelector('.modal:not(.hidden)')) document.body.classList.remove('modal-open');
  }

  function ensurePostDetailModal() {
    if (postDetailModal) return postDetailModal;
    postDetailModal = document.createElement('div'); postDetailModal.className = 'modal hidden social-post-detail-modal'; postDetailModal.setAttribute('role', 'dialog'); postDetailModal.setAttribute('aria-modal', 'true'); postDetailModal.setAttribute('aria-label', 'Publicação e comentários');
    postDetailModal.innerHTML = '<article class="modal-card social-post-detail-card"><div class="modal-header social-post-detail-header"><h3>Publicação</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><div class="social-post-detail-content"></div></article>';
    postDetailModal.querySelector('.modal-close').addEventListener('click', closePostDetail); postDetailModal.addEventListener('click', (event) => { if (event.target === postDetailModal) closePostDetail(); }); document.body.appendChild(postDetailModal); return postDetailModal;
  }

  function renderPostDetail() {
    if (!activePostId) return;
    const post = feedPosts.find((item) => String(item.id) === String(activePostId)); if (!post) return closePostDetail();
    const modal = ensurePostDetailModal(); const content = modal.querySelector('.social-post-detail-content'); content.replaceChildren(); const summary = document.createElement('section'); summary.className = 'social-post-detail-summary';
    const author = document.createElement('div'); author.className = 'social-author'; author.appendChild(avatar(post.author_name, post.author_photo)); const copy = document.createElement('span'); copy.className = 'social-author-copy'; const name = document.createElement('strong'); appendAuthorName(name, post); const date = document.createElement('small'); date.textContent = formatDate(post.created_at); copy.append(name, date); author.appendChild(copy); summary.appendChild(author);
    if (post.caption) { const caption = document.createElement('p'); caption.className = 'social-post-caption'; caption.textContent = post.caption; summary.appendChild(caption); }
    const media = renderMedia(post); if (media) summary.appendChild(media);
    const commentsTitle = document.createElement('h4'); commentsTitle.className = 'social-post-comments-title'; commentsTitle.textContent = 'Comentários'; content.append(summary, commentsTitle);
    if (!post.comments?.length) { const empty = document.createElement('p'); empty.className = 'social-comments-empty'; empty.textContent = 'Nenhum comentário ainda.'; content.appendChild(empty); }
    renderComments(post, content);
  }

  function openPostDetail(post) { activePostId = post.id; ensurePostDetailModal().classList.remove('hidden'); document.body.classList.add('modal-open'); renderPostDetail(); requestAnimationFrame(() => postDetailModal.querySelector('.social-comment-input')?.focus()); }

  function closePostDelete(confirmed = false) {
    if (!postDeleteModal || postDeleteModal.classList.contains('hidden')) return;
    postDeleteModal.classList.add('hidden');
    if (!document.querySelector('.modal:not(.hidden)')) document.body.classList.remove('modal-open');
    const resolve = postDeleteResolver;
    postDeleteResolver = null;
    resolve?.(confirmed);
  }

  function ensurePostDeleteModal() {
    if (postDeleteModal) return postDeleteModal;
    postDeleteModal = document.createElement('div');
    postDeleteModal.id = 'social-post-delete-modal';
    postDeleteModal.className = 'modal hidden social-post-delete-modal';
    postDeleteModal.setAttribute('role', 'dialog');
    postDeleteModal.setAttribute('aria-modal', 'true');
    postDeleteModal.setAttribute('aria-labelledby', 'social-post-delete-title');
    postDeleteModal.innerHTML = '<article class="modal-card social-post-delete-card"><div class="modal-header"><h3 id="social-post-delete-title">Excluir publicação?</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><p>Esta ação não pode ser desfeita.</p><div class="social-post-delete-actions"><button class="button secondary social-post-delete-cancel" type="button">Cancelar</button><button class="button social-post-delete-confirm" type="button">Excluir</button></div></article>';
    postDeleteModal.querySelector('.modal-close').addEventListener('click', () => closePostDelete(false));
    postDeleteModal.querySelector('.social-post-delete-cancel').addEventListener('click', () => closePostDelete(false));
    postDeleteModal.querySelector('.social-post-delete-confirm').addEventListener('click', () => closePostDelete(true));
    postDeleteModal.addEventListener('click', (event) => { if (event.target === postDeleteModal) closePostDelete(false); });
    document.body.appendChild(postDeleteModal);
    return postDeleteModal;
  }

  function confirmPostDelete() {
    const modal = ensurePostDeleteModal();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => modal.querySelector('.social-post-delete-confirm')?.focus());
    return new Promise((resolve) => { postDeleteResolver = resolve; });
  }

  function appendPostMenu(header, post) {
    const trailing = document.createElement('div'); trailing.className = 'social-post-header-actions';
    if (post.can_delete) {
      const wrap = document.createElement('div'); wrap.className = 'social-post-menu';
      const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'social-post-menu-trigger'; trigger.setAttribute('aria-label', 'Opções da publicação'); trigger.setAttribute('aria-expanded', 'false'); trigger.textContent = '⋮';
      const menu = document.createElement('div'); menu.className = 'social-post-menu-dropdown hidden';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Excluir publicação'; remove.addEventListener('click', () => deletePost(post.id, remove)); menu.appendChild(remove);
      trigger.addEventListener('click', (event) => { event.stopPropagation(); const opening = menu.classList.contains('hidden'); document.querySelectorAll('.social-post-menu-dropdown').forEach((item) => item.classList.add('hidden')); menu.classList.toggle('hidden', !opening); trigger.setAttribute('aria-expanded', String(opening)); });
      menu.addEventListener('click', (event) => event.stopPropagation()); wrap.append(trigger, menu); trailing.appendChild(wrap);
    }
    if (trailing.children.length) header.appendChild(trailing);
  }

  function renderPost(post) {
    const article = document.createElement('article'); article.className = 'social-post';
    const header = document.createElement('div'); header.className = 'social-post-header';
    const author = document.createElement('div'); author.className = 'social-author'; author.appendChild(avatar(post.author_name, post.author_photo));
    const copy = document.createElement('span'); copy.className = 'social-author-copy'; const name = document.createElement('strong'); appendAuthorName(name, post); const date = document.createElement('small'); date.textContent = formatDate(post.created_at); copy.append(name, date); author.appendChild(copy); header.appendChild(author); appendPostMenu(header, post); article.appendChild(header);
    if (post.caption) { const caption = document.createElement('p'); caption.className = 'social-post-caption'; caption.textContent = post.caption; article.appendChild(caption); }
    const media = renderMedia(post); if (media) { makeImageOpenPost(media, post); article.appendChild(media); }
    const actions = document.createElement('div'); actions.className = 'social-post-actions';
    const like = socialIconAction('like', 'Curtir publicação', post.likes_count || 0); like.classList.toggle('is-liked', Boolean(post.viewer_liked)); like.addEventListener('click', async () => { try { like.disabled = true; await request('/api/student/admin-community/posts/like', { method: 'POST', body: JSON.stringify({ post_id: post.id }) }); await loadFeed(); } catch (error) { setStatus('admin-community-page-status', `Não foi possível curtir: ${error.message}`, true); } finally { like.disabled = false; } });
    const comment = socialIconAction('comment', 'Abrir comentários', post.comments_count || 0); comment.addEventListener('click', () => openPostDetail(post));
    const instagram = socialIconAction('instagram', 'Compartilhar no Instagram'); instagram.classList.add('social-instagram-action'); instagram.addEventListener('click', async () => { await shareInstagram(post); instagram.blur(); });
    actions.append(like, comment, instagram); article.appendChild(actions); return article;
  }

  function renderFeed() {
    const host = byId('admin-community-feed');
    host.replaceChildren();
    feedObserver?.disconnect();
    if (!feedPosts.length) {
      closePostDetail();
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Ainda não há publicações. Compartilhe a primeira novidade com os alunos.'; host.appendChild(empty); return;
    }
    feedPosts.forEach((post) => host.appendChild(renderPost(post)));
    if (feedHasMore) {
      const sentinel = document.createElement('div'); sentinel.className = 'social-feed-loader'; sentinel.textContent = feedLoading ? 'Carregando publicações...' : 'Carregando mais...'; host.appendChild(sentinel);
      feedObserver ||= new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && feedHasMore && !feedLoading) void loadFeed({ append: true }); }, { rootMargin: '240px 0px' });
      feedObserver.observe(sentinel);
    }
  }

  async function loadFeed({ reset = false, append = false } = {}) {
    if (feedLoading) return;
    if (reset) { feedPosts = []; feedHasMore = true; }
    feedLoading = true;
    const offset = append ? feedPosts.length : 0;
    const limit = append ? FEED_BATCH_SIZE : Math.max(FEED_BATCH_SIZE, feedPosts.length);
    try {
      const data = await request(`/api/student/admin-community/feed?limit=${limit}&offset=${offset}`);
      const incoming = data.posts || [];
      feedPosts = append ? [...feedPosts, ...incoming.filter((post) => !feedPosts.some((current) => String(current.id) === String(post.id)))] : incoming;
      feedHasMore = Boolean(data.has_more);
      if (activePostId) renderPostDetail();
      setStatus('admin-community-page-status', '');
    } catch (error) {
      if (!feedPosts.length) { const host = byId('admin-community-feed'); host.replaceChildren(); const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = `Não foi possível carregar o feed: ${error.message}`; host.appendChild(empty); }
      setStatus('admin-community-page-status', `Não foi possível carregar mais publicações: ${error.message}`, true);
    } finally {
      feedLoading = false;
      renderFeed();
    }
  }


  function resetComposer() {
    byId('admin-community-form').reset();
    byId('admin-community-link-field').classList.add('hidden');
    byId('admin-community-upload-preview').classList.add('hidden');
    byId('admin-community-preview-image').removeAttribute('src');
    byId('admin-community-preview-video').removeAttribute('src');
    byId('admin-community-preview-video').load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    setStatus('admin-community-status', '');
  }

  function closeComposer() { byId('admin-social-composer-modal').classList.add('hidden'); resetComposer(); }

  function openComposer(mode = 'text') {
    byId('admin-social-composer-modal').classList.remove('hidden');
    if (mode === 'photo') byId('admin-community-photo-file').click();
    else if (mode === 'video') byId('admin-community-video-file').click();
    else if (mode === 'link') { byId('admin-community-link-field').classList.remove('hidden'); byId('admin-community-media-url').focus(); }
    else byId('admin-community-caption').focus();
  }

  function showPreview(file, type) {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    const image = byId('admin-community-preview-image'); const video = byId('admin-community-preview-video');
    image.hidden = type !== 'image'; video.hidden = type !== 'video'; byId('admin-community-preview-empty').hidden = true;
    if (type === 'image') image.src = previewUrl; else { video.src = previewUrl; video.load(); }
    byId('admin-community-upload-preview').classList.remove('hidden');
  }

  async function uploadMedia(file, mediaType) {
    if (mediaType === 'image' && window.CommunityMedia) file = await window.CommunityMedia.prepareImage(file);
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    const allowed = mediaType === 'video' ? videoTypes : imageTypes;
    if (!allowed.includes(file.type)) throw new Error(mediaType === 'video' ? 'Escolha MP4, WebM, OGG ou MOV.' : 'Escolha JPG, PNG, GIF ou WebP.');
    const maxBytes = mediaType === 'video' ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(mediaType === 'video' ? 'O vídeo não pode ultrapassar 50 MB.' : 'A imagem não pode ultrapassar 5 MB.');
    const form = new FormData(); form.append('file', file, file.name);
    const endpoint = mediaType === 'video' ? '/api/editor/videos' : '/api/editor/images';
    const response = await fetch(`${apiBase}${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a mídia.');
    return data.location || '';
  }

  async function publish(event) {
    event.preventDefault();
    const button = byId('admin-community-submit');
    const caption = byId('admin-community-caption').value.trim();
    const photo = byId('admin-community-photo-file').files?.[0];
    const video = byId('admin-community-video-file').files?.[0];
    const file = video || photo;
    const mediaType = video ? 'video' : photo ? 'image' : (/youtu(?:be|\.be)|instagram|\.mp4(?:$|[?#])/i.test(byId('admin-community-media-url').value) ? 'video' : /\.(?:jpe?g|png|gif|webp)(?:$|[?#])/i.test(byId('admin-community-media-url').value) ? 'image' : 'link');
    if (!caption && !file && !byId('admin-community-media-url').value.trim()) { setStatus('admin-community-status', 'Escreva uma mensagem ou adicione uma foto, vídeo ou link.', true); return; }
    try {
      button.disabled = true; setStatus('admin-community-status', file ? 'Enviando mídia...' : 'Publicando...');
      const mediaUrl = file ? await uploadMedia(file, mediaType) : byId('admin-community-media-url').value.trim();
      await request('/api/student/admin-community/posts', { method: 'POST', body: JSON.stringify({ caption, media_url: mediaUrl || null, media_type: mediaType }) });
      closeComposer(); setStatus('admin-community-page-status', 'Publicação criada.'); await loadFeed({ reset: true });
    } catch (error) { setStatus('admin-community-status', `Não foi possível publicar: ${error.message}`, true); }
    finally { button.disabled = false; }
  }

  async function deletePost(postId, button) {
    button.closest('.social-post-menu-dropdown')?.classList.add('hidden');
    if (!await confirmPostDelete()) return;
    try { button.disabled = true; await request('/api/student/admin-community/posts/delete', { method: 'POST', body: JSON.stringify({ post_id: postId }) }); await loadFeed(); }
    catch (error) { setStatus('admin-community-page-status', error.message === 'prazo_exclusao_expirado' ? 'O prazo de 30 minutos para excluir esta publicação terminou.' : `Não foi possível excluir: ${error.message}`, true); button.disabled = false; }
  }

  const name = localStorage.getItem('academiaUserName') || 'José';
  document.addEventListener('click', () => document.querySelectorAll('.social-post-menu-dropdown').forEach((menu) => menu.classList.add('hidden')));
  document.querySelectorAll('[data-admin-community-name]').forEach((element) => { element.textContent = name; });
  document.querySelectorAll('[data-admin-community-avatar]').forEach((element) => { element.textContent = initials(name); });
  byId('admin-social-composer-trigger').addEventListener('click', () => openComposer());
  byId('admin-social-entry-photo').addEventListener('click', () => openComposer('photo'));
  byId('admin-social-entry-video').addEventListener('click', () => openComposer('video'));
  byId('admin-social-entry-link').addEventListener('click', () => openComposer('link'));
  byId('admin-social-modal-photo').addEventListener('click', () => byId('admin-community-photo-file').click());
  byId('admin-social-modal-video').addEventListener('click', () => byId('admin-community-video-file').click());
  byId('admin-social-modal-link').addEventListener('click', () => { byId('admin-community-link-field').classList.remove('hidden'); byId('admin-community-media-url').focus(); });
  byId('admin-community-photo-file').addEventListener('change', (event) => showPreview(event.target.files?.[0], 'image'));
  byId('admin-community-video-file').addEventListener('change', (event) => showPreview(event.target.files?.[0], 'video'));
  byId('admin-social-composer-close').addEventListener('click', closeComposer);
  byId('admin-social-composer-cancel').addEventListener('click', closeComposer);
  byId('admin-social-composer-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeComposer(); });
  byId('admin-community-form').addEventListener('submit', publish);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (postDeleteModal && !postDeleteModal.classList.contains('hidden')) closePostDelete(false);
    else if (postDetailModal && !postDetailModal.classList.contains('hidden')) closePostDetail();
  });
  loadFeed({ reset: true });
}());
