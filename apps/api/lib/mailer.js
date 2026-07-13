const nodemailer = require('nodemailer');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
}

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const rawPassword = String(process.env.SMTP_PASS || '');
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: isTruthy(process.env.SMTP_SECURE) || Number(process.env.SMTP_PORT || 0) === 465,
    user: String(process.env.SMTP_USER || '').trim(),
    // O Google exibe a senha de app em quatro blocos; os espacos nao fazem parte dela.
    pass: /^smtp\.gmail\.com$/i.test(host) ? rawPassword.replace(/\s+/g, '') : rawPassword
  };
}

function smtpConfigured(config = smtpConfig()) {
  return Boolean(config.host && config.user && config.pass && Number.isInteger(config.port) && config.port > 0);
}

async function sendByWebhook(webhook, message) {
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      console.warn(`[mailer] webhook retornou ${response.status}`);
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (error) {
    console.warn(`[mailer] falha ao enviar pelo webhook: ${error.message}`);
    return { sent: false, reason: 'provider_unreachable' };
  }
}

async function sendTransactionalEmail({ to, subject, text, html }) {
  const webhook = String(process.env.EMAIL_WEBHOOK_URL || '').trim();
  const config = smtpConfig();
  const message = {
    to,
    from: process.env.EMAIL_FROM || config.user || undefined,
    subject,
    text,
    html
  };

  if (webhook) return sendByWebhook(webhook, message);

  if (!smtpConfigured(config)) {
    console.warn('[mailer] SMTP nao configurado; mensagem pendente');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });

    const info = await transporter.sendMail(message);
    return { sent: true, message_id: info.messageId };
  } catch (error) {
    console.warn(`[mailer] falha ao enviar por SMTP: ${error.message}`);
    return { sent: false, reason: 'provider_unreachable' };
  }
}

module.exports = { sendTransactionalEmail, smtpConfigured };
