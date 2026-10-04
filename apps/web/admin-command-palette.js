(function () {
  if (window.AcademiaCommandPalette) return;

  let backdrop = null;
  let input = null;
  let resultsList = null;
  let selectedIndex = 0;
  let currentItems = [];
  let debounceTimer = null;

  const defaultActions = [
    {
      type: 'action',
      group: 'Ações Rápidas',
      title: 'Cadastrar novo aluno',
      desc: 'Adicionar novo aluno na academia',
      icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M19 11v6M16 14h6"/>',
      run: () => { window.location.href = './alunos.html?action=new'; }
    },
    {
      type: 'action',
      group: 'Ações Rápidas',
      title: 'Cadastrar novo exercício',
      desc: 'Adicionar exercício com vídeo ou GIF no catálogo',
      icon: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
      run: () => { window.location.href = './training.html?action=new-exercise'; }
    },
    {
      type: 'action',
      group: 'Ações Rápidas',
      title: 'Nova ficha de treino',
      desc: 'Montar ou personalizar treino para aluno',
      icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      run: () => { window.location.href = './training.html?action=new-plan'; }
    },
    {
      type: 'action',
      group: 'Ações Rápidas',
      title: 'Novo lançamento financeiro',
      desc: 'Registrar mensalidade ou recebimento avulso',
      icon: '<path d="M4 19V5M4 19h16M8 16v-4M12 16V7M16 16v-6"/>',
      run: () => { window.location.href = './financeiro.html?action=new'; }
    },
    {
      type: 'action',
      group: 'Ações Rápidas',
      title: 'Alternar tema claro / escuro',
      desc: 'Mudar tema do painel administrativo',
      icon: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
      run: () => {
        const current = document.documentElement.dataset.adminTheme || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.adminTheme = next;
        localStorage.setItem('adminTheme', next);
      }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Painel',
      desc: 'Resumo e indicadores gerais',
      icon: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/>',
      run: () => { window.location.href = './painel.html'; }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Alunos',
      desc: 'Gestão de cadastros e históricos',
      icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 6"/>',
      run: () => { window.location.href = './alunos.html'; }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Treinos & Fichas',
      desc: 'Biblioteca de exercícios e fichas dos alunos',
      icon: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
      run: () => { window.location.href = './training.html'; }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Financeiro',
      desc: 'Faturamento, contas a receber e cobrança',
      icon: '<path d="M4 19V5M4 19h16M8 16v-4M12 16V7M16 16v-6"/>',
      run: () => { window.location.href = './financeiro.html'; }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Avaliações Físicas',
      desc: 'Medidas corporais e evolução física',
      icon: '<path d="M4 19V5M4 19h16M8 15v-3M12 15V8M16 15v-6"/>',
      run: () => { window.location.href = './assessments.html'; }
    },
    {
      type: 'nav',
      group: 'Navegação',
      title: 'Ir para Controle de Acesso',
      desc: 'Catracas e registros de presenças',
      icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
      run: () => { window.location.href = './access.html'; }
    }
  ];

  function buildDOM() {
    backdrop = document.createElement('div');
    backdrop.className = 'cmd-palette-backdrop hidden';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Comandos rápidos e busca');

    backdrop.innerHTML = `
      <div class="cmd-palette-modal">
        <div class="cmd-palette-header">
          <svg class="cmd-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input class="cmd-palette-input" id="cmd-palette-search" type="text" placeholder="Buscar alunos, exercícios, planos ou ações rápidas..." autocomplete="off" spellcheck="false" />
          <button class="cmd-palette-esc" type="button" aria-label="Fechar">ESC</button>
        </div>
        <div class="cmd-palette-results" id="cmd-palette-results" role="listbox"></div>
        <div class="cmd-palette-footer">
          <div class="cmd-footer-keys">
            <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
            <span><kbd>↵</kbd> selecionar</span>
            <span><kbd>ESC</kbd> fechar</span>
          </div>
          <div><strong style="color:var(--accent,#1478d4);">BlueREC</strong> Spotlight</div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    input = backdrop.querySelector('#cmd-palette-search');
    resultsList = backdrop.querySelector('#cmd-palette-results');

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });

    backdrop.querySelector('.cmd-palette-esc')?.addEventListener('click', close);

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleSearch(input.value.trim()), 120);
    });

    input.addEventListener('keydown', handleKeyNavigation);
  }

  function handleKeyNavigation(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (!currentItems.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentItems.length;
      updateSelection();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
      updateSelection();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = currentItems[selectedIndex];
      if (selected && typeof selected.run === 'function') {
        close();
        selected.run();
      }
    }
  }

  function updateSelection() {
    const itemElements = resultsList.querySelectorAll('.cmd-item');
    itemElements.forEach((el, idx) => {
      const isSel = idx === selectedIndex;
      el.classList.toggle('is-selected', isSel);
      el.setAttribute('aria-selected', String(isSel));
      if (isSel) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  async function handleSearch(query) {
    if (!query) {
      currentItems = defaultActions;
      selectedIndex = 0;
      renderItems(currentItems);
      return;
    }

    const token = localStorage.getItem('academiaToken');
    try {
      const response = await fetch(`/api/admin/omnisearch?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Falha na busca');
      const data = await response.json();

      const items = [];

      // Members
      (data.members || []).forEach((m) => {
        items.push({
          type: 'member',
          group: 'Alunos',
          title: m.name,
          desc: `${m.email || 'Sem email'} · ${m.phone || 'Sem telefone'}`,
          status: m.status,
          icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 6"/>',
          tag: m.status === 'active' ? 'Ativo' : (m.status === 'pending' ? 'Pendente' : 'Inativo'),
          tagClass: m.status === 'active' ? 'is-active' : (m.status === 'pending' ? 'is-pending' : ''),
          phone: m.phone,
          run: () => { window.location.href = `./alunos.html?member_id=${encodeURIComponent(m.id)}`; }
        });
      });

      // Exercises
      (data.exercises || []).forEach((e) => {
        items.push({
          type: 'exercise',
          group: 'Exercícios',
          title: e.name,
          desc: [e.muscle_group_primary || e.muscle_group, e.equipment].filter(Boolean).join(' · '),
          icon: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
          tag: 'Catálogo',
          run: () => { window.location.href = `./training.html?exercise_id=${encodeURIComponent(e.id)}`; }
        });
      });

      // Plans
      (data.plans || []).forEach((p) => {
        const price = (p.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        items.push({
          type: 'plan',
          group: 'Planos',
          title: p.name,
          desc: `${price} / ${p.duration_days} dias`,
          icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
          tag: 'Comercial',
          run: () => { window.location.href = `./planos.html?plan_id=${encodeURIComponent(p.id)}`; }
        });
      });

      // Filter default actions matching query
      const normQ = query.toLowerCase();
      const filteredActions = defaultActions.filter((a) => a.title.toLowerCase().includes(normQ) || a.desc.toLowerCase().includes(normQ));
      items.push(...filteredActions);

      currentItems = items;
      selectedIndex = 0;
      renderItems(currentItems, query);
    } catch (_) {
      // Local fallback
      const normQ = query.toLowerCase();
      currentItems = defaultActions.filter((a) => a.title.toLowerCase().includes(normQ) || a.desc.toLowerCase().includes(normQ));
      selectedIndex = 0;
      renderItems(currentItems, query);
    }
  }

  function renderItems(items, query = '') {
    resultsList.replaceChildren();

    if (!items.length) {
      resultsList.innerHTML = `<div class="cmd-empty">Nenhum resultado encontrado para "<strong>${escapeHtml(query)}</strong>"</div>`;
      return;
    }

    let lastGroup = null;

    items.forEach((item, index) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const groupLabel = document.createElement('div');
        groupLabel.className = 'cmd-group-label';
        groupLabel.textContent = lastGroup;
        resultsList.appendChild(groupLabel);
      }

      const row = document.createElement('button');
      row.type = 'button';
      row.className = `cmd-item${index === selectedIndex ? ' is-selected' : ''}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selectedIndex));

      row.innerHTML = `
        <span class="cmd-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg></span>
        <div class="cmd-item-content">
          <span class="cmd-item-title">${escapeHtml(item.title)}</span>
          <span class="cmd-item-desc">${escapeHtml(item.desc)}</span>
        </div>
        <div class="cmd-item-actions">
          ${item.tag ? `<span class="cmd-item-tag ${item.tagClass || ''}">${escapeHtml(item.tag)}</span>` : ''}
          <span class="cmd-item-shortcut">↵</span>
        </div>
      `;

      row.addEventListener('click', () => {
        close();
        item.run();
      });

      row.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });

      resultsList.appendChild(row);
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
  }

  function open() {
    if (!backdrop) buildDOM();
    backdrop.classList.remove('hidden');
    input.value = '';
    currentItems = defaultActions;
    selectedIndex = 0;
    renderItems(currentItems);
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    if (backdrop) backdrop.classList.add('hidden');
  }

  function toggle() {
    if (!backdrop || backdrop.classList.contains('hidden')) open();
    else close();
  }

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (event) => {
    // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggle();
    }
  });

  window.AcademiaCommandPalette = { open, close, toggle };
}());
