(function () {
  const MAX_CONTENT_BYTES = 300000;
  const editorIds = new Map();
  const scopes = new Map();
  const dirtyIds = new Set();
  const readyIds = new Set();
  const baselines = new Map();
  const draftTimers = new Map();
  const pendingValues = new Map();
  const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'a', 'hr', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'];
  const ALLOWED_ATTR = ['href', 'target', 'rel', 'title', 'src', 'alt', 'width', 'height', 'style', 'class', 'colspan', 'rowspan', 'scope'];

  function apiBase() {
    const host = window.location.hostname || 'localhost';
    return localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  }

  function token() { return localStorage.getItem('academiaToken') || ''; }

  function sanitizeContent(value) {
    const raw = String(value || '');
    if (!window.DOMPurify) return raw;
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/?[^:]*$)/i
    }).trim();
  }

  function normalizeEmpty(value) {
    const html = String(value || '').trim();
    return /^<(p|div)><br><\/(p|div)>$/.test(html) ? '' : html;
  }

  function textLength(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';
    return (wrapper.textContent || '').replace(/\s+/g, ' ').trim().length;
  }

  function contentError(html, required = false) {
    const value = String(html || '');
    if (new Blob([value]).size > MAX_CONTENT_BYTES) return 'O conteúdo excede o limite de 300 KB.';
    if (/\b(?:href|src)\s*=\s*["']\s*(?:javascript:|vbscript:|data:)/i.test(value)) return 'O conteúdo contém um link ou imagem inseguro.';
    if (required && textLength(value) === 0) return 'Preencha o conteúdo antes de salvar.';
    return '';
  }

  function draftKey(id) { return `academia-rich-draft:${scopes.get(id) || window.location.pathname}:${id}`; }
  function metaFor(id) { return editorIds.get(id)?.richMeta || null; }

  function setStatus(id, message, tone = '') {
    const meta = metaFor(id);
    if (!meta) return;
    meta.status.textContent = message;
    meta.status.className = `rich-editor-status ${tone}`.trim();
  }

  function updateMeta(id, html) {
    const meta = metaFor(id);
    if (!meta) return;
    const bytes = new Blob([html || '']).size;
    const text = (() => { const node = document.createElement('div'); node.innerHTML = html || ''; return (node.textContent || '').replace(/\s+/g, ' ').trim(); })();
    meta.count.textContent = `${text ? text.split(' ').length : 0} palavras · ${text.length} caracteres · ${bytes.toLocaleString('pt-BR')} bytes`;
  }

  function saveDraft(id) {
    const html = getValue(id);
    if (!html) { localStorage.removeItem(draftKey(id)); return; }
    try { localStorage.setItem(draftKey(id), JSON.stringify({ html, savedAt: new Date().toISOString() })); setStatus(id, 'Rascunho salvo automaticamente.'); } catch (_) { setStatus(id, 'Não foi possível salvar o rascunho local.', 'error'); }
  }

  function markDirty(id) {
    if (!readyIds.has(id)) return;
    const html = getValue(id);
    const baseline = baselines.get(id);
    if (baseline !== undefined && html === baseline) {
      dirtyIds.delete(id); clearTimeout(draftTimers.get(id)); localStorage.removeItem(draftKey(id)); updateMeta(id, html); setStatus(id, 'Conteúdo salvo.'); return;
    }
    dirtyIds.add(id); const error = contentError(html); updateMeta(id, html); setStatus(id, error || 'Alterações não salvas.', error ? 'error' : 'dirty');
    clearTimeout(draftTimers.get(id)); draftTimers.set(id, setTimeout(() => saveDraft(id), 900));
  }

  function registerMeta(id, container) {
    const meta = document.createElement('div');
    meta.className = 'rich-editor-meta';
    meta.innerHTML = '<span class="rich-editor-status">Carregando editor...</span><span class="rich-editor-count"></span>';
    container.parentNode.insertBefore(meta, container.nextSibling);
    return { status: meta.querySelector('.rich-editor-status'), count: meta.querySelector('.rich-editor-count'), root: meta };
  }

  function uploadImage(file) {
    return new Promise((resolve, reject) => {
      const data = new FormData(); data.append('file', file, file.name || 'imagem');
      const xhr = new XMLHttpRequest(); xhr.open('POST', `${apiBase()}/api/editor/images`); xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
      xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText || '{}'); } catch (_) {} if (xhr.status >= 200 && xhr.status < 300 && body.location) resolve(body.location); else reject(new Error(body.error || 'Não foi possível enviar a imagem.')); };
      xhr.onerror = () => reject(new Error('Falha de conexão ao enviar a imagem.'));
      xhr.send(data);
    });
  }

  function toolbarOptions() {
    return [
      [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ align: [] }], [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      ['blockquote', 'link', 'image', 'clean', 'undo', 'redo']
    ];
  }

  function createEditor(textarea) {
    const id = textarea.id;
    const surface = document.createElement('div');
    surface.className = 'rich-editor-quill';
    surface.setAttribute('aria-label', textarea.getAttribute('aria-label') || textarea.dataset.placeholder || 'Editor de texto');
    textarea.hidden = true;
    textarea.parentNode.insertBefore(surface, textarea);
    const quill = new window.Quill(surface, {
      theme: 'snow',
      placeholder: textarea.dataset.placeholder || '',
      modules: { toolbar: toolbarOptions(), history: { delay: 500, maxStack: 100, userOnly: true } }
    });
    const toolbar = quill.getModule('toolbar');
    toolbar.addHandler('undo', () => quill.history.undo());
    toolbar.addHandler('redo', () => quill.history.redo());
    toolbar.addHandler('image', () => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/gif,image/webp';
      input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setStatus(id, 'A imagem ultrapassa o limite de 5 MB.', 'error'); return; }
        try { setStatus(id, 'Enviando imagem...'); const location = await uploadImage(file); const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 }; quill.insertEmbed(range.index, 'image', location, 'user'); quill.setSelection(range.index + 1, 0, 'silent'); } catch (error) { setStatus(id, error.message, 'error'); }
      });
      input.click();
    });
    const initial = pendingValues.get(id) ?? textarea.value ?? '';
    if (initial) quill.clipboard.dangerouslyPasteHTML(sanitizeContent(initial), 'silent');
    const entry = { quill, richMeta: registerMeta(id, surface), uploadImages: async () => {} };
    editorIds.set(id, entry); readyIds.add(id); baselines.set(id, getValue(id)); updateMeta(id, getValue(id)); setStatus(id, 'Editor pronto.');
    quill.on('text-change', (_delta, _old, source) => { textarea.value = getValue(id); if (source === 'user' || source === 'api') markDirty(id); });
    pendingValues.delete(id);
    return entry;
  }

  async function initAll() {
    if (!window.Quill) throw new Error('Editor visual indisponível.');
    document.querySelectorAll('textarea.rich-editor').forEach((textarea) => { if (!editorIds.has(textarea.id)) createEditor(textarea); });
  }

  function getRawValue(id) { return editorIds.get(id)?.quill.root.innerHTML || document.getElementById(id)?.value || ''; }
  function getValue(id) { return normalizeEmpty(sanitizeContent(getRawValue(id))); }

  function setValue(id, value, options = {}) {
    const html = sanitizeContent(value || ''); const editor = editorIds.get(id);
    if (!editor) { pendingValues.set(id, html); const element = document.getElementById(id); if (element) element.value = html; return; }
    editor.quill.clipboard.dangerouslyPasteHTML(html, 'api'); document.getElementById(id).value = html; updateMeta(id, html);
    if (options.markClean !== false) { if (options.preserveDraft) markBaseline(id); else markClean(id); }
  }

  function setScope(ids, scope) { ids.forEach((id) => scopes.set(id, scope)); }

  function restoreDraft(ids) {
    const drafts = ids.map((id) => { const raw = localStorage.getItem(draftKey(id)); if (!raw) return null; try { const draft = JSON.parse(raw); return draft.html && draft.html !== getValue(id) ? { id, html: draft.html } : null; } catch (_) { localStorage.removeItem(draftKey(id)); return null; } });
    if (!drafts.some(Boolean) || !window.confirm('Encontramos um rascunho não salvo. Deseja recuperá-lo?')) return;
    drafts.filter(Boolean).forEach(({ id, html }) => { setValue(id, html, { markClean: false }); markDirty(id); setStatus(id, 'Rascunho recuperado.', 'dirty'); });
  }

  function markClean(id) { baselines.set(id, getValue(id)); dirtyIds.delete(id); clearTimeout(draftTimers.get(id)); localStorage.removeItem(draftKey(id)); setStatus(id, 'Conteúdo salvo.'); }
  function markBaseline(id) { baselines.set(id, getValue(id)); dirtyIds.delete(id); clearTimeout(draftTimers.get(id)); setStatus(id, 'Conteúdo salvo.'); }
  function markSaved(ids) { ids.forEach(markClean); }

  async function prepare(ids) {
    const values = {};
    for (const id of ids) { const raw = getRawValue(id); const error = contentError(raw); if (error) { setStatus(id, error, 'error'); const validationError = new Error(error); validationError.code = 'conteudo_invalido'; throw validationError; } values[id] = sanitizeContent(raw); }
    return values;
  }

  window.addEventListener('beforeunload', (event) => { if (!dirtyIds.size) return; event.preventDefault(); event.returnValue = ''; });
  window.AcademiaRichEditor = { initAll, getValue, setValue, setScope, restoreDraft, markSaved, prepare, clearValue: (id) => setValue(id, '', { markClean: true }), isDirty: () => dirtyIds.size > 0 };
})();
