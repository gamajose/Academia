(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const invoiceId = (params.get('id') || params.get('fatura') || '').trim();

  const loadingEl = document.getElementById('loading-state');
  const errorEl = document.getElementById('status-error');
  const contentEl = document.getElementById('fatura-content');

  const planNameEl = document.getElementById('fatura-plan-name');
  const memberNameEl = document.getElementById('fatura-member-name');
  const statusBadgeEl = document.getElementById('fatura-status-badge');
  const amountEl = document.getElementById('fatura-amount');
  const dueDateEl = document.getElementById('fatura-due-date');
  const codeEl = document.getElementById('fatura-code');

  const pixSectionEl = document.getElementById('pix-section');
  const pixQrWrapEl = document.getElementById('pix-qr-wrap');
  const pixQrImgEl = document.getElementById('pix-qr-img');
  const pixCopiaColaEl = document.getElementById('pix-copia-cola');
  const btnCopyPixEl = document.getElementById('btn-copy-pix');
  const btnConfirmPixEl = document.getElementById('btn-confirm-pix');

  const paidSectionEl = document.getElementById('paid-section');
  const receiptNumberEl = document.getElementById('receipt-number');
  const receiptDateEl = document.getElementById('receipt-date');

  const btnWaSupportEl = document.getElementById('btn-wa-support');

  let pollTimer = null;
  let currentInvoice = null;

  function showError(msg) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
  }

  function getApiUrl(path) {
    return path;
  }

  async function loadInvoice() {
    if (!invoiceId) {
      showError('Identificador da fatura não informado na URL. Verifique o link recebido.');
      return;
    }

    try {
      const res = await fetch(getApiUrl(`/api/public/invoices/${encodeURIComponent(invoiceId)}`));
      if (!res.ok) {
        if (res.status === 404) {
          showError('Fatura não encontrada. Verifique o link ou entre em contato com a recepção da academia.');
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        showError(errJson.message || `Erro ao carregar fatura (código ${res.status}).`);
        return;
      }

      const data = await res.json();
      currentInvoice = data;
      renderInvoice(data);

      if (!data.is_paid && !pollTimer) {
        pollTimer = setInterval(pollInvoiceStatus, 6000);
      }
    } catch (err) {
      showError('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
    }
  }

  function renderInvoice(inv) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    document.title = `Fatura ${inv.plan_name || 'Mensalidade'} - ${inv.gym_name || 'Academia LOBO'}`;

    if (planNameEl) planNameEl.textContent = inv.plan_name || 'Plano Mensal';
    if (memberNameEl) memberNameEl.textContent = inv.member_name ? `Aluno(a): ${inv.member_name}` : 'Mensalidade';
    if (amountEl) amountEl.textContent = inv.amount_formatted || 'R$ 0,00';
    if (dueDateEl) dueDateEl.textContent = inv.due_date_formatted || '-';
    if (codeEl) codeEl.textContent = `#${inv.id.slice(0, 8).toUpperCase()}`;

    // Status Badge
    if (statusBadgeEl) {
      statusBadgeEl.className = 'fatura-badge';
      if (inv.is_paid) {
        statusBadgeEl.classList.add('ok');
        statusBadgeEl.textContent = 'Pago';
      } else if (inv.is_overdue) {
        statusBadgeEl.classList.add('bad');
        statusBadgeEl.textContent = inv.days_overdue > 0 ? `Em atraso (${inv.days_overdue}d)` : 'Em atraso';
      } else {
        statusBadgeEl.classList.add('warn');
        statusBadgeEl.textContent = 'Aguardando Pagamento';
      }
    }

    // Se já está pago
    if (inv.is_paid) {
      if (pixSectionEl) pixSectionEl.classList.add('hidden');
      if (paidSectionEl) paidSectionEl.classList.remove('hidden');
      if (receiptNumberEl) receiptNumberEl.textContent = inv.receipt_number || `#REC-${inv.id.slice(0, 8).toUpperCase()}`;
      if (receiptDateEl) receiptDateEl.textContent = inv.paid_at_formatted || 'Confirmado';
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } else {
      if (paidSectionEl) paidSectionEl.classList.add('hidden');
      if (pixSectionEl) pixSectionEl.classList.remove('hidden');

      if (inv.qr_data_url && pixQrImgEl) {
        pixQrImgEl.src = inv.qr_data_url;
        if (pixQrWrapEl) pixQrWrapEl.classList.remove('hidden');
      } else if (pixQrWrapEl) {
        pixQrWrapEl.classList.add('hidden');
      }

      if (pixCopiaColaEl) {
        pixCopiaColaEl.value = inv.pix_payload || 'Chave Pix não configurada na academia. Consulte a recepção.';
      }
    }

    // WhatsApp Suporte da Academia
    if (btnWaSupportEl) {
      const rawPhone = String(inv.gym_phone || '').replace(/\D/g, '');
      if (rawPhone) {
        const fullPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
        const msg = encodeURIComponent(
          `Olá! Sou ${inv.member_name || 'aluno'} e gostaria de falar sobre a fatura #${inv.id.slice(0, 8).toUpperCase()} (${inv.plan_name || 'Mensalidade'}).`
        );
        btnWaSupportEl.href = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${msg}`;
        btnWaSupportEl.classList.remove('hidden');
      } else {
        btnWaSupportEl.classList.add('hidden');
      }
    }
  }

  async function pollInvoiceStatus() {
    if (!invoiceId) return;
    try {
      const res = await fetch(getApiUrl(`/api/public/invoices/${encodeURIComponent(invoiceId)}`));
      if (!res.ok) return;
      const data = await res.json();
      if (data.is_paid && (!currentInvoice || !currentInvoice.is_paid)) {
        currentInvoice = data;
        renderInvoice(data);
      }
    } catch (_) {}
  }

  // Copiar código Pix
  if (btnCopyPixEl) {
    btnCopyPixEl.addEventListener('click', async () => {
      const code = pixCopiaColaEl ? pixCopiaColaEl.value : '';
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        const originalText = btnCopyPixEl.innerHTML;
        btnCopyPixEl.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          <span style="color: #22c55e;">Código Copiado!</span>
        `;
        setTimeout(() => {
          btnCopyPixEl.innerHTML = originalText;
        }, 3000);
      } catch (err) {
        if (pixCopiaColaEl) {
          pixCopiaColaEl.focus();
          pixCopiaColaEl.select();
          document.execCommand('copy');
          alert('Código Pix selecionado! Utilize Ctrl+C para copiar.');
        }
      }
    });
  }

  // Validar baixa instantânea
  if (btnConfirmPixEl) {
    btnConfirmPixEl.addEventListener('click', async () => {
      if (!invoiceId) return;
      btnConfirmPixEl.disabled = true;
      const originalText = btnConfirmPixEl.innerHTML;
      btnConfirmPixEl.innerHTML = `
        <svg class="spinner" viewBox="0 0 50 50" style="width: 16px; height: 16px; stroke: #fff;"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle></svg>
        <span>Validando Pix...</span>
      `;

      try {
        const res = await fetch(getApiUrl(`/api/public/invoices/${encodeURIComponent(invoiceId)}/confirm-pix`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Não foi possível confirmar o Pix neste momento. Tente novamente ou consulte a recepção.');
          btnConfirmPixEl.disabled = false;
          btnConfirmPixEl.innerHTML = originalText;
          return;
        }

        // Sucesso: atualizar tela
        await loadInvoice();
      } catch (err) {
        alert('Erro ao comunicar com o servidor. Verifique sua conexão.');
        btnConfirmPixEl.disabled = false;
        btnConfirmPixEl.innerHTML = originalText;
      }
    });
  }

  loadInvoice();
})();
