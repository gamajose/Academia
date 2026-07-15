(() => {
  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6v14H5V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h6v6H4z"></path><path d="M14 4h6v6h-6z"></path><path d="M4 14h6v6H4z"></path><path d="M14 14h2v2h-2z"></path><path d="M18 14h2"></path><path d="M18 18h2v2h-2z"></path><path d="M14 18h2"></path></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 3.5A11.9 11.9 0 0 0 12.1 0C5.5 0 .2 5.3.2 11.9c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.7a11.9 11.9 0 0 0 5.7 1.4h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.2-3.5-8.4Z"></path><path d="M8.8 7.5c.2-.4.4-.5.7-.5h.6c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.6.7c.6 1.1 1.5 2 2.6 2.6l.7-.6c.2-.2.4-.2.7-.1l1.9.8c.3.1.4.3.4.5v.6c0 .3-.1.5-.5.7-.5.3-1 .4-1.5.3-2.8-.6-5.2-3-5.8-5.8-.1-.5 0-1 .3-1.5Z"></path></svg>'
  };

  function create(type, label, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `icon-button action-icon-button ${className}`.trim();
    element.setAttribute('aria-label', label);
    element.title = label;
    element.innerHTML = icons[type] || '';
    return element;
  }

  function link(type, label, className = '') {
    const element = document.createElement('a');
    element.className = `icon-button icon-link ${className}`.trim();
    element.setAttribute('aria-label', label);
    element.title = label;
    element.innerHTML = icons[type] || '';
    return element;
  }

  window.AcademiaIcons = Object.freeze({ button: create, link });
})();
