const rateLimit = require("express-rate-limit");

// Applies to every request. Generous enough not to interfere with normal
// use, tight enough to blunt a scripted flood or a runaway client bug.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a few minutes." },
});

// Login/signup are the obvious brute-force target (password guessing,
// account enumeration), so they get a much tighter limit than the rest
// of the API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

module.exports = { generalLimiter, authLimiter };
