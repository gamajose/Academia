const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('seed de demonstração não imprime login ou senha nos logs de deploy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'seed-demo.js'), 'utf8');
  assert.doesNotMatch(source, /demo_(?:login|password)\s*:/i);
  assert.doesNotMatch(source, /console\.log\([^)]*DEMO_PASSWORD/s);
});
