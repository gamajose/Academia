(() => {
  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7.5"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    deactivate: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
    activate: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h6v6H4z"></path><path d="M14 4h6v6h-6z"></path><path d="M4 14h6v6H4z"></path><path d="M14 14h2v2h-2z"></path><path d="M18 14h2"></path><path d="M18 18h2v2h-2z"></path><path d="M14 18h2"></path></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 3.5A11.9 11.9 0 0 0 12.1 0C5.5 0 .2 5.3.2 11.9c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.7a11.9 11.9 0 0 0 5.7 1.4h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.2-3.5-8.4Z"></path><path d="M8.8 7.5c.2-.4.4-.5.7-.5h.6c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.6.7c.6 1.1 1.5 2 2.6 2.6l.7-.6c.2-.2.4-.2.7-.1l1.9.8c.3.1.4.3.4.5v.6c0 .3-.1.5-.5.7-.5.3-1 .4-1.5.3-2.8-.6-5.2-3-5.8-5.8-.1-.5 0-1 .3-1.5Z"></path></svg>'
  };

  function create(type, label, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `icon-button action-icon-button ${type ? `icon-${type}` : ''} ${className}`.trim();
    element.setAttribute('aria-label', label);
    element.title = label;
    element.innerHTML = icons[type] || '';
    return element;
  }

  function link(type, label, className = '') {
    const element = document.createElement('a');
    element.className = `icon-button icon-link ${type ? `icon-${type}` : ''} ${className}`.trim();
    element.setAttribute('aria-label', label);
    element.title = label;
    element.innerHTML = icons[type] || '';
    return element;
  }

  function get(type) {
    return icons[type] || '';
  }

  function upgradePlusButtons() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.icon-button').forEach((button) => {
      const text = button.textContent.trim();
      if (text === '+') {
        button.innerHTML = icons.plus;
        button.classList.add('has-plus-icon');
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', upgradePlusButtons);
    } else {
      upgradePlusButtons();
    }
  }

  window.AcademiaIcons = Object.freeze({ button: create, link, get });
})();
