/**
 * whatsappGateway.js
 * Gateway de envio automático de mensagens WhatsApp
 * Suporta Evolution API, Z-API e Webhook HTTP genérico
 */

async function sendWhatsAppMessage({ phone, message, gymId = null }) {
  const apiUrl = String(process.env.WHATSAPP_API_URL || '').trim();
  const apiKey = String(process.env.WHATSAPP_API_KEY || '').trim();
  const instance = String(process.env.WHATSAPP_INSTANCE || 'academia').trim();

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    return {
      success: false,
      delivered: false,
      error: 'telefone_invalido',
      message: 'Telefone do destinatário não informado ou inválido.'
    };
  }

  const destination = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  if (!apiUrl) {
    return {
      success: true,
      delivered: false,
      gateway_configured: false,
      phone: destination,
      message: 'Gateway de WhatsApp automático ainda não configurado (adicione WHATSAPP_API_URL no .env).'
    };
  }

  try {
    let targetUrl = apiUrl;
    let payload = {};
    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['apikey'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['Client-Token'] = apiKey;
    }

    if (apiUrl.includes('/message/sendText') || apiUrl.includes(':8080') || apiUrl.includes('/instance/')) {
      // Formato Evolution API
      if (!targetUrl.includes('/message/sendText')) {
        targetUrl = `${targetUrl.replace(/\/$/, '')}/message/sendText/${instance}`;
      }
      payload = {
        number: destination,
        text: message
      };
    } else if (apiUrl.includes('z-api.io')) {
      // Formato Z-API
      if (!targetUrl.includes('/send-text')) {
        targetUrl = `${targetUrl.replace(/\/$/, '')}/send-text`;
      }
      payload = {
        phone: destination,
        message: message
      };
    } else {
      // Formato Webhook genérico
      payload = {
        destination,
        phone: destination,
        number: destination,
        message,
        text: message,
        gym_id: gymId
      };
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return {
        success: false,
        delivered: false,
        gateway_configured: true,
        status: response.status,
        error: `Falha no Gateway de WhatsApp: HTTP ${response.status} - ${errBody.slice(0, 200)}`
      };
    }

    const resData = await response.json().catch(() => ({}));
    return {
      success: true,
      delivered: true,
      gateway_configured: true,
      phone: destination,
      data: resData
    };
  } catch (err) {
    return {
      success: false,
      delivered: false,
      gateway_configured: true,
      error: `Erro ao conectar com Gateway de WhatsApp: ${err.message}`
    };
  }
}

module.exports = {
  sendWhatsAppMessage
};
