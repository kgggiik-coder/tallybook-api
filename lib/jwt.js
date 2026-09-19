const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Fail loudly at boot rather than silently signing tokens with `undefined`.
  throw new Error("JWT_SECRET env var is required");
}

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET); // throws if invalid/expired
}

module.exports = { signToken, verifyToken };
