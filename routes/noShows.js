const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../lib/asyncHandler");

const router = express.Router();
router.use(requireAuth);
// No-show tracking is inherently financial (loss rates, dollars lost), so
// the whole route is gated rather than masking individual fields.
router.use(requirePermission("canViewFinancials"));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// GET /api/no-shows/history?days=7
// Day-by-day loss rate for the trailing N days — feeds the dashboard's
// "loss rate, last 7 days" bar chart.
// ---------------------------------------------------------------------------
router.get("/history", asyncHandler(async (req, res) => {
  const requestedDays = Number(req.query.days);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 90) : 7;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const results = [];

  // A simple day-by-day loop keeps this readable; swap for a single
  // raw SQL GROUP BY date_trunc('day', start_time) query if this list
  // ever needs to cover a much longer range.
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - i);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const appointments = await prisma.appointment.findMany({
      where: { businessId: req.businessId, startTime: { gte: start, lt: end } },
      select: { status: true },
    });

    const total = appointments.length;
    const lost = appointments.filter((a) => a.status === "NOSHOW" || a.status === "CANCELLED").length;

    results.push({
      date: start.toISOString().slice(0, 10),
      day: start.toLocaleDateString("en-US", { weekday: "short" }),
      rate: total ? Math.round((lost / total) * 100) : 0,
    });
  }

  res.json(results);
}));

// ---------------------------------------------------------------------------
// GET /api/no-shows?date=YYYY-MM-DD
// Lists the individual no-show/cancellation records for a day, with the
// client and appointment attached — useful for a "who bailed today" list.
// ---------------------------------------------------------------------------
router.get("/", asyncHandler(async (req, res) => {
  const { date } = req.query;

  const where = { businessId: req.businessId };
  if (date) {
    if (!DATE_RE.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    where.recordedAt = { gte: start, lt: end };
  }

  const records = await prisma.noShowRecord.findMany({
    where,
    include: { appointment: true, client: true },
    orderBy: { recordedAt: "desc" },
  });

  res.json(records);
}));

module.exports = router;
