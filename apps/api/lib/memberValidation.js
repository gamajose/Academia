function digits(value, max = 64) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}

function nullable(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function validEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

module.exports = { digits, nullable, validEmail };
