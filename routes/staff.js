const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../lib/asyncHandler");
const { isValidEmail, cleanString } = require("../lib/validate");

const router = express.Router();
router.use(requireAuth);

const ROLES = ["OWNER", "MANAGER", "STAFF"];
const PERMISSION_KEYS = ["canViewFinancials", "canManageBilling", "canManageStaff", "canManageSchedule"];

// Sensible starting permissions per role — the owner can still hand-tune
// any individual flag afterward via PATCH.
const ROLE_DEFAULTS = {
  MANAGER: { canViewFinancials: true, canManageBilling: false, canManageStaff: true, canManageSchedule: true },
  STAFF: { canViewFinancials: false, canManageBilling: false, canManageStaff: false, canManageSchedule: true },
};

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// Prevents a business from ending up with zero owners, whether via a role
// change or a delete. Returns true (and sends the 400) if the action is
// blocked; the "returns true when blocked" shape keeps both call sites short.
async function guardLastOwner(businessId, excludingUserId, res) {
  const remainingOwners = await prisma.user.count({
    where: { businessId, role: "OWNER", id: { not: excludingUserId } },
  });
  if (remainingOwners === 0) {
    res.status(400).json({ error: "A business must always have at least one owner" });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /api/staff
// ---------------------------------------------------------------------------
router.get("/", requirePermission("canManageStaff"), asyncHandler(async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { businessId: req.businessId },
    orderBy: { createdAt: "asc" },
  });
  res.json(staff.map(publicUser));
}));

// ---------------------------------------------------------------------------
// POST /api/staff
// Adds a teammate directly with a generated temporary password (simplest
// MVP flow — no email service wired up yet). Swap this for an email-based
// invite token once transactional email is in place; the shape of the
// response (a one-time credential to hand the new hire) stays useful either
// way as a fallback for owners without a mail integration.
// ---------------------------------------------------------------------------
router.post("/", requirePermission("canManageStaff"), asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, { maxLength: 200 });
  const email = cleanString(req.body.email, { maxLength: 254 })?.toLowerCase();
  const { role } = req.body;

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!isValidEmail(email)) return res.status(400).json({ error: "A valid email is required" });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
  if (role === "OWNER") return res.status(403).json({ error: "Use account transfer to add another owner, not this endpoint" });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "That email is already in use" });

  const tempPassword = crypto.randomBytes(9).toString("base64url"); // shown once, below
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const created = await prisma.user.create({
    data: {
      businessId: req.businessId,
      name,
      email,
      passwordHash,
      role,
      ...ROLE_DEFAULTS[role],
    },
  });

  res.status(201).json({ user: publicUser(created), tempPassword });
}));

// ---------------------------------------------------------------------------
// PATCH /api/staff/:id
// Updates a teammate's role and/or individual permission flags.
// ---------------------------------------------------------------------------
router.patch("/:id", requirePermission("canManageStaff"), asyncHandler(async (req, res) => {
  const target = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!target) return res.status(404).json({ error: "Team member not found" });

  const { role, ...flags } = req.body;
  const data = {};

  if (role !== undefined) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
    if (target.role === "OWNER" && role !== "OWNER") {
      const blocked = await guardLastOwner(req.businessId, target.id, res);
      if (blocked) return; // response already sent
    }
    data.role = role;
  }

  for (const key of PERMISSION_KEYS) {
    if (typeof flags[key] === "boolean") data[key] = flags[key];
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data });
  res.json(publicUser(updated));
}));

// ---------------------------------------------------------------------------
// DELETE /api/staff/:id
// ---------------------------------------------------------------------------
router.delete("/:id", requirePermission("canManageStaff"), asyncHandler(async (req, res) => {
  const target = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!target) return res.status(404).json({ error: "Team member not found" });

  if (target.id === req.userId) return res.status(400).json({ error: "You can't remove your own account here" });
  if (target.role === "OWNER")
