const QRCode = require('qrcode');
const { generatePixPayload } = require('../lib/pixUtils');
const { settleInvoicePayment } = require('../lib/invoicePayment');
const { sendWhatsAppMessage } = require('../lib/whatsappGateway');
const { pool, query } = require('../lib/db');
const { recordAudit } = require('../lib/audit');

function toIsoDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
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

function formatBrDate(isoOrDateStr) {
  if (!isoOrDateStr) return '-';
  const iso = toIsoDate(isoOrDateStr);
  if (!iso) return '-';
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getPublicAppUrl() {
  const envUrl = process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL;
  if (envUrl && !envUrl.includes('192.168.3.200') && !envUrl.includes('127.0.0.1') && !envUrl.includes('localhost')) {
    return envUrl.replace(/\/$/, '');
  }
  return 'http://45.162.245.7:8084';
}

async function handlePublicInvoiceRoutes(req, res, user, url, helpers) {
  const { send } = helpers;
  const dbQuery = helpers.query || query;

  // 1. GET /api/public/invoices/:id - Consulta pública da fatura pelo ID (sem login)
  const publicMatch = url.pathname.match(/^\/api\/public\/invoices\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?$/);
  if (publicMatch) {
    const paymentId = publicMatch[1];
    const action = publicMatch[2] || '';

    if (req.method === 'GET' && !action) {
      const paymentRes = await dbQuery(
        `SELECT p.id, p.gym_id, p.member_id, p.membership_id, p.amount_cents, p.original_amount_cents,
                p.discount_cents, p.fee_cents, p.status, p.due_date::text AS due_date, p.paid_at,
                p.method, p.notes, p.created_at,
                m.name AS member_name, m.phone AS member_phone, m.email AS member_email,
                pl.name AS plan_name, pl.price_cents AS plan_price,
                g.name AS gym_name, g.phone AS gym_phone, g.pix_key, g.payment_settings,
                r.receipt_number
         FROM payments p
         INNER JOIN members m ON m.id = p.member_id
         LEFT JOIN memberships ms ON ms.id = p.membership_id
         LEFT JOIN plans pl ON pl.id = ms.plan_id
         LEFT JOIN gyms g ON g.id = p.gym_id
         LEFT JOIN payment_receipts r ON r.payment_id = p.id
         WHERE p.id = $1
         LIMIT 1`,
        [paymentId]
      );

      if (!paymentRes.rowCount) {
        return send(res, 404, { error: 'fatura_nao_encontrada', message: 'Fatura não encontrada.' });
      }

      const row = paymentRes.rows[0];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueDateIso = toIsoDate(row.due_date);
      const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00`) : null;

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
      const dueDateFormatted = formatBrDate(dueDateIso);
      const paidAtFormatted = row.paid_at ? formatBrDate(row.paid_at) : null;

      // Configuração Pix da academia
      const paymentSettings = row.payment_settings || {};
      const pixSettings = paymentSettings.pix || {};
      const pixKey = row.pix_key || pixSettings.key || process.env.DEFAULT_PIX_KEY || 'financeiro@academialobo.com.br';
      const receiverName = pixSettings.receiver_name || row.gym_name || 'Academia LOBO';
      const city = pixSettings.city || 'SAO PAULO';

      let pixPayload = null;
      let qrDataUrl = null;

      if (pixKey && (effectiveStatus === 'pending' || effectiveStatus === 'overdue')) {
        const txid = `FAT${row.id.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25);
        try {
          pixPayload = generatePixPayload({
            pixKey,
            merchantName: receiverName,
            merchantCity: city,
            amount: amountNumber,
            txid
          });

          qrDataUrl = await QRCode.toDataURL(pixPayload, {
            margin: 2,
            scale: 6,
            color: { dark: '#0f172a', light: '#ffffff' }
          });
        } catch (_) {}
      }

      const publicUrl = `${getPublicAppUrl()}/fatura.html?id=${row.id}`;

      return send(res, 200, {
        id: row.id,
        status: effectiveStatus,
        is_paid: effectiveStatus === 'paid',
        is_overdue: isOverdue,
        days_overdue: daysOverdue,
        amount_cents: Number(row.amount_cents),
        amount_formatted: amountFormatted,
        due_date: dueDateIso,
        due_date_formatted: dueDateFormatted,
        paid_at: row.paid_at,
        paid_at_formatted: paidAtFormatted,
        member_name: row.member_name,
        member_phone: row.member_phone,
        plan_name: row.plan_name || 'Plano Mensal',
        gym_name: row.gym_name || 'Academia LOBO',
        gym_phone: row.gym_phone || '',
        notes: row.notes || 'Mensalidade da academia',
        receipt_number: row.receipt_number || null,
        pix_key: pixKey,
        pix_receiver_name: receiverName,
        pix_payload: pixPayload,
        qr_data_url: qrDataUrl,
        public_url: publicUrl
      });
    }

    // 2. POST /api/public/invoices/:id/confirm-pix - Validação automática do Pix público pelo aluno
    if (req.method === 'POST' && action === 'confirm-pix') {
      try {
        const settled = await settleInvoicePayment({
          pool,
          paymentId,
          method: 'pix',
          notes: 'Pix validado automaticamente pelo link público da fatura'
        });

        return send(res, 200, {
          success: true,
          status: 'paid',
          is_paid: true,
          paid_at: settled.payment.paid_at,
          paid_at_formatted: formatBrDate(settled.payment.paid_at),
          receipt_number: settled.receipt?.receipt_number,
          amount_cents: settled.payment.amount_cents,
          message: 'Pagamento confirmado com sucesso!'
        });
      } catch (err) {
        return send(res, err.statusCode || 500, { error: err.message });
      }
    }
  }

  // 3. POST /api/finance/invoices/:id/send-whatsapp - Disparo automático da academia para o aluno
  const adminWaMatch = url.pathname.match(/^\/api\/finance\/invoices\/([a-zA-Z0-9_-]+)\/send-whatsapp$/);
  if (adminWaMatch && req.method === 'POST') {
    if (!user) return false;

    const paymentId = adminWaMatch[1];
    const paymentRes = await dbQuery(
      `SELECT p.id, p.amount_cents, p.due_date::text AS due_date, p.status, p.paid_at,
              m.name AS member_name, m.phone AS member_phone,
              pl.name AS plan_name,
              g.name AS gym_name, g.phone AS gym_phone, g.pix_key, g.payment_settings
       FROM payments p
       INNER JOIN members m ON m.id = p.member_id
       LEFT JOIN memberships ms ON ms.id = p.membership_id
       LEFT JOIN plans pl ON pl.id = ms.plan_id
       LEFT JOIN gyms g ON g.id = p.gym_id
       WHERE p.id = $1 AND p.gym_id = $2
       LIMIT 1`,
      [paymentId, user.gym_id]
    );

    if (!paymentRes.rowCount) {
      return send(res, 404, { error: 'fatura_nao_encontrada' });
    }

    const payment = paymentRes.rows[0];
    const memberPhone = payment.member_phone || '';
    if (!memberPhone) {
      return send(res, 400, {
        error: 'aluno_sem_telefone',
        message: `O aluno ${payment.member_name} não possui telefone/WhatsApp cadastrado.`
      });
    }

    const publicAppUrl = getPublicAppUrl();
    const invoicePublicUrl = `${publicAppUrl}/fatura.html?id=${payment.id}`;

    const amountNumber = Number(payment.amount_cents) / 100;
    const amountFormatted = amountNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dueDateFormatted = formatBrDate(payment.due_date);

    const paymentSettings = payment.payment_settings || {};
    const pixSettings = paymentSettings.pix || {};
    const pixKey = payment.pix_key || pixSettings.key || process.env.DEFAULT_PIX_KEY || 'financeiro@academialobo.com.br';
    const receiverName = pixSettings.receiver_name || payment.gym_name || 'Academia LOBO';
    const city = pixSettings.city || 'SAO PAULO';

    let pixPayload = null;
    if (pixKey) {
      const txid = `FAT${payment.id.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25);
      try {
        pixPayload = generatePixPayload({
          pixKey,
          merchantName: receiverName,
          merchantCity: city,
          amount: amountNumber,
          txid
        });
      } catch (_) {}
    }

    let pixBlock = '';
    if (pixPayload) {
      pixBlock =
        `⚡ *PAGAMENTO VIA PIX (Online e Instantâneo):*\n` +
        `Você pode pagar com o Pix Copia e Cola abaixo pelo app do seu banco. A baixa é validada *automaticamente na hora*:\n\n` +
        `\`\`\`${pixPayload}\`\`\`\n\n`;
    }

    const isOverdue = payment.due_date && new Date(`${payment.due_date}T00:00:00`) < new Date();
    const statusText = isOverdue ? '⚠️ *EM ATRASO*' : '⏳ *Disponível para pagamento*';

    const message =
      `*${payment.gym_name || 'Academia LOBO'} - Fatura de Mensalidade* 🐺\n\n` +
      `Olá, *${payment.member_name || 'Aluno'}*!\n\n` +
      `Sua fatura de mensalidade (*${payment.plan_name || 'Plano Mensal'}*) está disponível:\n\n` +
      `💰 *Valor:* ${amountFormatted}\n` +
      `📅 *Vencimento:* ${dueDateFormatted}\n` +
      `📌 *Situação:* ${statusText}\n\n` +
      pixBlock +
      `🌐 *Ver fatura completa online com QR Code e recibo (sem precisar logar):*\n` +
      `${invoicePublicUrl}\n\n` +
      `💵 *PAGAMENTO NA RECEPÇÃO:*\n` +
      `Se preferir, pague diretamente no balcão da academia em dinheiro ou cartão.\n\n` +
      `_Mensagem automática enviada pela Academia LOBO._`;

    // Dispara via Gateway de WhatsApp
    const sendResult = await sendWhatsAppMessage({
      phone: memberPhone,
      message,
      gymId: user.gym_id
    });

    const cleanDest = String(memberPhone).replace(/\D/g, '');
    const waPhone = cleanDest.startsWith('55') ? cleanDest : `55${cleanDest}`;
    const fallbackUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(message)}`;

    if (sendResult.delivered) {
      await recordAudit(user, 'send_invoice_whatsapp', 'payment', payment.id, {
        phone: memberPhone,
        delivered: true
      });

      return send(res, 200, {
        success: true,
        delivered: true,
        gateway_configured: true,
        phone: memberPhone,
        message: `Fatura enviada com sucesso para o WhatsApp de ${payment.member_name}!`
      });
    }

    return send(res, 200, {
      success: true,
      delivered: false,
      gateway_configured: sendResult.gateway_configured,
      phone: memberPhone,
      message: sendResult.message || 'Gateway de WhatsApp não conectado. O disparo manual via link está disponível.',
      text: message,
      fallback_url: fallbackUrl,
      invoice_url: invoicePublicUrl
    });
  }

  return false;
}

module.exports = {
  handlePublicInvoiceRoutes,
  getPublicAppUrl
};
