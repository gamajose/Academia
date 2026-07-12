(function () {
  const controls = [
    ['↶', 'undo', 'Desfazer'], ['↷', 'redo', 'Refazer'],
    ['B', 'bold', 'Negrito'], ['I', 'italic', 'Itálico'], ['U', 'underline', 'Sublinhado'], ['S', 'strikeThrough', 'Riscado'],
    ['• Lista', 'insertUnorderedList', 'Lista com marcadores'], ['1. Lista', 'insertOrderedList', 'Lista numerada'],
    ['⇤', 'justifyLeft', 'Alinhar à esquerda'], ['≡', 'justifyCenter', 'Centralizar'], ['⇥', 'justifyRight', 'Alinhar à direita'],
    ['Link', 'createLink', 'Inserir link'], ['Imagem', 'insertImage', 'Inserir imagem'], ['Linha', 'insertHorizontalRule', 'Inserir linha'],
    ['Limpar', 'removeFormat', 'Remover formatação']
  ];

  function run(editor, command, value) {
    editor.focus();
    document.execCommand(command, false, value);
  }

  function addButton(toolbar, editor, label, command, title) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.title = title;
    control.setAttribute('aria-label', title);
    control.addEventListener('mousedown', (event) => event.preventDefault());
    control.addEventListener('click', () => {
      let value = null;
      if (command === 'createLink') value = window.prompt('Cole o endereço do link:');
      if (command === 'insertImage') value = window.prompt('Cole o endereço da imagem:');
      if ((command === 'createLink' || command === 'insertImage') && !value) return;
      run(editor, command, value);
    });
    toolbar.appendChild(control);
  }

  function addSelect(toolbar, editor, title, options, command) {
    const select = document.createElement('select');
    select.title = title;
    select.setAttribute('aria-label', title);
    select.innerHTML = `<option value="">${title}</option>${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}`;
    select.addEventListener('change', () => {
      if (!select.value) return;
      const value = command === 'formatBlock' ? `<${select.value}>` : select.value;
      run(editor, command, value);
      select.value = '';
    });
    toolbar.appendChild(select);
  }

  function addColor(toolbar, editor, title, command, value) {
    const input = document.createElement('input');
    input.type = 'color';
    input.title = title;
    input.setAttribute('aria-label', title);
    input.value = value;
    input.addEventListener('input', () => run(editor, command, input.value));
    toolbar.appendChild(input);
  }

  function setup(toolbar) {
    const editor = document.getElementById(toolbar.dataset.editor);
    if (!editor || toolbar.dataset.ready === 'true') return;
    toolbar.dataset.ready = 'true';
    try { document.execCommand('styleWithCSS', false, true); } catch (_) { /* browser fallback */ }
    controls.forEach(([label, command, title]) => addButton(toolbar, editor, label, command, title));
    addSelect(toolbar, editor, 'Formato', [['p', 'Parágrafo'], ['h3', 'Título'], ['h4', 'Subtítulo'], ['blockquote', 'Citação']], 'formatBlock');
    addSelect(toolbar, editor, 'Fonte', [['Arial', 'Arial'], ['Georgia', 'Georgia'], ['Verdana', 'Verdana'], ['Courier New', 'Monospace']], 'fontName');
    addSelect(toolbar, editor, 'Tamanho', [['2', 'Pequena'], ['3', 'Normal'], ['5', 'Grande'], ['7', 'Muito grande']], 'fontSize');
    addColor(toolbar, editor, 'Cor do texto', 'foreColor', '#171717');
    addColor(toolbar, editor, 'Realce do texto', 'hiliteColor', '#fff1a8');
  }

  function initAll() {
    document.querySelectorAll('.editor-toolbar').forEach(setup);
  }

  function setValue(id, value) {
    const editor = document.getElementById(id);
    if (editor) editor.innerHTML = value || '';
  }

  function clearValue(id) {
    setValue(id, '');
  }

  window.AcademiaRichEditor = { setup, initAll, setValue, clearValue };
})();
