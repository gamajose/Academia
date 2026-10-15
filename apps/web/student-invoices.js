(function () {
  const get = (id) => document.getElementById(id);
  let allInvoices = [];
  let currentFilter = 'all';
  let activePixPaymentId = null;
  let statusPollTimer = null;
  let isCheckingPix = false;

  function formatDate(isoOrDateStr) {
    if (!isoOrDateStr || isoOrDateStr === '-' || isoOrDateStr === 'null' || isoOrDateStr === 'undefined') return '-';
    try {
      const str = String(isoOrDateStr).trim();

      // 1. Se já estiver no formato brasileiro DD/MM/YYYY ou americano MM/DD/YYYY
      const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        const p1 = parseInt(slashMatch[1], 10);
        const p2 = parseInt(slashMatch[2], 10);
        const y = slashMatch[3];
        if (p1 <= 12 && p2 > 12) {
          return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${y}`;
        }
        return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${y}`;
      }

      // 2. Se for formato ISO YYYY-MM-DD
      const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      }

      // 3. Se for string com data por extenso ou timestamp (ex: Sun Sep 13 2026...)
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return str;
    } catch (_) {
      return String(isoOrDateStr);
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr || isoStr === '-' || isoStr === 'null' || isoStr === 'undefined') return '-';
    return formatDate(isoStr);
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
      nextDue.textContent = summary.next_due_date_formatted || (summary.next_due_date ? formatDate(summary.next_due_date) : 'Nenhuma');
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

    let filtered = allInvoices.filter((i) => i && i.id && (i.due_date || i.due_date_formatted));
    if (currentFilter === 'pending') {
      filtered = filtered.filter((i) => i.status === 'pending' || i.status === 'overdue');
    } else if (currentFilter === 'paid') {
      filtered = filtered.filter((i) => i.status === 'paid');
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
            <span class="invoice-info-value paid-at">${formatDate(inv.paid_at)}</span>
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
      const invoicePublicHref = `./fatura.html?id=${inv.id}`;
      if (inv.can_pay) {
        footerActionHtml = `
          <div class="invoice-card-actions">
            <button type="button" class="invoice-pay-btn" data-pay-id="${inv.id}">
              <svg viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.83L18.17 12 12 18.17 5.83 12 12 5.83z"/></svg>
              <span>Pagar com Pix</span>
            </button>
            <a href="${invoicePublicHref}" target="_blank" class="invoice-link-btn" title="Ver fatura online e QR Code">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Ver Fatura</span>
            </a>
          </div>
        `;
      } else {
        footerActionHtml = `
          <div class="invoice-card-actions">
            ${inv.receipt_number ? `<span class="invoice-receipt-tag">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Comprovante: ${StudentPortal.escapeHtml(inv.receipt_number)}
            </span>` : ''}
            <a href="${invoicePublicHref}" target="_blank" class="invoice-link-btn" title="Ver recibo e fatura quitada">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Ver Recibo</span>
            </a>
          </div>
        `;
      }

      return `
        <article class="invoice-card ${inv.status}">
          <div class="invoice-card-top">
            <h2 class="invoice-plan-name">${StudentPortal.escapeHtml(inv.plan_name || 'Plano Mensal')}</h2>
            ${statusBadgeHtml}
          </div>

          <div class="invoice-card-body">
            <div class="invoice-info-item">
              <span class="invoice-info-label">Valor</span>
              <span class="invoice-info-value amount">${inv.amount_formatted}</span>
            </div>
            <div class="invoice-info-item">
              <span class="invoice-info-label">Vencimento</span>
              <span class="invoice-info-value">${inv.due_date_formatted || formatDate(inv.due_date)}</span>
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

      // Atualiza link de visualização direta da fatura
      const linkModalBtn = get('pix-modal-link-btn');
      if (linkModalBtn) {
        linkModalBtn.href = `./fatura.html?id=${paymentId}`;
      }

      // Atualiza botão de contato com a recepção no WhatsApp
      const supportBtn = get('pix-modal-support-btn');
      if (supportBtn) {
        const gymPhone = String(result.gym_phone || '').replace(/\D/g, '');
        if (gymPhone) {
          const waGym = gymPhone.startsWith('55') ? gymPhone : `55${gymPhone}`;
          const msg = encodeURIComponent(`Olá! Sou aluno da academia e gostaria de tirar uma dúvida sobre a minha fatura (#${paymentId.slice(0, 8).toUpperCase()}).`);
          supportBtn.href = `https://api.whatsapp.com/send?phone=${waGym}&text=${msg}`;
          supportBtn.classList.remove('hidden');
        } else {
          supportBtn.classList.add('hidden');
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
