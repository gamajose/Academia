const QRCode = require('qrcode');
const { generatePixPayload } = require('../lib/pixUtils');
const { settleInvoicePayment } = require('../lib/invoicePayment');
const { pool, query } = require('../lib/db');
const { recordAudit } = require('../lib/audit');

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

const METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência Bancária',
  boleto: 'Boleto',
  other: 'Outro',
  demo: 'Pix'
};

async function handleStudentInvoiceRoutes(req, res, user, url, helpers) {
  const { send } = helpers;

  if (!url.pathname.startsWith('/api/student/invoices')) return false;
  if (!isStudent(user)) return send(res, 401, { error: 'nao_autorizado' });

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

    // Verifica se há pagamentos para o aluno
    let paymentsRes = await query(
      `SELECT p.id, p.amount_cents, p.original_amount_cents, p.discount_cents, p.fee_cents,
              p.status, p.due_date, p.paid_at, p.method, p.notes, p.created_at,
              pl.name AS plan_name,
              r.receipt_number
       FROM payments p
       LEFT JOIN memberships m ON m.id = p.membership_id
       LEFT JOIN plans pl ON pl.id = m.plan_id
       LEFT JOIN payment_receipts r ON r.payment_id = p.id
       WHERE p.gym_id = $1 AND p.member_id = $2
       ORDER BY p.due_date DESC, p.created_at DESC`,
      [user.gym_id, user.member_id]
    );

    // Se o aluno não tiver nenhum pagamento gerado mas tiver matrícula ativa, cria a fatura inicial
    if (paymentsRes.rowCount === 0) {
      const activeMembership = await query(
        `SELECT m.id, m.starts_at, m.ends_at, pl.name AS plan_name, pl.price_cents
         FROM memberships m
         INNER JOIN plans pl ON pl.id = m.plan_id
         WHERE m.gym_id = $1 AND m.member_id = $2
         ORDER BY m.created_at DESC LIMIT 1`,
        [user.gym_id, user.member_id]
      );
      if (activeMembership.rowCount > 0) {
        const mem = activeMembership.rows[0];
        const defaultAmount = Number(mem.price_cents) || 11990;
        await query(
          `INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
           VALUES ($1, $2, $3, $4, $4, 'pending', current_date + interval '5 days', $5)`,
          [user.gym_id, user.member_id, mem.id, defaultAmount, `Mensalidade ${mem.plan_name}`]
        );

        paymentsRes = await query(
          `SELECT p.id, p.amount_cents, p.original_amount_cents, p.discount_cents, p.fee_cents,
                  p.status, p.due_date, p.paid_at, p.method, p.notes, p.created_at,
                  pl.name AS plan_name,
                  r.receipt_number
           FROM payments p
           LEFT JOIN memberships m ON m.id = p.membership_id
           LEFT JOIN plans pl ON pl.id = m.plan_id
           LEFT JOIN payment_receipts r ON r.payment_id = p.id
           WHERE p.gym_id = $1 AND p.member_id = $2
           ORDER BY p.due_date DESC, p.created_at DESC`,
          [user.gym_id, user.member_id]
        );
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const invoices = paymentsRes.rows.map((row) => {
      const dueDate = row.due_date ? new Date(row.due_date) : null;
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

      return {
        id: row.id,
        amount_cents: Number(row.amount_cents),
        amount_formatted: (Number(row.amount_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        status: effectiveStatus,
        raw_status: row.status,
        due_date: row.due_date ? String(row.due_date).split('T')[0] : null,
        paid_at: row.paid_at || null,
        method: row.method || null,
        method_label: METHOD_LABELS[row.method] || (row.method ? String(row.method) : '-'),
        notes: row.notes || null,
        plan_name: row.plan_name || 'Mensalidade',
        receipt_number: row.receipt_number || null,
        is_overdue: isOverdue,
        days_overdue: daysOverdue,
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

    const nextPending = invoices.find((i) => i.status === 'pending');
    const lastPaid = invoices.find((i) => i.status === 'paid');

    const summary = {
      is_up_to_date: isUpToDate,
      status_label: statusLabel,
      status_theme: statusTheme,
      overdue_count: overdueCount,
      pending_count: pendingCount,
      paid_count: paidCount,
      total_invoices: invoices.length,
      next_due_date: nextPending ? nextPending.due_date : null,
      last_payment_date: lastPaid ? lastPaid.paid_at : null
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
      `SELECT p.id, p.amount_cents, p.status, p.due_date, p.paid_at, pl.name AS plan_name, m.name AS member_name
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

    return send(res, 200, {
      payment_id: payment.id,
      amount_cents: payment.amount_cents,
      amount_formatted: amountNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      due_date: payment.due_date ? String(payment.due_date).split('T')[0] : null,
      plan_name: payment.plan_name || 'Mensalidade',
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
        method_label: 'Pix',
        receipt_number: settled.receipt?.receipt_number,
        amount_cents: settled.payment.amount_cents
      });
    } catch (err) {
      return send(res, err.statusCode || 500, { error: err.message });
    }
  }

  return false;
}

module.exports = { handleStudentInvoiceRoutes };
