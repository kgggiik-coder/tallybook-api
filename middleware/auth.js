const { verifyToken } = require("../lib/jwt");
const prisma = require("../lib/prisma");

/**
 * Verifies the Bearer JWT, then loads the current user's role and
 * permission flags fresh from the database on every request (rather than
 * trusting whatever was true when the token was issued). That's what makes
 * a permission change or a staff removal take effect immediately, instead
 * of waiting for a 7-day-old token to expire.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.businessId !== payload.businessId) {
    return res.status(401).json({ error: "Account no longer exists or has changed" });
  }

  req.userId = user.id;
  req.businessId = user.businessId;
  req.currentUser = user; // role + permission flags, used by middleware/permissions.js
  next();
}

module.exports = { requireAuth };
