const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

const { handleGymRoutes } = require('../features/gymRoutes');

test('handleGymRoutes handles payment-settings GET', async () => {
  let sentStatus = null;
  let sentData = null;
  const helpers = {
    send: (res, status, data) => { sentStatus = status; sentData = data; return true; },
    body: async () => ({}),
    query: async (sql, params) => {
      return {
        rowCount: 1,
        rows: [{
          pix_key: 'financeiro@academia.com',
          payment_settings: {
            pix: { key: 'financeiro@academia.com', bank: 'Nubank' },
            card: { provider: 'mercadopago' }
          }
        }]
      };
    }
  };

  const req = { method: 'GET' };
  const user = { gym_id: 'gym-123', role: 'admin' };
  const url = new URL('http://localhost/api/gym/payment-settings');
  const handled = await handleGymRoutes(req, {}, user, url, helpers);
  assert.equal(handled, true);
  assert.equal(sentStatus, 200);
  assert.equal(sentData.pix_key, 'financeiro@academia.com');
  assert.equal(sentData.payment_settings.pix.bank, 'Nubank');
});

test('handleGymRoutes handles payment-settings PUT', async () => {
  let sentStatus = null;
  let sentData = null;
  const helpers = {
    send: (res, status, data) => { sentStatus = status; sentData = data; return true; },
    body: async () => ({
      payment_settings: {
        pix: { key: '12345678000199', receiver_name: 'Minha Academia' },
        card: { provider: 'stripe' }
      }
    }),
    query: async (sql, params) => {
      return {
        rowCount: 1,
        rows: [{
          pix_key: '12345678000199',
          payment_settings: {
            pix: { key: '12345678000199', receiver_name: 'Minha Academia' },
            card: { provider: 'stripe' }
          }
        }]
      };
    }
  };

  const req = { method: 'PUT' };
  const user = { gym_id: 'gym-123', role: 'admin' };
  const url = new URL('http://localhost/api/gym/payment-settings');
  const handled = await handleGymRoutes(req, {}, user, url, helpers);
  assert.equal(handled, true);
  assert.equal(sentStatus, 200);
  assert.equal(sentData.pix_key, '12345678000199');
  assert.equal(sentData.payment_settings.pix.receiver_name, 'Minha Academia');
});
