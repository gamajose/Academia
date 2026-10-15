(function () {
  const get = (id) => document.getElementById(id);
  let allInvoices = [];
  let currentFilter = 'all';
  let activePixPaymentId = null;
  let statusPollTimer = null;
  let isCheckingPix = false;

  function formatDate(isoOrDateStr) {
    if (!isoOrDateStr) return '-';
    try {
      const parts = String(isoOrDateStr).split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      const d = new Date(isoOrDateStr);
      return d.toLocaleDateString('pt-BR');
    } catch (_) {
      return String(isoOrDateStr);
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return formatDate(isoStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return formatDate(isoStr);
    }
  }

  function renderSummary(summary) {
    const badge = get('summary-status-badge');
    const desc = get('summary-status-desc');
    const iconWrap = get('summary-status-icon');

    if (badge) {
      badge.textContent = summary.status_label || (summary.is_up_to_date ? 'Em dia' : 'Em atraso');
      badge.className = `inv-badge ${summary.status_theme || (summary.is_up_to_date ? 'ok' : 'bad')}`;
    }

    if (desc) {
      if (summary.overdue_count > 0) {
        desc.textContent = `Atenção: Você possui ${summary.overdue_count} mensalidade(s) com vencimento em atraso.`;
      } else if (summary.pending_count > 0) {
        desc.textContent = 'Mensalidades em dia. Você possui fatura futura aguardando pagamento.';
      } else {
        desc.textContent = 'Parabéns! Todas as suas faturas e mensalidades estão regularizadas.';
      }
    }

    if (iconWrap) {
      iconWrap.className = `invoice-summary-icon ${summary.status_theme || 'ok'}`;
    }

    const nextDue = get('summary-next-due');
    const nextDesc = get('summary-next-desc');
    if (nextDue) {
      nextDue.textContent = summary.next_due_date ? formatDate(summary.next_due_date) : 'Nenhuma';
    }
    if (nextDesc) {
      if (summary.due_day) {
        nextDesc.textContent = `Vencimento fixo todo dia ${summary.due_day}`;
      } else if (summary.next_due_date) {
        nextDesc.textContent = 'Data da próxima fatura a vencer';
      } else {
        nextDesc.textContent = 'Sem faturas pendentes no momento';
      }
    }

    const paidCount = get('summary-paid-count');
    const lastPaidDesc = get('summary-last-paid-desc');
    if (paidCount) {
      paidCount.textContent = summary.paid_count || 0;
    }
    if (lastPaidDesc) {
      lastPaidDesc.textContent = summary.last_payment_date
        ? `Último pagamento em ${formatDate(summary.last_payment_date)}`
        : 'Nenhum pagamento registrado';
    }
  }

  function renderInvoicesList() {
    const container = get('invoices-list-container');
    if (!container) return;

    let filtered = allInvoices;
    if (currentFilter === 'pending') {
      filtered = allInvoices.filter((i) => i.status === 'pending' || i.status === 'overdue');
    } else if (currentFilter === 'paid') {
      filtered = allInvoices.filter((i) => i.status === 'paid');
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="invoices-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; color: var(--muted);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p style="margin: 0; font-weight: 600;">Nenhuma fatura encontrada neste filtro.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((inv) => {
      const isPaid = inv.status === 'paid';
      const isOverdue = inv.status === 'overdue';

      let statusBadgeHtml = '';
      if (isPaid) {
        statusBadgeHtml = `<span class="inv-badge ok"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Pago</span>`;
      } else if (isOverdue) {
        const delayText = inv.days_overdue > 0 ? ` (${inv.days_overdue}d de atraso)` : '';
        statusBadgeHtml = `<span class="inv-badge bad"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Em atraso${delayText}</span>`;
      } else {
        statusBadgeHtml = `<span class="inv-badge warn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> A vencer</span>`;
      }

      let paymentMetaHtml = '';
      if (isPaid) {
        paymentMetaHtml = `
          <div class="invoice-info-item">
            <span class="invoice-info-label">Dia que pagou</span>
            <span class="invoice-info-value paid-at">${formatDateTime(inv.paid_at)}</span>
          </div>
          <div class="invoice-info-item">
            <span class="invoice-info-label">Forma de pagamento</span>
            <span class="invoice-info-value">${StudentPortal.escapeHtml(inv.method_label || 'Pix')}</span>
          </div>
        `;
      } else {
        paymentMetaHtml = `
          <div class="invoice-info-item">
            <span class="invoice-info-label">Situação</span>
            <span class="invoice-info-value" style="color: ${isOverdue ? '#dc2626' : '#d97706'}; font-weight: 750;">
              ${isOverdue ? 'Aguardando regularização' : 'Disponível para pagamento'}
            </span>
          </div>
        `;
      }

      let footerActionHtml = '';
      if (inv.can_pay) {
        const waLinkHtml = inv.whatsapp_url
          ? `<a href="${inv.whatsapp_url}" target="_blank" rel="noopener noreferrer" class="invoice-wa-btn" title="Enviar dados desta fatura no WhatsApp">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.41a8.175 8.175 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.167 8.167 0 0 1-1.25-4.47c0-4.54 3.7-8.24 8.24-8.24h.05zm-3.52 4.88c-.2 0-.42.02-.63.02-.31 0-.6.1-.8.31-.2.21-.78.76-.78 1.86s.8 2.16.91 2.31c.11.15 1.54 2.41 3.79 3.29.54.21.96.33 1.29.43.54.17 1.04.14 1.43.09.44-.07 1.34-.55 1.53-1.08.19-.53.19-.99.13-1.08-.06-.09-.22-.15-.46-.27-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.63.78-.77.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.95-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.41-.54-.42z"/></svg>
              <span>WhatsApp</span>
            </a>`
          : '';

        footerActionHtml = `
          <div class="invoice-card-actions">
            <button type="button" class="invoice-pay-btn" data-pay-id="${inv.id}">
              <svg viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.83L18.17 12 12 18.17 5.83 12 12 5.83z"/></svg>
              <span>Pagar com Pix</span>
            </button>
            ${waLinkHtml}
          </div>
        `;
      } else if (inv.receipt_number) {
        footerActionHtml = `
          <span class="invoice-receipt-tag">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Comprovante: ${StudentPortal.escapeHtml(inv.receipt_number)}
          </span>
        `;
      }

      return `
        <article class="invoice-card ${inv.status}">
          <div class="invoice-card-top">
            <h2 class="invoice-plan-name">${StudentPortal.escapeHtml(inv.plan_name)}</h2>
            ${statusBadgeHtml}
          </div>

          <div class="invoice-card-body">
            <div class="invoice-info-item">
              <span class="invoice-info-label">Valor</span>
              <span class="invoice-info-value amount">${inv.amount_formatted}</span>
            </div>
            <div class="invoice-info-item">
              <span class="invoice-info-label">Vencimento</span>
              <span class="invoice-info-value">${formatDate(inv.due_date)}</span>
            </div>
            ${paymentMetaHtml}
          </div>

          <div class="invoice-card-footer">
            <span class="invoice-footer-meta">${inv.notes ? StudentPortal.escapeHtml(inv.notes) : 'Mensalidade da academia'}</span>
            ${footerActionHtml}
          </div>
        </article>
      `;
    }).join('');

    // Adiciona listener para botões de pagamento Pix
    container.querySelectorAll('[data-pay-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pay-id');
        openPixModal(id);
      });
    });
  }

  async function loadInvoices() {
    try {
      const data = await StudentPortal.api('/api/student/invoices');
      allInvoices = data.invoices || [];
      renderSummary(data.summary || {});
      renderInvoicesList();
      get('student-invoices-status').textContent = '';
    } catch (err) {
      get('student-invoices-status').textContent = `Erro ao carregar faturas: ${err.message}`;
    }
  }

  async function openPixModal(paymentId) {
    activePixPaymentId = paymentId;
    const modal = get('pix-payment-modal');
    const normalBody = get('pix-modal-normal-body');
    const successBody = get('pix-modal-success-body');
    const feedback = get('pix-copy-feedback');

    if (feedback) feedback.textContent = '';
    normalBody.classList.remove('hidden');
    successBody.classList.add('hidden');
    modal.classList.remove('hidden');

    get('pix-modal-amount').textContent = 'Gerando Pix...';
    get('pix-modal-receiver').textContent = 'Carregando...';
    get('pix-modal-key').textContent = 'Carregando...';
    get('pix-copy-code').value = '';

    try {
      const result = await StudentPortal.api(`/api/student/invoices/${paymentId}/pix`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (result.already_paid || result.status === 'paid') {
        showSuccessView({
          receipt_number: result.receipt_number || 'OK',
          paid_at: result.paid_at || new Date().toISOString()
        });
        return;
      }

      get('pix-modal-amount').textContent = result.amount_formatted || `R$ ${(result.amount_cents / 100).toFixed(2)}`;
      get('pix-modal-receiver').textContent = result.receiver_name || 'Academia LOBO';
      get('pix-modal-key').textContent = result.pix_key || '-';
      get('pix-copy-code').value = result.pix_payload || '';

      const bankRow = get('pix-modal-bank-row');
      if (result.bank) {
        bankRow.classList.remove('hidden');
        get('pix-modal-bank').textContent = result.bank;
      } else {
        bankRow.classList.add('hidden');
      }

      // Renderiza QR Code no canvas
      const canvas = get('pix-modal-qr-canvas');
      if (canvas && result.pix_payload) {
        if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
          window.QRCode.toCanvas(canvas, result.pix_payload, {
            width: 220,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
          }, (error) => {
            if (error) console.error('Erro ao renderizar QRCode:', error);
          });
        } else if (result.qr_data_url) {
          const img = new Image();
          img.src = result.qr_data_url;
          img.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
        }
      }

      // Atualiza link de WhatsApp no modal
      const waModalBtn = get('pix-modal-wa-btn');
      if (waModalBtn) {
        if (result.whatsapp_url) {
          waModalBtn.href = result.whatsapp_url;
          waModalBtn.classList.remove('hidden');
        } else {
          waModalBtn.classList.add('hidden');
        }
      }

      // Inicia verificação periódica (polling a cada 3 segundos) para validação automática
      startStatusPolling(paymentId);
    } catch (err) {
      alert(`Não foi possível gerar o Pix: ${err.message}`);
      closePixModal();
    }
  }

  function startStatusPolling(paymentId) {
    stopStatusPolling();
    statusPollTimer = window.setInterval(async () => {
      try {
        const check = await StudentPortal.api(`/api/student/invoices/${paymentId}/status`);
        if (check.is_paid || check.status === 'paid') {
          stopStatusPolling();
          showSuccessView(check);
          loadInvoices(); // Atualiza lista em segundo plano
        }
      } catch (_) {}
    }, 3000);
  }

  function stopStatusPolling() {
    if (statusPollTimer) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  function showSuccessView(data) {
    const normalBody = get('pix-modal-normal-body');
    const successBody = get('pix-modal-success-body');
    normalBody.classList.add('hidden');
    successBody.classList.remove('hidden');

    get('pix-success-receipt').textContent = data.receipt_number || 'Gerado com sucesso';
    get('pix-success-date').textContent = formatDateTime(data.paid_at || new Date().toISOString());
  }

  async function checkPixPaymentNow() {
    if (!activePixPaymentId || isCheckingPix) return;
    isCheckingPix = true;
    const btn = get('pix-check-now-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Validando recebimento no site...</span>';

    try {
      // Chama o endpoint de confirmação e validação automática do Pix
      const res = await StudentPortal.api(`/api/student/invoices/${activePixPaymentId}/confirm-pix`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (res.status === 'paid' || res.success) {
        stopStatusPolling();
        showSuccessView(res);
        loadInvoices();
      } else {
        alert('Pagamento ainda não identificado. Se você já transferiu, aguarde alguns instantes que o sistema validará automaticamente.');
      }
    } catch (err) {
      alert(`Erro na validação: ${err.message}`);
    } finally {
      isCheckingPix = false;
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  function closePixModal() {
    stopStatusPolling();
    activePixPaymentId = null;
    get('pix-payment-modal').classList.add('hidden');
    loadInvoices();
  }

  function copyPixCode() {
    const input = get('pix-copy-code');
    const feedback = get('pix-copy-feedback');
    if (!input || !input.value) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        feedback.textContent = 'Código Pix Copia e Cola copiado para a área de transferência!';
        setTimeout(() => { feedback.textContent = ''; }, 4000);
      }).catch(() => {
        fallbackCopy(input, feedback);
      });
    } else {
      fallbackCopy(input, feedback);
    }
  }

  function fallbackCopy(input, feedback) {
    input.select();
    input.setSelectionRange(0, 99999);
    try {
      document.execCommand('copy');
      feedback.textContent = 'Código Pix Copiado com sucesso!';
      setTimeout(() => { feedback.textContent = ''; }, 4000);
    } catch (_) {
      feedback.textContent = 'Selecione e copie o código manualmente.';
    }
  }

  function initFilters() {
    document.querySelectorAll('.invoice-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.invoice-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        renderInvoicesList();
      });
    });
  }

  async function init() {
    const session = await StudentPortal.init();
    if (!session) return;

    initFilters();
    get('pix-modal-close')?.addEventListener('click', closePixModal);
    get('pix-success-close-btn')?.addEventListener('click', closePixModal);
    get('pix-copy-btn')?.addEventListener('click', copyPixCode);
    get('pix-check-now-btn')?.addEventListener('click', checkPixPaymentNow);

    get('pix-payment-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'pix-payment-modal') closePixModal();
    });

    await loadInvoices();
  }

  window.addEventListener('pagehide', stopStatusPolling);
  document.addEventListener('DOMContentLoaded', init);
}());
