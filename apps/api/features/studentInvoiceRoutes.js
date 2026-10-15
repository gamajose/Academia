const QRCode = require('qrcode');
const { generatePixPayload } = require('../lib/pixUtils');
const { settleInvoicePayment } = require('../lib/invoicePayment');
const { pool, query } = require('../lib/db');
const { recordAudit } = require('../lib/audit');

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

const METHOD_LABELS = {
  pix: 'Pix Instantâneo',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro (Presencial)',
  bank_transfer: 'Transferência Bancária',
  boleto: 'Boleto',
  other: 'No Local / Balcão',
  demo: 'Pix Instantâneo'
};

function toIsoDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    try {
      return value.toISOString().slice(0, 10);
    } catch (_) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return d.toISOString().slice(0, 10);
    } catch (_) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return null;
}

function extractDueDay(dateValue, fallback = 10) {
  if (!dateValue) return fallback;
  if (typeof dateValue === 'number' && dateValue >= 1 && dateValue <= 31) return dateValue;
  const iso = toIsoDate(dateValue);
  if (iso) {
    const parts = iso.split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[2], 10);
      if (!isNaN(d) && d >= 1 && d <= 31) return d;
    }
  }
  return fallback;
}

function calculateCycleDueDate(dueDay, targetYear, targetMonthIndex) {
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, Number(dueDay) || 10), lastDayOfMonth);
  const mm = String(targetMonthIndex + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

function formatBrDate(isoOrDateStr) {
  if (!isoOrDateStr) return '-';
  const iso = toIsoDate(isoOrDateStr);
  if (!iso) return '-';
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildWhatsAppInvoiceUrl({
  phone,
  memberName,
  planName,
  amountFormatted,
  dueDateFormatted,
  dueDay,
  isOverdue,
  daysOverdue,
  pixKey,
  receiverName,
  pixPayload,
  publicAppUrl
}) {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const waPhone = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';

  const statusText = isOverdue
    ? `⚠️ *EM ATRASO* (${daysOverdue > 0 ? `${daysOverdue} dias de atraso` : 'regularize sua mensalidade'})`
    : '⏳ *Disponível para pagamento*';

  let pixBlock = '';
  if (pixKey) {
    pixBlock =
      `⚡ *PAGAMENTO VIA PIX (Online e Instantâneo):*\n` +
      `Basta pagar pelo aplicativo do seu banco com o Pix Copia e Cola abaixo ou com a Chave Pix. A baixa é identificada e validada *automaticamente direto no sistema*!\n\n` +
      `🔑 *Chave Pix:* ${pixKey}\n` +
      `👤 *Favorecido:* ${receiverName || 'Academia LOBO'}\n\n`;

    if (pixPayload) {
      pixBlock +=
        `📋 *Pix Copia e Cola:*\n\`\`\`${pixPayload}\`\`\`\n\n`;
    }
  } else {
    pixBlock =
      `⚡ *PAGAMENTO VIA PIX:*\nAcesse o portal no link abaixo para pagar via Pix com validação automática instantânea!\n\n`;
  }

  const message =
    `*Academia LOBO - Fatura de Mensalidade* 🐺\n\n` +
    `Olá, *${memberName || 'Aluno'}*!\n\n` +
    `Sua fatura de mensalidade (*${planName || 'Plano LOBO'}*) está disponível para pagamento:\n\n` +
    `💰 *Valor:* ${amountFormatted}\n` +
    `📅 *Vencimento:* ${dueDateFormatted} (Vencimento todo dia ${dueDay})\n` +
    `📌 *Situação:* ${statusText}\n\n` +
    pixBlock +
    `💵 *PAGAMENTO EM DINHEIRO:*\n` +
    `Se preferir pagar em dinheiro, compareça à recepção da academia que o administrador dará a baixa no sistema.\n\n` +
    `🌐 *Ver fatura e QR Code online:*\n` +
    `${publicAppUrl}/student-invoices.html`;

  const encoded = encodeURIComponent(message);
  return waPhone
    ? `https://wa.me/${waPhone}?text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;
}

async function syncMembershipInvoices({ query, gymId, memberId, activeMem, dueDay, today = new Date() }) {
  if (!activeMem || !activeMem.id) return;

  const effectiveDueDay = Number(dueDay || activeMem.due_day) || 13;
  const defaultAmount = Number(activeMem.price_cents) || 11990;
  const startRaw = activeMem.starts_at || activeMem.created_at || today;
  const startIso = toIsoDate(startRaw) || toIsoDate(today);
  const startParts = startIso.split('-');
  const startYear = parseInt(startParts[0], 10) || today.getFullYear();
  const startMonth = (parseInt(startParts[1], 10) || (today.getMonth() + 1)) - 1; // 0-indexed

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-indexed

  // Ciclo final: próximo mês (para já disponibilizar a próxima fatura do próximo mês a vencer)
  let endYear = todayYear;
  let endMonth = todayMonth + 1;
  if (endMonth > 11) {
    endMonth = 0;
    endYear++;
  }

  // Busca todos os pagamentos existentes do aluno na academia
  const existingRes = await query(
    `SELECT id, amount_cents, status, due_date::text AS due_date, paid_at, notes, membership_id
     FROM payments
     WHERE gym_id = $1 AND member_id = $2
     ORDER BY CASE WHEN status = 'paid' THEN 0 ELSE 1 END, created_at ASC`,
    [gymId, memberId]
  );

  // Mapeia lançamentos existentes pelo ano-mês de vencimento 'YYYY-MM'
  const byMonth = new Map();
  for (const row of existingRes.rows) {
    const dueIso = toIsoDate(row.due_date);
    if (dueIso) {
      const ym = dueIso.slice(0, 7);
      if (!byMonth.has(ym)) {
        byMonth.set(ym, { ...row, due_date: dueIso });
      } else {
        // Se já existe um pagamento registrado para este mês e o pagamento atual for pendente duplicado, remove o duplicado
        const existingRow = byMonth.get(ym);
        if (row.status === 'pending' && (existingRow.status === 'paid' || existingRow.status === 'pending')) {
          await query('DELETE FROM payments WHERE id = $1', [row.id]);
        }
      }
    }
  }

  // Itera mês a mês de (startYear, startMonth) até (endYear, endMonth)
  let curY = startYear;
  let curM = startMonth;
  let safetyLimit = 36; // Segurança máxima de 36 meses

  while ((curY < endYear || (curY === endYear && curM <= endMonth)) && safetyLimit-- > 0) {
    const cycleDueDate = calculateCycleDueDate(effectiveDueDay, curY, curM);
    const ym = `${curY}-${String(curM + 1).padStart(2, '0')}`;

    const existing = byMonth.get(ym);
    if (!existing) {
      // Cria a mensalidade do ciclo caso ainda não tenha sido faturada
      await query(
        `INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
         VALUES ($1, $2, $3, $4, $4, 'pending', $5, $6)`,
        [gymId, memberId, activeMem.id, defaultAmount, cycleDueDate, `Mensalidade ${activeMem.plan_name || 'Academia'} - Vencimento todo dia ${effectiveDueDay}`]
      );
    } else if (existing.status !== 'paid' && existing.status !== 'cancelled') {
      // Ajusta data de vencimento da fatura aberta para garantir que obedece ao dia X da matrícula
      const curDueStr = toIsoDate(existing.due_date);
      if (curDueStr !== cycleDueDate || !existing.membership_id) {
        await query(
          `UPDATE payments
           SET due_date = $1,
               membership_id = COALESCE(membership_id, $2),
               notes = CASE WHEN notes NOT LIKE '%Vencimento todo dia%' THEN COALESCE(notes, '') || ' - Vencimento todo dia ' || $3 ELSE notes END
           WHERE id = $4`,
          [cycleDueDate, activeMem.id, effectiveDueDay, existing.id]
        );
      }
    }

    curM++;
    if (curM > 11) {
      curM = 0;
      curY++;
    }
  }
}

async function handleStudentInvoiceRoutes(req, res, user, url, helpers) {
  const { send } = helpers;

  if (!url.pathname.startsWith('/api/student/invoices')) return false;
  if (!isStudent(user)) return send(res, 401, { error: 'nao_autorizado' });

  const publicAppUrl = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.3.200:8084').replace(/\/$/, '');

  // GET /api/student/invoices - Lista faturas do aluno e resumo financeiro
  if (req.method === 'GET' && url.pathname === '/api/student/invoices') {
    // Busca informações da academia e chave Pix cadastrada no admin
    const gymRes = await query(
      'SELECT id, name, pix_key, payment_settings, address FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    const gym = gymRes.rows[0] || {};
    const paymentSettings = gym.payment_settings || {};
    const pixSettings = paymentSettings.pix || {};
    const pixKey = gym.pix_key || pixSettings.key || '';
    const gymPix = {
      has_pix: Boolean(pixKey),
      key: pixKey,
      receiver_name: pixSettings.receiver_name || gym.name || 'Academia LOBO',
      bank: pixSettings.bank || '',
      city: pixSettings.city || 'SAO PAULO'
    };

    // Busca dados do aluno
    const memberRes = await query(
      'SELECT id, name, phone, email, due_day, enrollment_date::text AS enrollment_date, created_at FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1',
      [user.member_id, user.gym_id]
    );
    const memberData = memberRes.rows[0] || {};

    // Busca matrícula ativa para calcular regra de dia de vencimento (dia da matrícula ou dia escolhido pelo admin)
    const activeMembershipRes = await query(
      `SELECT m.id, m.starts_at::text AS starts_at, m.ends_at::text AS ends_at, m.due_day, m.status, m.created_at,
              pl.id AS plan_id, pl.name AS plan_name, pl.price_cents
       FROM memberships m
       INNER JOIN plans pl ON pl.id = m.plan_id
       WHERE m.gym_id = $1 AND m.member_id = $2
       ORDER BY m.created_at DESC LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    const activeMem = activeMembershipRes.rows[0] || null;

    // Regra de Vencimento: Se o aluno se matriculou no dia X, todo dia X será o vencimento (ou definido pelo admin)
    const rawEnrollment = activeMem?.starts_at || memberData.enrollment_date || activeMem?.created_at || memberData.created_at || new Date().toISOString().slice(0, 10);
    const enrollmentDate = toIsoDate(rawEnrollment) || new Date().toISOString().slice(0, 10);
    const dueDay = Number(activeMem?.due_day || memberData.due_day) || extractDueDay(enrollmentDate, 13);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sincroniza todas as mensalidades desde a matrícula até a próxima fatura do próximo mês
    if (activeMem) {
      await syncMembershipInvoices({
        query,
        gymId: user.gym_id,
        memberId: user.member_id,
        activeMem,
        dueDay,
        today
      });
    }

    // Busca todos os pagamentos atualizados do aluno
    const paymentsRes = await query(
      `SELECT p.id, p.amount_cents, p.original_amount_cents, p.discount_cents, p.fee_cents,
              p.status, p.due_date::text AS due_date, p.paid_at, p.method, p.notes, p.created_at,
              COALESCE(pl.name, 'Plano Mensal') AS plan_name,
              r.receipt_number
       FROM payments p
       LEFT JOIN memberships m ON m.id = p.membership_id
       LEFT JOIN plans pl ON pl.id = m.plan_id
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       WHERE p.gym_id = $1 AND p.member_id = $2
       ORDER BY p.due_date ASC, p.created_at ASC`,
      [user.gym_id, user.member_id]
    );

    const invoices = paymentsRes.rows.map((row) => {
      const dueDateStr = toIsoDate(row.due_date);
      const dueDate = dueDateStr ? new Date(`${dueDateStr}T00:00:00`) : null;
      let effectiveStatus = row.status || 'pending';
      let isOverdue = false;
      let daysOverdue = 0;

      if (effectiveStatus !== 'paid' && effectiveStatus !== 'cancelled') {
        if (dueDate && dueDate < today) {
          effectiveStatus = 'overdue';
          isOverdue = true;
          const diffMs = today.getTime() - dueDate.getTime();
          daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        } else {
          effectiveStatus = 'pending';
        }
      }

      const amountNumber = Number(row.amount_cents) / 100;
      const amountFormatted = amountNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const dueDateFormatted = formatBrDate(dueDateStr);

      // Gera código Pix pré-calculado se academia tiver chave e fatura estiver em aberto
      let pixPayload = null;
      if (gymPix.has_pix && (effectiveStatus === 'pending' || effectiveStatus === 'overdue')) {
        const txid = `FAT${row.id.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25);
        try {
          pixPayload = generatePixPayload({
            pixKey: gymPix.key,
            merchantName: gymPix.receiver_name,
            merchantCity: gymPix.city,
            amount: amountNumber,
            txid
          });
        } catch (_) {}
      }

      // Link para envio da fatura no WhatsApp
      const whatsappUrl = buildWhatsAppInvoiceUrl({
        phone: memberData.phone,
        memberName: memberData.name,
        planName: row.plan_name || activeMem?.plan_name || 'Plano LOBO',
        amountFormatted,
        dueDateFormatted,
        dueDay,
        isOverdue,
        daysOverdue,
        pixKey: gymPix.key,
        receiverName: gymPix.receiver_name,
        pixPayload,
        publicAppUrl
      });

      return {
        id: row.id,
        amount_cents: Number(row.amount_cents),
        amount_formatted: amountFormatted,
        status: effectiveStatus,
        raw_status: row.status,
        due_date: dueDateStr,
        due_date_formatted: dueDateFormatted,
        paid_at: row.paid_at || null,
        method: row.method || null,
        method_label: METHOD_LABELS[row.method] || (row.method ? String(row.method) : '-'),
        notes: row.notes || null,
        plan_name: row.plan_name || activeMem?.plan_name || 'Plano Mensal',
        receipt_number: row.receipt_number || null,
        is_overdue: isOverdue,
        days_overdue: daysOverdue,
        due_day: dueDay,
        due_day_label: `Todo dia ${dueDay}`,
        whatsapp_url: whatsappUrl,
        pix_payload: pixPayload,
        can_pay: effectiveStatus === 'pending' || effectiveStatus === 'overdue'
      };
    });

    const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
    const pendingCount = invoices.filter((i) => i.status === 'pending').length;
    const paidCount = invoices.filter((i) => i.status === 'paid').length;
    const isUpToDate = overdueCount === 0;

    let statusLabel = 'Em dia';
    let statusTheme = 'ok'; // ok, bad, warn
    if (overdueCount > 0) {
      statusLabel = overdueCount === 1 ? '1 fatura em atraso' : `${overdueCount} faturas em atraso`;
      statusTheme = 'bad';
    } else if (pendingCount > 0) {
      statusLabel = 'Em dia (fatura futura a vencer)';
      statusTheme = 'warn';
    }

    // Próximo Vencimento: a próxima fatura do próximo mês (ou a próxima fatura futura a vencer)
    const futureInvoices = invoices.filter((i) => i.due_date && new Date(`${i.due_date}T00:00:00`) >= today && i.status !== 'paid' && i.status !== 'cancelled');
    futureInvoices.sort((a, b) => new Date(`${a.due_date}T00:00:00`) - new Date(`${b.due_date}T00:00:00`));
    const nextUpcoming = futureInvoices[0];
    const nextMonthDueDate = calculateCycleDueDate(dueDay, today.getFullYear(), today.getMonth() + 1);
    const nextDueDateStr = nextUpcoming ? nextUpcoming.due_date : nextMonthDueDate;

    const summary = {
      is_up_to_date: isUpToDate,
      status_label: statusLabel,
      status_theme: statusTheme,
      overdue_count: overdueCount,
      pending_count: pendingCount,
      paid_count: paidCount,
      total_invoices: invoices.length,
      next_due_date: nextDueDateStr,
      next_due_date_formatted: formatBrDate(nextDueDateStr),
      last_payment_date: invoices.slice().reverse().find((i) => i.status === 'paid')?.paid_at || null,
      due_day: dueDay,
      due_day_label: `Todo dia ${dueDay}`,
      enrollment_date: enrollmentDate
    };

    return send(res, 200, { summary, invoices, gym_pix: gymPix });
  }

  // Extrai :id da rota: /api/student/invoices/:id/...
  const match = url.pathname.match(/^\/api\/student\/invoices\/([0-9a-fA-F-]+)(?:\/([a-zA-Z0-9_-]+))?$/);
  if (!match) return false;

  const paymentId = match[1];
  const action = match[2] || '';

  // POST /api/student/invoices/:id/pix - Gera QR Code e Copia e Cola do Pix conforme chave do admin
  if (req.method === 'POST' && action === 'pix') {
    const paymentRes = await query(
      `SELECT p.id, p.amount_cents, p.status, p.due_date, p.paid_at,
              pl.name AS plan_name, m.name AS member_name, m.phone, ms.starts_at
       FROM payments p
       INNER JOIN members m ON m.id = p.member_id
       LEFT JOIN memberships ms ON ms.id = p.membership_id
       LEFT JOIN plans pl ON pl.id = ms.plan_id
       WHERE p.id = $1 AND p.gym_id = $2 AND p.member_id = $3
       LIMIT 1`,
      [paymentId, user.gym_id, user.member_id]
    );

    if (!paymentRes.rowCount) return send(res, 404, { error: 'fatura_nao_encontrada' });
    const payment = paymentRes.rows[0];

    if (payment.status === 'paid') {
      return send(res, 200, {
        status: 'paid',
        already_paid: true,
        paid_at: payment.paid_at,
        message: 'Esta fatura já foi paga.'
      });
    }

    // Busca conta Pix configurada pelo administrador na academia
    const gymRes = await query(
      'SELECT id, name, pix_key, payment_settings, address FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    const gym = gymRes.rows[0] || {};
    const paymentSettings = gym.payment_settings || {};
    const pixSettings = paymentSettings.pix || {};
    const pixKey = gym.pix_key || pixSettings.key || '';

    if (!pixKey) {
      return send(res, 400, {
        error: 'chave_pix_admin_nao_configurada',
        message: 'A academia ainda não cadastrou a chave Pix no painel administrativo.'
      });
    }

    const receiverName = pixSettings.receiver_name || gym.name || 'Academia LOBO';
    const city = pixSettings.city || 'SAO PAULO';
    const bank = pixSettings.bank || '';

    // TXID identificador da fatura no Pix (padrão EMVCo alfanumérico)
    const txid = `FAT${payment.id.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25);
    const amountNumber = Number(payment.amount_cents) / 100;

    const pixPayload = generatePixPayload({
      pixKey,
      merchantName: receiverName,
      merchantCity: city,
      amount: amountNumber,
      txid
    });

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(pixPayload, {
        margin: 2,
        scale: 6,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (_) {}

    const dueDay = extractDueDay(payment.starts_at || payment.due_date);
    const dueDateFormatted = formatBrDate(payment.due_date);
    const amountFormatted = amountNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const whatsappUrl = buildWhatsAppInvoiceUrl({
      phone: payment.phone,
      memberName: payment.member_name,
      planName: payment.plan_name || 'Plano LOBO',
      amountFormatted,
      dueDateFormatted,
      dueDay,
      isOverdue: payment.due_date && new Date(payment.due_date) < new Date(),
      daysOverdue: 0,
      pixKey,
      receiverName,
      pixPayload,
      publicAppUrl
    });

    return send(res, 200, {
      payment_id: payment.id,
      amount_cents: payment.amount_cents,
      amount_formatted: amountFormatted,
      due_date: payment.due_date ? String(payment.due_date).split('T')[0] : null,
      plan_name: payment.plan_name || 'Mensalidade',
      due_day: dueDay,
      due_day_label: `Todo dia ${dueDay}`,
      whatsapp_url: whatsappUrl,
      pix_key: pixKey,
      receiver_name: receiverName,
      bank,
      city,
      txid,
      pix_payload: pixPayload,
      qr_data_url: qrDataUrl,
      status: payment.status
    });
  }

  // GET /api/student/invoices/:id/status - Verifica status atual da fatura (para polling em tempo real)
  if (req.method === 'GET' && action === 'status') {
    const paymentRes = await query(
      `SELECT p.id, p.status, p.paid_at, p.method, p.amount_cents, r.receipt_number
       FROM payments p
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       WHERE p.id = $1 AND p.gym_id = $2 AND p.member_id = $3
       LIMIT 1`,
      [paymentId, user.gym_id, user.member_id]
    );

    if (!paymentRes.rowCount) return send(res, 404, { error: 'fatura_nao_encontrada' });
    const row = paymentRes.rows[0];
    const isPaid = row.status === 'paid';

    return send(res, 200, {
      id: row.id,
      status: row.status,
      is_paid: isPaid,
      paid_at: row.paid_at,
      method: row.method,
      method_label: METHOD_LABELS[row.method] || row.method || '-',
      receipt_number: row.receipt_number || null
    });
  }

  // POST /api/student/invoices/:id/confirm-pix - Validação automática do Pix
  if (req.method === 'POST' && action === 'confirm-pix') {
    try {
      const settled = await settleInvoicePayment({
        pool,
        paymentId,
        gymId: user.gym_id,
        memberId: user.member_id,
        method: 'pix',
        notes: 'Pix validado automaticamente no portal do aluno'
      });

      await recordAudit(user, 'student_pix_pay', 'payment', paymentId, {
        amount_cents: settled.payment.amount_cents,
        receipt_number: settled.receipt?.receipt_number
      });

      return send(res, 200, {
        success: true,
        status: 'paid',
        paid_at: settled.payment.paid_at,
        method: 'pix',
        method_label: 'Pix Instantâneo',
        receipt_number: settled.receipt?.receipt_number,
        amount_cents: settled.payment.amount_cents
      });
    } catch (err) {
      return send(res, err.statusCode || 500, { error: err.message });
    }
  }

  return false;
}

module.exports = {
  handleStudentInvoiceRoutes,
  extractDueDay,
  calculateCycleDueDate,
  buildWhatsAppInvoiceUrl,
  syncMembershipInvoices,
  toIsoDate,
  formatBrDate
};
