/**
 * Permission gates. Must run after requireAuth, which attaches
 * req.currentUser (the fresh User record, including role + flags).
 *
 * OWNER always passes every check — it's not just "OWNER has all flags set
 * to true", it's structurally exempt, so an owner can never accidentally
 * lock themselves out by fat-fingering their own permission flags.
 */

function requirePermission(flag) {
  return (req, res, next) => {
    const user = req.currentUser;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (user.role === "OWNER" || user[flag]) return next();
    return res.status(403).json({ error: "You don't have permission to do that" });
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.currentUser;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (user.role === "OWNER" || roles.includes(user.role)) return next();
    return res.status(403).json({ error: "You don't have permission to do that" });
  };
}

module.exports = { requirePermission, requireRole };
