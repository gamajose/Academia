const test = require('node:test');
const assert = require('node:assert/strict');
const { handleOmnisearchRoutes } = require('../features/omnisearchRoutes');

test('omnisearch retorna vazio quando busca nao tem termo', async () => {
  const helpers = {
    send: (_res, status, payload) => ({ status, payload }),
    body: async () => ({}),
    query: async () => ({ rows: [] })
  };
  const url = new URL('http://localhost/api/admin/omnisearch');
  const res = await handleOmnisearchRoutes({ method: 'GET' }, {}, { gym_id: 'gym-1' }, url, helpers);
  assert.equal(res.status, 200);
  assert.deepEqual(res.payload, { members: [], exercises: [], plans: [] });
});

test('omnisearch rejeita usuario sem academia vinculada', async () => {
  const helpers = { send: () => {}, body: async () => ({}), query: async () => ({}) };
  const url = new URL('http://localhost/api/admin/omnisearch?q=jose');
  const res = await handleOmnisearchRoutes({ method: 'GET' }, {}, null, url, helpers);
  assert.equal(res, false);
});

test('checkin rapido exige aluno informado', async () => {
  const helpers = {
    send: (_res, status, payload) => ({ status, payload }),
    body: async () => ({ query: '' }),
    query: async () => ({ rows: [] })
  };
  const url = new URL('http://localhost/api/checkins/quick');
  const res = await handleOmnisearchRoutes({ method: 'POST' }, {}, { gym_id: 'gym-1', sub: 'user-1' }, url, helpers);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'informe_aluno');
});
