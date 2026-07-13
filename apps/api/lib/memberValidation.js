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

function validPhone(value, countryCode = '+55') {
  const number = digits(value, 24);
  if (!number) return true;
  return countryCode === '+55' ? number.length === 11 : number.length >= 6 && number.length <= 15;
}

module.exports = { digits, nullable, validEmail, validPhone };
