const crypto = require('crypto');

const secret = String(process.env.AUTH_SECRET || '');
const tokenTtlMs = Number(process.env.AUTH_TOKEN_TTL_MS || 8 * 60 * 60 * 1000);
const isProduction = process.env.NODE_ENV === 'production';
const passwordIterations = 210000;

if (!secret || secret.length < 32) {
  const message = 'AUTH_SECRET deve possuir pelo menos 32 caracteres';
  if (isProduction) throw new Error(message);
  console.warn(`[security] ${message}. Ambiente nao produtivo.`);
}

function derivePassword(password, salt, iterations) {
  return crypto.pbkdf2Sync(String(password || ''), salt, iterations, 64, 'sha512').toString('hex');
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = derivePassword(password, salt, passwordIterations);
  return `pbkdf2$${passwordIterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored) return false;

    if (stored.startsWith('pbkdf2$')) {
      const [, iterationsText, salt, original] = stored.split('$');
      const iterations = Number(iterationsText);
      if (!iterations || !salt || !original) return false;
      return safeEqualText(derivePassword(password, salt, iterations), original);
    }

    if (stored.includes(':')) {
      const [salt, original] = stored.split(':');
      return safeEqualText(derivePassword(password, salt, 100000), original);
    }

    return false;
  } catch (_) {
    return false;
  }
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return { valid: false, error: 'senha_muito_curta' };
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return { valid: false, error: 'senha_fraca' };
  }
  return { valid: true };
}

function signingSecret() {
  return secret || 'development-only-secret-not-for-production';
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + tokenTtlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
    if (!safeEqualText(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
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
