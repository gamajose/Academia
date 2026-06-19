const crypto = require('crypto');

const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
const tokenTtlMs = Number(process.env.AUTH_TOKEN_TTL_MS || 8 * 60 * 60 * 1000);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [salt, original] = stored.split(':');
    const hash = crypto.pbkdf2Sync(String(password || ''), salt, 100000, 64, 'sha512').toString('hex');
    const a = Buffer.from(hash);
    const b = Buffer.from(original);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return { valid: false, error: 'senha_muito_curta' };
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return { valid: false, error: 'senha_fraca' };
  return { valid: true };
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + tokenTtlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = { hashPassword, verifyPassword, validatePassword, signToken, verifyToken, randomToken, hashToken };
