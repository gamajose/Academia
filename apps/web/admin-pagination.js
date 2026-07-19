(function () {
  const pageSize = 5;

  function render(host, options = {}) {
    if (!host) return;
    const total = Math.max(0, Number(options.total) || 0);
    const pages = Math.max(1, Math.ceil(total / (Number(options.pageSize) || pageSize)));
    const page = Math.min(pages, Math.max(1, Number(options.page) || 1));
    host.replaceChildren();
    host.className = 'admin-pagination';
    host.hidden = total === 0;
    if (host.hidden) return;

    const button = (label, target, disabled = false, active = false, ariaLabel = '') => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      item.disabled = disabled;
      item.classList.toggle('active', active);
      if (ariaLabel) item.setAttribute('aria-label', ariaLabel);
      if (!disabled && !active) item.addEventListener('click', () => options.onChange?.(target));
      return item;
    };

    host.appendChild(button('‹', page - 1, page === 1, false, 'Página anterior'));
    const start = Math.max(1, Math.min(page - 1, pages - 2));
    const end = Math.min(pages, start + 2);
    for (let number = start; number <= end; number += 1) host.appendChild(button(String(number), number, false, number === page, `Página ${number}`));
    const status = document.createElement('span');
    status.className = 'admin-pagination-status';
    status.textContent = `${page} de ${pages}`;
    status.setAttribute('aria-live', 'polite');
    host.appendChild(status);
    host.appendChild(button('›', page + 1, page === pages, false, 'Próxima página'));
  }

  window.AdminPagination = { pageSize, render };
})();
