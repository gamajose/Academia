(function () {
  const p = (id) => document.getElementById(id);
  let currentProfile = null;
  let posts = [];
  let previewUrl = '';
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedVideoFile = null;
  let feedRefreshTimer = null;
  let activePostId = null;
  let postDetailModal = null;
  let postDeleteModal = null;
  let postDeleteResolver = null;
  let feedHasMore = true;
  let feedLoading = false;
  let feedObserver = null;
  const FEED_BATCH_SIZE = 5;

  function esc(value) { return StudentPortal.escapeHtml(value ?? ''); }
  function setStatus(id, message, error = false) { const element = p(id); if (!element) return; element.textContent = message || ''; element.classList.toggle('error', error); }
  function initials(name) { return String(name || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A'; }
  function formatDate(value) { return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function avatar(name, photo, className = 'social-avatar') { const wrap = document.createElement('span'); wrap.className = className; if (photo) { const image = document.createElement('img'); image.src = photo; image.alt = ''; image.loading = 'lazy'; wrap.appendChild(image); } else wrap.textContent = initials(name); return wrap; }

  function roleBadge(person) {
    const role = String(person.author_role || '');
    const profile = String(person.author_access_profile || '');
    const badge = document.createElement('span');
    if (role === 'staff' && profile === 'trainer') {
      badge.className = 'social-role-badge is-trainer';
      badge.title = 'Personal trainer';
      badge.setAttribute('aria-label', 'Personal trainer');
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10M2 10v4M22 10v4"/></svg>';
      return badge;
    }
    if (role === 'admin' || role === 'owner') {
      badge.className = 'social-role-badge is-verified';
      badge.title = role === 'owner' ? 'Proprietário verificado' : 'Administrador verificado';
      badge.setAttribute('aria-label', badge.title);
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="verified-shape" d="M12 1.8l2.4 2 3.1-.4 1.2 2.9 2.8 1.4-.5 3.1 1.5 2.7-2.2 2.2-.2 3.1-3.1.7-1.8 2.5-3-1-3 1-1.8-2.5-3.1-.7-.2-3.1-2.2-2.2 1.5-2.7-.5-3.1 2.8-1.4 1.2-2.9 3.1.4z"/><path class="verified-check" d="m7.2 12.2 3.1 3.1 6.6-7"/></svg>';
      return badge;
    }
    return null;
  }

  function appendAuthorName(host, person, gymSuffix = false) {
    const badge = roleBadge(person);
    const trainer = badge?.classList.contains('is-trainer');
    if (trainer) host.append(badge, document.createTextNode(' '));
    host.appendChild(document.createTextNode(`${person.author_name || 'Academia'}${gymSuffix && person.is_gym_post ? ' · Academia' : ''}`));
    if (badge && !trainer) host.append(document.createTextNode(' '), badge);
  }

  function renderMedia(container, post) {
    if (!post.media_url) return;
    if (post.media_type === 'video' && window.AcademiaTrainingMedia && /(?:youtube\.com|youtu\.be)/i.test(post.media_url)) { window.AcademiaTrainingMedia.appendVideoPreview(container, post.media_url); return; }
    if (post.media_type === 'image' || /\.(?:jpe?g|png|gif|webp)(?:[?#].*)?$/i.test(post.media_url)) { const image = document.createElement('img'); image.src = post.media_url; image.alt = 'Mídia da publicação'; image.loading = 'lazy'; container.appendChild(image); return; }
    if (post.media_type === 'video' && /^\/uploads\/.*\.(?:mp4|webm|mov)(?:[?#].*)?$/i.test(post.media_url)) { const video = document.createElement('video'); video.src = post.media_url; video.controls = true; video.preload = 'metadata'; container.appendChild(video); return; }
    const link = document.createElement('a'); link.className = 'social-media-link'; link.href = post.media_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = post.media_type === 'video' ? 'Abrir vídeo ou Reels' : 'Abrir conteúdo compartilhado'; container.appendChild(link);
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

  function renderComments(post, host) {
    const comments = document.createElement('div'); comments.className = 'social-comments';
    const form = document.createElement('form'); form.className = 'social-comment-form';
    form.innerHTML = '<div class="social-replying hidden"><span>Respondendo a <strong></strong></span><button type="button" aria-label="Cancelar resposta">×</button></div><div class="social-comment-composer"><input class="social-comment-input" type="text" maxlength="800" placeholder="Escreva um comentário..." aria-label="Comentário"><label class="social-comment-photo-button" title="Adicionar foto" aria-label="Adicionar foto"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8" cy="9" r="1.5"></circle><path d="m4 17 5-5 3 3 2-2 6 6"></path></svg><input class="social-comment-photo-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp"></label><button class="social-comment-submit" type="submit">Enviar</button></div><div class="social-comment-photo-preview hidden"><img alt="Prévia da foto"><button type="button" aria-label="Remover foto">×</button></div><small class="social-comment-error"></small>';
    const input = form.querySelector('.social-comment-input'); const fileInput = form.querySelector('.social-comment-photo-input'); const replyBar = form.querySelector('.social-replying'); const replyName = replyBar.querySelector('strong'); const preview = form.querySelector('.social-comment-photo-preview'); const previewImage = preview.querySelector('img'); const errorMessage = form.querySelector('.social-comment-error');
    let replyTarget = null; let commentPreviewUrl = '';
    const clearPhoto = () => { fileInput.value = ''; preview.classList.add('hidden'); previewImage.removeAttribute('src'); if (commentPreviewUrl) URL.revokeObjectURL(commentPreviewUrl); commentPreviewUrl = ''; };
    const setReply = (comment) => { replyTarget = comment; replyName.textContent = comment.author_name; replyBar.classList.remove('hidden'); input.placeholder = `Responder a ${comment.author_name}...`; input.focus(); };
    const clearReply = () => { replyTarget = null; replyBar.classList.add('hidden'); input.placeholder = 'Escreva um comentário...'; };
    replyBar.querySelector('button').addEventListener('click', clearReply); preview.querySelector('button').addEventListener('click', clearPhoto);
    fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (!file) return clearPhoto(); if (commentPreviewUrl) URL.revokeObjectURL(commentPreviewUrl); commentPreviewUrl = URL.createObjectURL(file); previewImage.src = commentPreviewUrl; preview.classList.remove('hidden'); });
    const likeComment = async (comment, button) => { try { button.disabled = true; await StudentPortal.api('/api/student/social/comments/like', { method: 'POST', body: JSON.stringify({ comment_id: comment.id }) }); await loadFeed(); } catch (error) { setStatus('social-page-status', `Não foi possível curtir o comentário: ${error.message}`, true); } finally { button.disabled = false; } };
    const commentRow = (comment, isReply = false) => {
      const row = document.createElement('div'); row.className = `social-comment${isReply ? ' is-reply' : ''}`; row.append(avatar(comment.author_name, comment.author_photo));
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
    form.addEventListener('submit', async (event) => { event.preventDefault(); const file = fileInput.files?.[0]; if (!input.value.trim() && !file) return; const button = form.querySelector('.social-comment-submit'); button.disabled = true; errorMessage.textContent = ''; try { const photoUrl = file ? await uploadMedia(file, 'image') : null; await StudentPortal.api('/api/student/social/posts/comment', { method: 'POST', body: JSON.stringify({ post_id: post.id, body: input.value.trim(), photo_url: photoUrl, reply_to_comment_id: replyTarget?.id || null }) }); input.value = ''; clearPhoto(); clearReply(); await loadFeed(); } catch (error) { errorMessage.textContent = `Não foi possível comentar: ${error.message}`; setStatus('social-page-status', errorMessage.textContent, true); } finally { button.disabled = false; } });
    host.append(comments, form);
  }

  function closePostDetail() {
    activePostId = null;
    postDetailModal?.classList.add('hidden');
    if (!document.querySelector('.modal:not(.hidden)')) document.body.classList.remove('modal-open');
  }

  function ensurePostDetailModal() {
    if (postDetailModal) return postDetailModal;
    postDetailModal = document.createElement('div'); postDetailModal.className = 'modal hidden social-post-detail-modal'; postDetailModal.setAttribute('role', 'dialog'); postDetailModal.setAttribute('aria-modal', 'true'); postDetailModal.setAttribute('aria-label', 'Publicação e comentários');
    postDetailModal.innerHTML = '<article class="modal-card social-post-detail-card"><div class="modal-header social-post-detail-header"><h3>Publicação</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><div class="social-post-detail-content"></div></article>';
    postDetailModal.querySelector('.modal-close').addEventListener('click', closePostDetail);
    postDetailModal.addEventListener('click', (event) => { if (event.target === postDetailModal) closePostDetail(); });
    document.body.appendChild(postDetailModal); return postDetailModal;
  }

  function renderPostDetail() {
    if (!activePostId) return;
    const post = posts.find((item) => String(item.id) === String(activePostId));
    if (!post) return closePostDetail();
    const modal = ensurePostDetailModal(); const content = modal.querySelector('.social-post-detail-content'); content.replaceChildren();
    const summary = document.createElement('section'); summary.className = 'social-post-detail-summary';
    const author = document.createElement('div'); author.className = 'social-author'; author.append(avatar(post.author_name, post.author_photo)); const copy = document.createElement('span'); copy.className = 'social-author-copy'; const name = document.createElement('strong'); appendAuthorName(name, post); const date = document.createElement('small'); date.textContent = formatDate(post.created_at); copy.append(name, date); author.appendChild(copy); summary.appendChild(author);
    if (post.caption) { const caption = document.createElement('p'); caption.className = 'social-post-caption'; caption.textContent = post.caption; summary.appendChild(caption); }
    if (post.media_url) { const media = document.createElement('div'); media.className = 'social-post-media'; renderMedia(media, post); summary.appendChild(media); }
    const commentsTitle = document.createElement('h4'); commentsTitle.className = 'social-post-comments-title'; commentsTitle.textContent = 'Comentários'; content.append(summary, commentsTitle);
    if (!post.comments?.length) { const empty = document.createElement('p'); empty.className = 'social-comments-empty'; empty.textContent = 'Nenhum comentário ainda.'; content.appendChild(empty); }
    renderComments(post, content);
  }

  function openPostDetail(post) {
    activePostId = post.id; ensurePostDetailModal().classList.remove('hidden'); document.body.classList.add('modal-open'); renderPostDetail(); requestAnimationFrame(() => postDetailModal.querySelector('.social-comment-input')?.focus());
  }

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

  async function deletePost(postId, button) {
    button.closest('.social-post-menu-dropdown')?.classList.add('hidden');
    if (!await confirmPostDelete()) return;
    try { button.disabled = true; await StudentPortal.api('/api/student/social/posts/delete', { method: 'POST', body: JSON.stringify({ post_id: postId }) }); await loadFeed(); }
    catch (error) { setStatus('social-page-status', error.message === 'prazo_exclusao_expirado' ? 'O prazo de 30 minutos para excluir esta publicação terminou.' : `Não foi possível excluir: ${error.message}`, true); button.disabled = false; }
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
    const author = document.createElement('button'); author.className = 'social-author'; author.type = 'button'; author.append(avatar(post.author_name, post.author_photo)); const copy = document.createElement('span'); copy.className = 'social-author-copy'; const name = document.createElement('strong'); appendAuthorName(name, post); const date = document.createElement('small'); date.textContent = formatDate(post.created_at); copy.append(name, date); author.appendChild(copy); if (post.member_id) author.addEventListener('click', () => openProfile(post.member_id)); else { author.disabled = true; author.setAttribute('aria-label', 'Publicação da academia'); } header.appendChild(author); appendPostMenu(header, post); article.appendChild(header);
    if (post.caption) { const caption = document.createElement('p'); caption.className = 'social-post-caption'; caption.textContent = post.caption; article.appendChild(caption); }
    if (post.media_url) { const media = document.createElement('div'); media.className = 'social-post-media'; renderMedia(media, post); makeImageOpenPost(media, post); article.appendChild(media); }
    const actions = document.createElement('div'); actions.className = 'social-post-actions';
    const like = socialIconAction('like', 'Curtir publicação', post.likes_count || 0); like.classList.toggle('is-liked', Boolean(post.viewer_liked)); like.addEventListener('click', async () => { like.disabled = true; try { await StudentPortal.api('/api/student/social/posts/like', { method: 'POST', body: JSON.stringify({ post_id: post.id }) }); await loadFeed(); } catch (error) { setStatus('social-page-status', `Não foi possível curtir: ${error.message}`, true); } finally { like.disabled = false; } });
    const comment = socialIconAction('comment', 'Abrir comentários', post.comments_count || 0); comment.addEventListener('click', () => openPostDetail(post));
    const instagram = socialIconAction('instagram', 'Compartilhar no Instagram'); instagram.classList.add('social-instagram-action'); instagram.addEventListener('click', async () => { await shareInstagram(post); instagram.blur(); });
    actions.append(like, comment, instagram); article.appendChild(actions);
    return article;
  }

  function renderFeed() {
    const list = p('social-feed-list'); list.replaceChildren(); feedObserver?.disconnect();
    if (!posts.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Ainda não há publicações. Seja a primeira pessoa a compartilhar algo.'; list.appendChild(empty); return; }
    posts.forEach((post) => list.appendChild(renderPost(post)));
    if (feedHasMore) {
      const sentinel = document.createElement('div'); sentinel.className = 'social-feed-loader'; sentinel.textContent = feedLoading ? 'Carregando publicações...' : 'Carregando mais...'; list.appendChild(sentinel);
      feedObserver ||= new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && feedHasMore && !feedLoading) void loadFeed({ append: true }); }, { rootMargin: '240px 0px' });
      feedObserver.observe(sentinel);
    }
  }

  async function loadFeed({ reset = false, append = false } = {}) {
    if (feedLoading) return;
    if (reset) { posts = []; feedHasMore = true; }
    feedLoading = true;
    const offset = append ? posts.length : 0;
    const limit = append ? FEED_BATCH_SIZE : Math.max(FEED_BATCH_SIZE, posts.length);
    try {
      const result = await StudentPortal.api(`/api/student/social/feed?limit=${limit}&offset=${offset}`);
      const incoming = result.posts || [];
      posts = append ? [...posts, ...incoming.filter((post) => !posts.some((current) => String(current.id) === String(post.id)))] : incoming;
      feedHasMore = Boolean(result.has_more);
      if (activePostId) renderPostDetail();
      setStatus('social-page-status', '');
    } catch (error) { setStatus('social-page-status', `Não foi possível carregar o feed: ${error.message}`, true); }
    finally { feedLoading = false; renderFeed(); }
  }


  function renderMyProfile(profile, stats) { currentProfile = profile; p('social-my-name').textContent = profile.name || 'Aluno'; p('social-my-bio').textContent = profile.bio || 'Complete seu perfil'; p('social-my-posts').textContent = profile.posts_count || 0; p('social-my-followers').textContent = profile.followers_count || 0; p('social-my-following').textContent = profile.following_count || 0; const avatarHost = p('social-my-avatar'); avatarHost.replaceChildren(); if (profile.profile_photo_url) { const image = document.createElement('img'); image.src = profile.profile_photo_url; image.alt = ''; image.loading = 'lazy'; avatarHost.appendChild(image); } else avatarHost.textContent = initials(profile.name); p('social-my-profile-card').dataset.scheduled = stats?.scheduled_training_count || 0; }

  function personRow(person) { const row = document.createElement('div'); row.className = 'social-person'; row.append(avatar(person.name, person.profile_photo_url)); const info = document.createElement('div'); info.className = 'social-person-info'; info.innerHTML = `<strong>${esc(person.name)}</strong><small>${esc(person.bio || (person.is_private ? 'Perfil privado' : 'Aluno BlueREC'))}</small>`; row.appendChild(info); const view = document.createElement('button'); view.type = 'button'; view.className = 'mini-button secondary'; view.textContent = 'Ver'; view.addEventListener('click', () => openProfile(person.id)); row.appendChild(view); return row; }
  async function loadPeople() { try { const result = await StudentPortal.api(`/api/student/social/people?q=${encodeURIComponent(p('social-people-search').value.trim())}`); const list = p('social-people-list'); list.replaceChildren(); if (!result.people?.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Nenhum aluno encontrado.'; list.appendChild(empty); return; } result.people.forEach((person) => list.appendChild(personRow(person))); } catch (error) { setStatus('social-page-status', `Não foi possível carregar pessoas: ${error.message}`, true); } }
  async function loadFollowRequests() { try { const result = await StudentPortal.api('/api/student/social/follow-requests'); const requests = result.requests || []; p('social-request-count').textContent = requests.length; p('social-requests-panel').classList.toggle('hidden', !requests.length); const list = p('social-request-list'); list.replaceChildren(); requests.forEach((request) => { const row = document.createElement('div'); row.className = 'social-person'; row.append(avatar(request.name, request.profile_photo_url)); const info = document.createElement('div'); info.className = 'social-person-info'; info.innerHTML = `<strong>${esc(request.name)}</strong><small>Quer seguir você</small>`; row.appendChild(info); const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'mini-button'; accept.textContent = 'Aceitar'; accept.addEventListener('click', () => respondToFollowRequest(request.id, 'accepted')); row.appendChild(accept); const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'mini-button secondary'; reject.textContent = 'Recusar'; reject.addEventListener('click', () => respondToFollowRequest(request.id, 'rejected')); row.appendChild(reject); list.appendChild(row); }); } catch (error) { setStatus('social-page-status', `Não foi possível carregar solicitações: ${error.message}`, true); } }
  async function respondToFollowRequest(requestId, decision) { try { await StudentPortal.api('/api/student/social/follow-request', { method: 'POST', body: JSON.stringify({ request_id: requestId, decision }) }); await loadFollowRequests(); await loadPeople(); } catch (error) { setStatus('social-page-status', `Não foi possível atualizar a solicitação: ${error.message}`, true); } }

  function profileView(profile, stats, posts = [], training = null) {
    const wrap = document.createElement('div'); wrap.className = 'social-profile-view';
    const header = document.createElement('div'); header.className = 'social-profile-view-header'; header.append(avatar(profile.name, profile.profile_photo_url));
    const copy = document.createElement('div'); copy.className = 'social-profile-view-identity'; copy.innerHTML = `<strong>${esc(profile.name)}</strong><small>${profile.is_private ? 'Perfil privado' : 'Perfil público'}</small>`; header.appendChild(copy);
    const actions = document.createElement('div'); actions.className = 'social-profile-view-actions';
    const isMine = String(profile.id) === String(currentProfile?.id);
    if (isMine) { const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button secondary'; edit.textContent = 'Editar perfil'; edit.addEventListener('click', openEditor); actions.appendChild(edit); }
    else { const follow = document.createElement('button'); follow.type = 'button'; follow.className = 'button'; follow.textContent = profile.viewer_follow_status === 'pending' ? 'Solicitação enviada' : profile.viewer_follows ? 'Deixar de seguir' : 'Seguir'; follow.addEventListener('click', async () => { follow.disabled = true; try { await StudentPortal.api('/api/student/social/follow', { method: 'POST', body: JSON.stringify({ member_id: profile.id }) }); await openProfile(profile.id); await loadPeople(); await loadFeed(); } catch (error) { setStatus('social-page-status', `Não foi possível atualizar o seguimento: ${error.message}`, true); } finally { follow.disabled = false; } }); actions.appendChild(follow); }
    header.appendChild(actions); wrap.appendChild(header);
    const statsEl = document.createElement('div'); statsEl.className = 'social-profile-view-stats'; statsEl.innerHTML = `<span><strong>${esc(profile.posts_count || 0)}</strong><small>posts</small></span><span><strong>${esc(profile.followers_count || 0)}</strong><small>seguidores</small></span><span><strong>${esc(profile.following_count || 0)}</strong><small>a seguir</small></span>`; wrap.appendChild(statsEl);
    if (profile.restricted) { const restricted = document.createElement('div'); restricted.className = 'empty-state'; restricted.textContent = 'Este perfil é privado. Siga para acompanhar as publicações.'; wrap.appendChild(restricted); return wrap; }
    if (profile.bio) { const bio = document.createElement('p'); bio.className = 'social-profile-view-bio'; bio.textContent = profile.bio; wrap.appendChild(bio); }
    if (profile.website_url) { const link = document.createElement('a'); link.href = profile.website_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = profile.website_url; wrap.appendChild(link); }
    const metrics = document.createElement('section'); metrics.className = 'social-profile-view-section'; metrics.innerHTML = '<h4>Estatísticas</h4>'; const metricsGrid = document.createElement('div'); metricsGrid.className = 'social-profile-metrics'; [['Treinos concluídos', stats?.completed_training_count || 0], ['Exercícios planejados', stats?.planned_exercise_count || 0], ['Check-ins', stats?.checkins_count || 0], ['Treinos agendados', stats?.scheduled_training_count || 0]].forEach(([label, value]) => { const item = document.createElement('div'); item.innerHTML = `<strong>${esc(value)}</strong><small>${label}</small>`; metricsGrid.appendChild(item); }); metrics.appendChild(metricsGrid); wrap.appendChild(metrics);
    const workout = document.createElement('section'); workout.className = 'social-profile-view-section'; workout.innerHTML = '<h4>Ficha atual</h4>'; if (training?.plan) { const plan = document.createElement('div'); plan.className = 'social-profile-workout'; plan.innerHTML = `<strong>${esc(training.plan.name)}</strong><small>${esc(training.plan.goal || 'Objetivo não informado')} · ${esc(training.plan.level || 'Nível não informado')}</small><span>${esc(training.exercises?.length || 0)} exercícios planejados</span>`; workout.appendChild(plan); } else { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma ficha atual cadastrada.'; workout.appendChild(empty); } wrap.appendChild(workout);
    const publicationSection = document.createElement('section'); publicationSection.className = 'social-profile-view-section'; publicationSection.innerHTML = '<h4>Publicações</h4>'; const grid = document.createElement('div'); grid.className = 'social-profile-view-posts'; posts.slice(0, 9).forEach((post) => { const tile = document.createElement('div'); tile.className = 'social-profile-post-tile'; if (post.media_url && post.media_type === 'image') { const image = document.createElement('img'); image.src = post.media_url; image.alt = 'Publicação'; image.loading = 'lazy'; tile.appendChild(image); } else if (post.media_url && post.media_type === 'video' && post.media_url.startsWith('/uploads/')) { const video = document.createElement('video'); video.src = post.media_url; video.muted = true; video.controls = true; video.preload = 'metadata'; tile.appendChild(video); } else { tile.textContent = post.caption || 'Publicação'; } grid.appendChild(tile); }); if (grid.children.length) publicationSection.appendChild(grid); else { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma publicação ainda.'; publicationSection.appendChild(empty); } wrap.appendChild(publicationSection); return wrap;
  }

  function openProfile(memberId) { window.location.href = `./student-social-profile.html?member_id=${encodeURIComponent(memberId)}`; }

  async function shareInstagram(post) { const url = post.media_url || window.location.href; try { if (navigator.share) await navigator.share({ title: `Publicação de ${post.author_name}`, text: post.caption || 'BlueREC Academia', url }); else { await navigator.clipboard?.writeText(url); window.open('https://www.instagram.com/', '_blank', 'noopener'); setStatus('social-page-status', 'Link copiado. Cole-o na publicação do Instagram.'); } } catch (error) { if (error.name !== 'AbortError') setStatus('social-page-status', 'Não foi possível compartilhar agora.', true); } }

  async function uploadMedia(file, mediaType) { if (mediaType === 'image' && window.CommunityMedia) file = await window.CommunityMedia.prepareImage(file); const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']; const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']; const allowed = mediaType === 'video' ? videoTypes : imageTypes; if (!allowed.includes(file.type)) throw new Error(mediaType === 'video' ? 'Escolha MP4, WebM, OGG ou MOV.' : 'Escolha JPG, PNG, GIF ou WebP.'); const maxBytes = mediaType === 'video' ? 50 * 1024 * 1024 : 5 * 1024 * 1024; if (file.size > maxBytes) throw new Error(mediaType === 'video' ? 'O vídeo não pode ultrapassar 50 MB.' : 'A imagem não pode ultrapassar 5 MB.'); const form = new FormData(); form.append('file', file, file.name); const endpoint = mediaType === 'video' ? '/api/editor/videos' : '/api/editor/images'; const response = await fetch(`${StudentPortal.apiBase}${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${StudentPortal.getToken()}` }, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a mídia.'); return data.location || ''; }

  function stopCameraStream() { if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop()); cameraStream = null; p('social-camera-preview').srcObject = null; }
  function closeCamera() { if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.ondataavailable = null; mediaRecorder.onstop = null; mediaRecorder.stop(); } mediaRecorder = null; recordedChunks = []; stopCameraStream(); p('social-camera-modal').classList.add('hidden'); p('social-camera-preview').classList.remove('hidden'); p('social-camera-empty').classList.remove('hidden'); p('social-camera-start').classList.remove('hidden'); p('social-camera-start').disabled = true; p('social-camera-stop').classList.add('hidden'); p('social-camera-use').classList.add('hidden'); p('social-camera-file-button').classList.remove('hidden'); }
  function supportedRecorderMime() { return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) => window.MediaRecorder?.isTypeSupported?.(type)); }
  async function openCameraRecorder() { p('social-composer-modal').classList.remove('hidden'); p('social-camera-modal').classList.remove('hidden'); p('social-camera-start').disabled = true; p('social-camera-stop').classList.add('hidden'); p('social-camera-use').classList.add('hidden'); p('social-camera-file-button').classList.remove('hidden'); p('social-camera-empty').classList.remove('hidden'); setStatus('social-camera-status', 'Solicitando acesso à câmera...'); stopCameraStream(); if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setStatus('social-camera-status', 'A câmera precisa de HTTPS ou localhost neste navegador. Você pode usar um vídeo salvo.', true); return; } try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: true }); const preview = p('social-camera-preview'); preview.srcObject = cameraStream; preview.classList.remove('hidden'); p('social-camera-empty').classList.add('hidden'); p('social-camera-start').disabled = !supportedRecorderMime(); setStatus('social-camera-status', supportedRecorderMime() ? 'Câmera pronta.' : 'Este navegador não permite gravar vídeo neste formato.', !supportedRecorderMime()); } catch (error) { stopCameraStream(); setStatus('social-camera-status', 'Não foi possível acessar a câmera. Verifique a permissão do navegador ou use um vídeo salvo.', true); } }
  function startCameraRecording() { const mimeType = supportedRecorderMime(); if (!cameraStream || !mimeType) return; recordedChunks = []; recordedVideoFile = null; mediaRecorder = new MediaRecorder(cameraStream, { mimeType }); mediaRecorder.ondataavailable = (event) => { if (event.data.size) recordedChunks.push(event.data); }; mediaRecorder.onstop = () => { const blob = new Blob(recordedChunks, { type: mimeType }); const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'; recordedVideoFile = new File([blob], `bluerec-${Date.now()}.${extension}`, { type: blob.type }); p('social-camera-start').classList.add('hidden'); p('social-camera-stop').classList.add('hidden'); p('social-camera-use').classList.remove('hidden'); setStatus('social-camera-status', 'Gravação pronta. Confira e use este vídeo.'); }; mediaRecorder.start(); p('social-camera-start').classList.add('hidden'); p('social-camera-stop').classList.remove('hidden'); setStatus('social-camera-status', 'Gravando...'); }
  function stopCameraRecording() { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop()); }
  function useRecordedVideo() { if (!recordedVideoFile) return; handleFilePreview(recordedVideoFile, 'video'); closeCamera(); p('social-composer-modal').classList.remove('hidden'); }
  function resetComposer() { closeCamera(); p('social-post-form').reset(); p('social-post-file').value = ''; p('social-post-video-file').value = ''; p('social-post-url').value = ''; p('social-post-url-visible').value = ''; p('social-link-field').classList.add('hidden'); p('social-upload-preview').classList.add('hidden'); p('social-upload-preview-image').hidden = false; p('social-upload-preview-video').hidden = false; p('social-upload-preview-empty').hidden = false; p('social-upload-preview-image').removeAttribute('src'); p('social-upload-preview-video').removeAttribute('src'); p('social-upload-preview-video').load(); recordedVideoFile = null; setStatus('social-post-status', ''); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  function openComposer(mode = 'text') { p('social-composer-modal').classList.remove('hidden'); if (mode === 'photo') { p('social-post-video-file').value = ''; p('social-post-is-video').checked = false; p('social-post-file').click(); } if (mode === 'video') { p('social-post-file').value = ''; p('social-post-is-video').checked = true; openCameraRecorder(); } if (mode === 'link') { p('social-post-is-video').checked = true; p('social-link-field').classList.remove('hidden'); p('social-post-url-visible').focus(); } if (mode === 'text') p('social-post-caption').focus(); }
  function closeComposer() { resetComposer(); p('social-composer-modal').classList.add('hidden'); }
  function syncLinkField() { p('social-post-url').value = p('social-post-url-visible').value.trim(); }

  async function publish(event) { event.preventDefault(); const button = p('social-post-submit'); const photoFile = p('social-post-file').files?.[0]; const videoFile = recordedVideoFile || p('social-post-video-file').files?.[0]; const file = videoFile || photoFile; const fileType = videoFile ? 'video' : photoFile ? 'image' : (p('social-post-is-video').checked ? 'video' : 'image'); try { button.disabled = true; syncLinkField(); setStatus('social-post-status', file ? 'Enviando mídia...' : 'Publicando...'); const mediaUrl = file ? await uploadMedia(file, fileType) : p('social-post-url').value.trim(); await StudentPortal.api('/api/student/social/posts', { method: 'POST', body: JSON.stringify({ caption: p('social-post-caption').value.trim(), media_url: mediaUrl, media_type: file ? fileType : (mediaUrl ? 'video' : 'image') }) }); closeComposer(); setStatus('social-page-status', 'Publicação criada.'); await loadFeed({ reset: true }); } catch (error) { setStatus('social-post-status', `Não foi possível publicar: ${error.message}`, true); } finally { button.disabled = false; } }

  async function openEditor() { try { const result = await StudentPortal.api('/api/student/social/profile'); const profile = result.profile; p('social-profile-name').value = profile.name || ''; p('social-profile-bio').value = profile.bio || ''; p('social-profile-link').value = profile.website_url || ''; p('social-profile-photo-url').value = profile.profile_photo_url || ''; p('social-profile-private').checked = Boolean(profile.is_private); p('social-profile-weight').value = profile.weight_unit || 'kg'; p('social-profile-distance').value = profile.distance_unit || 'km'; p('social-profile-theme').value = profile.theme || 'light'; p('social-profile-language').value = profile.language || 'pt-BR'; p('social-profile-editor-modal').classList.remove('hidden'); } catch (error) { setStatus('social-page-status', `Não foi possível carregar seu perfil: ${error.message}`, true); } }
  async function saveProfile(event) { event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); try { button.disabled = true; let photo = p('social-profile-photo-url').value.trim(); const file = p('social-profile-photo-file').files?.[0]; if (file) photo = await uploadMedia(file, 'image'); const result = await StudentPortal.api('/api/student/social/profile', { method: 'POST', body: JSON.stringify({ name: p('social-profile-name').value.trim(), bio: p('social-profile-bio').value.trim(), website_url: p('social-profile-link').value.trim(), profile_photo_url: photo, is_private: p('social-profile-private').checked, weight_unit: p('social-profile-weight').value, distance_unit: p('social-profile-distance').value, theme: p('social-profile-theme').value, language: p('social-profile-language').value }) }); p('social-profile-editor-modal').classList.add('hidden'); localStorage.setItem('studentName', result.profile.name); const me = await StudentPortal.api('/api/student/social/profile'); renderMyProfile(me.profile, me.stats); document.querySelectorAll('[data-student-name]').forEach((element) => { element.textContent = result.profile.name; }); } catch (error) { setStatus('social-profile-status', `Não foi possível salvar: ${error.message}`, true); } finally { button.disabled = false; } }

  function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  async function exportData() {
    const button = p('social-export-data');
    try {
      button.disabled = true;
      const [account, social, progress, logs, checkins] = await Promise.all([
        StudentPortal.api('/api/student/profile'),
        StudentPortal.api('/api/student/social/profile'),
        StudentPortal.api('/api/student/progress'),
        StudentPortal.api('/api/student/training/logs'),
        StudentPortal.api('/api/student/checkins?limit=200')
      ]);
      const rows = [
        ['conta', '', account.name, account.email, account.phone],
        ...(social.posts || []).map((post) => ['publicacao', post.created_at, social.profile.name, post.caption || '', post.media_url || '']),
        ...(progress.goals || []).map((goal) => ['meta', goal.target_date, goal.type || '', goal.target_value || '', goal.status || '']),
        ...(progress.assessments || []).map((assessment) => ['avaliacao', assessment.assessment_date, '', assessment.weight_kg || '', assessment.notes || '']),
        ...(logs.data || []).map((log) => ['treino', log.completed_at, log.plan_name || '', log.status || '', log.feedback || '']),
        ...(checkins.data || []).map((checkin) => ['checkin', checkin.checked_at, '', checkin.source || '', checkin.access_status || ''])
      ];
      const csv = ['tipo,data,nome,valor,detalhes', ...rows.map((row) => row.map(csvCell).join(','))].join('\n') + '\n';
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `bluerec-dados-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('social-profile-status', 'Dados exportados em CSV.');
    } catch (error) { setStatus('social-profile-status', `Não foi possível exportar seus dados: ${error.message}`, true); } finally { button.disabled = false; }
  }

  function closeModal(id) { p(id).classList.add('hidden'); }
  async function load() { try { await StudentPortal.init(); const me = await StudentPortal.api('/api/student/social/profile'); renderMyProfile(me.profile, me.stats); await Promise.all([loadFeed({ reset: true }), loadPeople(), loadFollowRequests()]); if (!feedRefreshTimer) feedRefreshTimer = window.setInterval(loadFeed, 120000); } catch (error) { setStatus('social-page-status', `Erro: ${error.message}`, true); } }

  p('social-post-form').addEventListener('submit', publish); p('social-view-profile').addEventListener('click', () => currentProfile?.id && openProfile(currentProfile.id)); p('social-my-avatar').addEventListener('click', () => currentProfile?.id && openProfile(currentProfile.id)); p('social-my-name').addEventListener('click', () => currentProfile?.id && openProfile(currentProfile.id)); p('social-people-search').addEventListener('input', loadPeople); p('social-profile-form').addEventListener('submit', saveProfile); p('social-composer-trigger').addEventListener('click', () => openComposer()); p('social-entry-photo').addEventListener('click', () => openComposer('photo')); p('social-entry-video').addEventListener('click', () => openComposer('video')); p('social-entry-link').addEventListener('click', () => openComposer('link')); p('social-modal-photo').addEventListener('click', () => openComposer('photo')); p('social-modal-video').addEventListener('click', () => openComposer('video')); p('social-modal-link').addEventListener('click', () => openComposer('link')); p('social-composer-close').addEventListener('click', closeComposer); p('social-composer-cancel').addEventListener('click', closeComposer); p('social-post-url-visible').addEventListener('input', syncLinkField); p('social-profile-close').addEventListener('click', () => closeModal('social-profile-modal')); p('social-profile-editor-close').addEventListener('click', () => closeModal('social-profile-editor-modal')); p('social-profile-cancel').addEventListener('click', () => closeModal('social-profile-editor-modal')); [p('social-profile-modal'), p('social-profile-editor-modal'), p('social-composer-modal')].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.id === 'social-composer-modal' ? closeComposer() : modal.classList.add('hidden'); })); const handleFilePreview = (file, mediaType) => { if (!file) return; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); p('social-upload-preview-image').hidden = mediaType === 'video'; p('social-upload-preview-video').hidden = mediaType !== 'video'; if (mediaType === 'video') { p('social-upload-preview-video').src = previewUrl; p('social-upload-preview-video').load(); } else p('social-upload-preview-image').src = previewUrl; p('social-upload-preview-empty').hidden = true; p('social-upload-preview').classList.remove('hidden'); }; p('social-post-file').addEventListener('change', (event) => handleFilePreview(event.target.files?.[0], 'image')); p('social-post-video-file').addEventListener('change', (event) => handleFilePreview(event.target.files?.[0], 'video'));
  const peopleSearchToggle = p('social-people-search-toggle');
  const peopleSearchWrap = p('social-people-search-wrap');
  peopleSearchToggle?.addEventListener('click', () => {
    const isOpen = peopleSearchWrap.classList.toggle('hidden') === false;
    peopleSearchToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) p('social-people-search')?.focus();
    else {
      p('social-people-search').value = '';
      loadPeople();
    }
  });
  p('social-export-data')?.addEventListener('click', exportData);
  document.addEventListener('click', () => document.querySelectorAll('.social-post-menu-dropdown').forEach((menu) => menu.classList.add('hidden')));
  p('social-camera-close').addEventListener('click', closeCamera); p('social-camera-cancel').addEventListener('click', closeCamera); p('social-camera-start').addEventListener('click', startCameraRecording); p('social-camera-stop').addEventListener('click', stopCameraRecording); p('social-camera-use').addEventListener('click', useRecordedVideo); p('social-camera-file-button').addEventListener('click', () => p('social-camera-file').click()); p('social-camera-file').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (!file) return; recordedVideoFile = file; handleFilePreview(file, 'video'); closeCamera(); p('social-composer-modal').classList.remove('hidden'); }); p('social-camera-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeCamera(); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (postDeleteModal && !postDeleteModal.classList.contains('hidden')) {
      closePostDelete(false);
      return;
    }
    if (postDetailModal && !postDetailModal.classList.contains('hidden')) closePostDetail();
    if (!p('social-camera-modal').classList.contains('hidden')) closeCamera();
    if (!p('social-composer-modal').classList.contains('hidden')) closeComposer();
    document.querySelectorAll('.modal:not(.hidden)').forEach((modal) => {
      if (!['social-composer-modal', 'social-camera-modal', 'social-post-delete-modal'].includes(modal.id)) modal.classList.add('hidden');
    });
  });
  load();
}());
