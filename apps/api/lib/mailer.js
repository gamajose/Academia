async function sendTransactionalEmail({ to, subject, text, html }) {
  const webhook = String(process.env.EMAIL_WEBHOOK_URL || '').trim();
  if (!webhook) {
    console.warn(`[mailer] EMAIL_WEBHOOK_URL nao configurado; mensagem pendente para ${to}`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from: process.env.EMAIL_FROM || undefined,
        subject,
        text,
        html
      })
    });

    if (!response.ok) {
      console.warn(`[mailer] webhook retornou ${response.status}`);
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (error) {
    console.warn(`[mailer] falha ao enviar: ${error.message}`);
    return { sent: false, reason: 'provider_unreachable' };
  }
}

module.exports = { sendTransactionalEmail };
