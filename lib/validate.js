const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

// Trims a string and caps its length. Returns null for anything that isn't
// a non-empty string, so callers can distinguish "missing" from "provided
// but blank" with a single check.
function cleanString(value, { maxLength = 200 } = {}) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

// Accepts a finite, non-negative number under a sane ceiling — guards
// against NaN, Infinity, negative amounts, or a client sending an absurd
// value that would otherwise reach the database unchecked.
function isValidMoney(value, { max = 1000000 } = {}) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max;
}

function isValidDate(value) {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

module.exports = { isValidEmail, cleanString, isValidMoney, isValidDate };
