/**
 * Gerador de Pix Copia e Cola no padrão BACEN / EMVCo BR Code
 */
(function () {
  function formatField(id, value) {
    const str = String(value || '');
    const len = str.length.toString().padStart(2, '0');
    return `${id}${len}${str}`;
  }

  function crc16(payload) {
    let crc = 0xffff;
    const polynomial = 0x1021;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ polynomial) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function cleanString(str, maxLen = 25) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .slice(0, maxLen);
  }

  function generatePixPayload({
    pixKey,
    merchantName = 'ACADEMIA',
    merchantCity = 'BRASIL',
    amount = 0,
    txid = '***'
  }) {
    const key = String(pixKey || '').trim();
    if (!key) return '';

    // 00: Payload Format Indicator (01)
    let payload = formatField('00', '01');

    // 26: Merchant Account Information
    //   00: GUI (br.gov.bcb.pix)
    //   01: Chave Pix
    const gui = formatField('00', 'br.gov.bcb.pix');
    const chave = formatField('01', key);
    payload += formatField('26', gui + chave);

    // 52: Merchant Category Code (0000 = Geral)
    payload += formatField('52', '0000');

    // 53: Transaction Currency (986 = BRL)
    payload += formatField('53', '986');

    // 54: Transaction Amount
    if (amount && Number(amount) > 0) {
      payload += formatField('54', Number(amount).toFixed(2));
    }

    // 58: Country Code (BR)
    payload += formatField('58', 'BR');

    // 59: Merchant Name
    payload += formatField('59', cleanString(merchantName, 25) || 'ACADEMIA');

    // 60: Merchant City
    payload += formatField('60', cleanString(merchantCity, 15) || 'BRASIL');

    // 62: Additional Data Field Template (txid)
    const tx = formatField('05', cleanString(txid, 25) || '***');
    payload += formatField('62', tx);

    // 63: CRC16 (Tag 63 + tamanho 04 + valor calculado)
    payload += '6304';
    payload += crc16(payload);

    return payload;
  }

  window.AcademiaPix = {
    generatePixPayload,
    crc16
  };
})();
