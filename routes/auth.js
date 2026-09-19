const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { signToken } = require("../lib/jwt");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../lib/asyncHandler");
const { isValidEmail, cleanString } = require("../lib/validate");

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    canViewFinancials: u.canViewFinancials, canManageBilling: u.canManageBilling,
    canManageStaff: u.canManageStaff, canManageSchedule: u.canManageSchedule,
  };
}

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// Creates a new Business plus its first User (the owner) in one transaction,
// so you never end up with a business that has no one able to log into it.
// ---------------------------------------------------------------------------
router.post("/signup", asyncHandler(async (req, res) => {
  const businessName = cleanString(req.body.businessName, { maxLength: 200 });
  const name = cleanString(req.body.name, { maxLength: 200 });
  const email = cleanString(req.body.email, { maxLength: 254 })?.toLowerCase();
  const { password } = req.body;

  if (!businessName || !name) {
    return res.status(400).json({ error: "businessName and name are required" });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required" });
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);

  const { business, user } = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({ data: { name: businessName } });
    const user = await tx.user.create({
      data: {
        businessId: business.id, name, email, passwordHash, role: "OWNER",
        // Not load-bearing (OWNER bypasses every check in middleware/permissions.js),
        // but keeps the stored record consistent with what the frontend reads.
        canViewFinancials: true, canManageBilling: true, canManageStaff: true, canManageSchedule: true,
      },
    });
    return { business, user };
  });

  const token = signToken({ userId: user.id, businessId: business.id });

  res.status(201).json({
    token,
    user: publicUser(user),
    business: { id: business.id, name: business.name },
  });
}));

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", asyncHandler(async (req, res) => {
  const email = cleanString(req.body.email, { maxLength: 254 })?.toLowerCase();
  const { password } = req.body;

  // Same error for "missing fields", "no such user", and "wrong password"
  // so login can't be used to enumerate which emails have accounts.
  const invalid = () => res.status(401).json({ error: "Invalid email or password" });
  if (!email || typeof password !== "string") return invalid();

  const user = await prisma.user.findUnique({ where: { email }, include: { business: true } });
  if (!user) return invalid();

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return invalid();

  const token = signToken({ userId: user.id, businessId: user.businessId });

  res.json({
    token,
    user: publicUser(user),
    business: { id: user.business.id, name: user.business.name },
  });
}));

// ---------------------------------------------------------------------------
// GET /api/auth/me
// Lets the frontend re-hydrate the logged-in user on load, given a stored
// token, without asking the person to log in again on every page refresh.
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { business: true } });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    user: publicUser(user),
    business: { id: user.business.id, name: user.business.name },
  });
}));

module.exports = router;
