const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../lib/asyncHandler");
const { cleanString, isValidMoney, isValidDate } = require("../lib/validate");

const router = express.Router();
router.use(requireAuth);

const APPOINTMENT_STATUSES = ["BOOKED", "DONE", "NOSHOW", "CANCELLED"];
const LOSS_STATUSES = ["NOSHOW", "CANCELLED"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Staff without canViewFinancials can still see and manage the schedule —
// they just don't see dollar amounts. Rather than a second endpoint, we
// strip the field at the response boundary so the frontend can render the
// same list either way; it just won't have `value` to show.
function canSeeMoney(user) {
  return user.role === "OWNER" || user.canViewFinancials;
}
function maskValue(appointment, user) {
  if (canSeeMoney(user)) return appointment;
  const { value, ...rest } = appointment;
  return rest;
}

// Returns the [start, end) UTC range covering a given YYYY-MM-DD, or null
// if the string isn't actually a valid calendar date — callers must check
// for null rather than silently querying with an Invalid Date, which would
// otherwise just return an empty (and misleadingly "correct") result set.
// Swap this for a timezone-aware range (e.g. with `luxon`, using the
// business's stored timezone) once appointments span multiple timezones.
function dayRange(dateStr) {
  if (typeof dateStr !== "string" || !DATE_RE.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// ---------------------------------------------------------------------------
// GET /api/appointments?date=YYYY-MM-DD
// Lists a business's appointments for a single day, earliest first.
// ---------------------------------------------------------------------------
router.get("/", asyncHandler(async (req, res) => {
  const range = dayRange(req.query.date);
  if (!range) return res.status(400).json({ error: "date query param is required and must be YYYY-MM-DD" });

  const appointments = await prisma.appointment.findMany({
    where: { businessId: req.businessId, startTime: { gte: range.start, lt: range.end } },
    include: { client: true, staff: true },
    orderBy: { startTime: "asc" },
  });

  res.json(appointments.map((a) => maskValue(a, req.currentUser)));
}));

// ---------------------------------------------------------------------------
// POST /api/appointments
// Creates an appointment, reusing an existing client if the name matches
// one already on file for this business, otherwise creating one.
// ---------------------------------------------------------------------------
router.post("/", asyncHandler(async (req, res) => {
  const clientName = cleanString(req.body.clientName, { maxLength: 200 });
  const service = cleanString(req.body.service, { maxLength: 200 }) || "";
  const clientEmail = req.body.clientEmail ? cleanString(req.body.clientEmail, { maxLength: 254 }) : null;
  const clientPhone = req.body.clientPhone ? cleanString(req.body.clientPhone, { maxLength: 40 }) : null;
  const { staffId, startTime, endTime, value } = req.body;

  if (!clientName) return res.status(400).json({ error: "clientName is required" });
  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return res.status(400).json({ error: "startTime and endTime must be valid dates" });
  }
  if (!isValidMoney(value)) return res.status(400).json({ error: "value must be a number between 0 and 1,000,000" });

  let client = await prisma.client.findFirst({
    where: { businessId: req.businessId, name: clientName },
  });

  if (!client) {
    client = await prisma.client.create({
      data: { businessId: req.businessId, name: clientName, email: clientEmail, phone: clientPhone },
    });
  }

  const appointment = await prisma.appointment.create({
    data: {
      businessId: req.businessId,
      clientId: client.id,
      staffId: staffId || null,
      service,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      value: Number(value),
      status: "BOOKED",
    },
    include: { client: true, staff: true },
  });

  res.status(201).json(maskValue(appointment, req.currentUser));
}));

// ---------------------------------------------------------------------------
// PATCH /api/appointments/:id/status
// Moves an appointment to a new status. Entering NOSHOW/CANCELLED creates
// (or updates) its NoShowRecord; leaving those statuses removes it, since
// it's no longer a loss.
// ---------------------------------------------------------------------------
router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!APPOINTMENT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${APPOINTMENT_STATUSES.join(", ")}` });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
  });

  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  const updated = await prisma.$transaction(async (tx) => {
    const updatedAppointment = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status },
      include: { client: true, staff: true },
    });

    if (LOSS_STATUSES.includes(status)) {
      await tx.noShowRecord.upsert({
        where: { appointmentId: appointment.id },
        create: {
          businessId: req.businessId,
          appointmentId: appointment.id,
          clientId: appointment.clientId,
          valueLost: appointment.value,
        },
        update: { valueLost: appointment.value },
      });
    } else {
      await tx.noShowRecord.deleteMany({ where: { appointmentId: appointment.id } });
    }

    return updatedAppointment;
  });

  res.json(maskValue(updated, req.currentUser));
}));

// ---------------------------------------------------------------------------
// DELETE /api/appointments/:id
// ---------------------------------------------------------------------------
router.delete("/:id", asyncHandler(async (req, res) => {
  const { count } = await prisma.appointment.deleteMany({
    where: { id: req.params.id, businessId: req.businessId },
  });

  if (count === 0) return res.status(404).json({ error: "Appointment not found" });
  res.status(204).send();
}));

// ---------------------------------------------------------------------------
// GET /api/appointments/stats?date=YYYY-MM-DD
// Powers the dashboard's stat row: net revenue, lost revenue, loss rate.
// ---------------------------------------------------------------------------
router.get("/stats", requirePermission("canViewFinancials"), asyncHandler(async (req, res) => {
  const range = dayRange(req.query.date);
  if (!range) return res.status(400).json({ error: "date query param is required and must be YYYY-MM-DD" });

  const appointments = await prisma.appointment.findMany({
    where: { businessId: req.businessId, startTime: { gte: range.start, lt: range.end } },
    select: { status: true, value: true },
  });

  const booked = appointments
    .filter((a) => !LOSS_STATUSES.includes(a.status))
    .reduce((sum, a) => sum + Number(a.value), 0);

  const lost = appointments
    .filter((a) => LOSS_STATUSES.includes(a.status))
    .reduce((sum, a) => sum + Number(a.value), 0);

  const noshowCount = appointments.filter((a) => a.status === "NOSHOW").length;
  const cancelledCount = appointments.filter((a) => a.status === "CANCELLED").length;
  const total = appointments.length;

  res.json({
    booked,
    lost,
    net: booked - lost,
    noshowCount,
    cancelledCount,
    total,
    rate: total ? Math.round(((noshowCount + cancelledCount) / total) * 100) : 0,
  });
}));

module.exports = router;
