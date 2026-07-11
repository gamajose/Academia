const allowedOrigins = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const requestBuckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function applySecurityHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

function isOriginAllowed(req) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins.size === 0 || allowedOrigins.has(origin);
}

function consumeRateLimit(req, key, options = {}) {
  const max = Number(options.max || 10);
  const windowMs = Number(options.windowMs || 15 * 60 * 1000);
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const current = requestBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    requestBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  current.count += 1;
  if (current.count > max) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  return { allowed: true, remaining: max - current.count, resetAt: current.resetAt };
}

module.exports = { applySecurityHeaders, isOriginAllowed, consumeRateLimit };
