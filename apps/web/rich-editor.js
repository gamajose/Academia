(function () {
  const MAX_CONTENT_BYTES = 300000;
  const editorIds = new Map();
  const scopes = new Map();
  const dirtyIds = new Set();
  const readyIds = new Set();
  const baselines = new Map();
  const draftTimers = new Map();
  const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
    'a', 'hr', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'colgroup', 'col'
  ];
  const ALLOWED_ATTR = ['href', 'target', 'rel', 'title', 'src', 'alt', 'width', 'height', 'style', 'class', 'colspan', 'rowspan', 'scope'];

  function apiBase() {
    const host = window.location.hostname || 'localhost';
    return localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  }

  function token() {
    return localStorage.getItem('academiaToken') || '';
  }

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

  function draftKey(id) {
    return `academia-rich-draft:${scopes.get(id) || window.location.pathname}:${id}`;
  }

  function metaFor(id) {
    const editor = editorIds.get(id);
    return editor?.richMeta || null;
  }

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
    const words = text ? text.split(' ').length : 0;
    meta.count.textContent = `${words} palavras · ${text.length} caracteres · ${bytes.toLocaleString('pt-BR')} bytes`;
  }

  function saveDraft(id) {
    const html = getValue(id);
    if (!html) {
      localStorage.removeItem(draftKey(id));
      setStatus(id, 'Alterações não salvas.');
      return;
    }
    try {
      localStorage.setItem(draftKey(id), JSON.stringify({ html, savedAt: new Date().toISOString() }));
      setStatus(id, 'Rascunho salvo automaticamente.');
    } catch (_) {
      setStatus(id, 'Não foi possível salvar o rascunho local.', 'error');
    }
  }

  function scheduleDraft(id) {
    clearTimeout(draftTimers.get(id));
    draftTimers.set(id, setTimeout(() => saveDraft(id), 900));
  }

  function markDirty(id) {
    if (!readyIds.has(id)) return;
    const html = getValue(id);
    const baseline = baselines.get(id);
    if (baseline !== undefined && html === baseline) {
      dirtyIds.delete(id);
      clearTimeout(draftTimers.get(id));
      localStorage.removeItem(draftKey(id));
      updateMeta(id, html);
      setStatus(id, 'Conteúdo salvo.');
      return;
    }
    dirtyIds.add(id);
    const error = contentError(html);
    updateMeta(id, html);
    setStatus(id, error || 'Alterações não salvas.', error ? 'error' : 'dirty');
    scheduleDraft(id);
  }

  function registerMeta(id, container) {
    const meta = document.createElement('div');
    meta.className = 'rich-editor-meta';
    meta.innerHTML = '<span class="rich-editor-status">Carregando editor...</span><span class="rich-editor-count"></span>';
    container.parentNode.insertBefore(meta, container.nextSibling);
    return { status: meta.querySelector('.rich-editor-status'), count: meta.querySelector('.rich-editor-count'), root: meta };
  }

  function uploadImage(blobInfo, progress) {
    return new Promise((resolve, reject) => {
      const data = new FormData();
      data.append('file', blobInfo.blob(), blobInfo.filename());
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${apiBase()}/api/editor/images`);
      xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch (_) { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.location) return resolve(body.location);
        reject({ message: body.error || 'Não foi possível enviar a imagem.', remove: true });
      };
      xhr.onerror = () => reject({ message: 'Falha de conexão ao enviar a imagem.', remove: true });
      xhr.send(data);
    });
  }

  function editorConfig(textarea) {
    const id = textarea.id;
    return {
      target: textarea,
      menubar: 'file edit view insert format tools table help',
      plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table wordcount autosave',
      toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image table blockquote hr | removeformat fullscreen preview',
      toolbar_mode: 'sliding',
      height: 380,
      min_height: 260,
      branding: false,
      promotion: false,
      statusbar: true,
      resize: true,
      paste_data_images: false,
      automatic_uploads: true,
      images_upload_handler: uploadImage,
      images_file_types: 'jpeg,jpg,png,gif,webp',
      autosave_interval: '30s',
      autosave_retention: '20m',
      autosave_restore_when_empty: false,
      autosave_ask_before_unload: false,
      autosave_prefix: `academia-tinymce-${window.location.pathname}-${id}-`,
      content_style: 'body{font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#171717;background:#fff;padding:12px 16px}p{margin:0 0 10px}blockquote{border-left:4px solid #b91c1c;margin:16px 0;padding:8px 16px;color:#53605b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8d0c4;padding:8px;text-align:left}img{max-width:100%;height:auto}',
      setup: (editor) => {
        editor.on('init', () => {
          editorIds.set(id, editor);
          readyIds.add(id);
          baselines.set(id, sanitizeContent(editor.getContent({ format: 'html' })));
          editor.richMeta = registerMeta(id, editor.getContainer());
          updateMeta(id, editor.getContent({ format: 'html' }));
          setStatus(id, 'Editor pronto.');
        });
        editor.on('change input undo redo', () => markDirty(id));
      }
    };
  }

  async function initAll() {
    if (!window.tinymce) throw new Error('Editor visual indisponível.');
    const fields = [...document.querySelectorAll('textarea.rich-editor')];
    await Promise.all(fields.map(async (textarea) => {
      const created = await window.tinymce.init(editorConfig(textarea));
      const editor = Array.isArray(created) ? created[0] : created;
      if (editor && !editorIds.has(textarea.id)) editorIds.set(textarea.id, editor);
    }));
  }

  function getValue(id) {
    return sanitizeContent(getRawValue(id));
  }

  function getRawValue(id) {
    const editor = editorIds.get(id);
    const textarea = document.getElementById(id);
    return editor ? editor.getContent({ format: 'html' }) : textarea?.value || '';
  }

  function setValue(id, value, options = {}) {
    const editor = editorIds.get(id);
    const html = sanitizeContent(value || '');
    if (editor) editor.setContent(html, { format: 'html' });
    else if (document.getElementById(id)) document.getElementById(id).value = html;
    updateMeta(id, html);
    if (options.markClean !== false) {
      if (options.preserveDraft) markBaseline(id);
      else markClean(id);
    }
  }

  function setScope(ids, scope) {
    ids.forEach((id) => scopes.set(id, scope));
  }

  function restoreDraft(ids) {
    const drafts = ids.map((id) => {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return null;
      try {
        const draft = JSON.parse(raw);
        return draft.html && draft.html !== getValue(id) ? { id, html: draft.html } : null;
      } catch (_) { localStorage.removeItem(draftKey(id)); return null; }
    });
    if (!drafts.some(Boolean) || !window.confirm('Encontramos um rascunho não salvo. Deseja recuperá-lo?')) return;
    drafts.filter(Boolean).forEach(({ id, html }) => {
      setValue(id, html, { markClean: false });
      markDirty(id);
      setStatus(id, 'Rascunho recuperado.', 'dirty');
    });
  }

  function markClean(id) {
    baselines.set(id, getValue(id));
    dirtyIds.delete(id);
    clearTimeout(draftTimers.get(id));
    localStorage.removeItem(draftKey(id));
    setStatus(id, 'Conteúdo salvo.');
  }

  function markBaseline(id) {
    baselines.set(id, getValue(id));
    dirtyIds.delete(id);
    clearTimeout(draftTimers.get(id));
    setStatus(id, 'Conteúdo salvo.');
  }

  function markSaved(ids) {
    ids.forEach(markClean);
  }

  async function prepare(ids) {
    const values = {};
    for (const id of ids) {
      const editor = editorIds.get(id);
      if (editor) await editor.uploadImages();
      const raw = getRawValue(id);
      const error = contentError(raw);
      if (error) {
        setStatus(id, error, 'error');
        const validationError = new Error(error);
        validationError.code = 'conteudo_invalido';
        throw validationError;
      }
      values[id] = sanitizeContent(raw);
    }
    return values;
  }

  window.addEventListener('beforeunload', (event) => {
    if (!dirtyIds.size) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.AcademiaRichEditor = {
    initAll, getValue, setValue, setScope, restoreDraft, markSaved, prepare,
    clearValue: (id) => setValue(id, '', { markClean: true }),
    isDirty: () => dirtyIds.size > 0
  };
})();
