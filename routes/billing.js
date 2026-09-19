const express = require("express");
const Stripe = require("stripe");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../lib/asyncHandler");

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Initialized lazily, on first use, rather than at require() time. If
// STRIPE_SECRET_KEY is missing or wrong, this throws — but only when a
// billing route is actually hit, not the moment app.js requires this file.
// That keeps a Stripe misconfiguration from taking down scheduling, staff
// management, or anything else that has nothing to do with billing.
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// POST /api/billing/create-checkout-session
// Reuses the business's existing Stripe customer if one exists, so switching
// plans doesn't create a duplicate customer record each time.
// ---------------------------------------------------------------------------
router.post("/create-checkout-session", requireAuth, requirePermission("canManageBilling"), async (req, res) => {
  try {
    const stripe = getStripe();
    const { priceId, planId } = req.body;
    if (!priceId) return res.status(400).json({ error: "priceId is required" });

    const existing = await prisma.subscription.findUnique({ where: { businessId: req.businessId } });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existing?.stripeCustomerId, // reuse if present
      customer_email: existing?.stripeCustomerId ? undefined : req.currentUser.email,
      success_url: `${CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/billing`,
      metadata: { businessId: req.businessId, planId: planId || "" },
      subscription_data: { metadata: { businessId: req.businessId, planId: planId || "" } },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/create-portal-session
// ---------------------------------------------------------------------------
router.post("/create-portal-session", requireAuth, requirePermission("canManageBilling"), async (req, res) => {
  try {
    const stripe = getStripe();
    const sub = await prisma.subscription.findUnique({ where: { businessId: req.businessId } });
    if (!sub?.stripeCustomerId) return res.status(400).json({ error: "No billing account on file yet" });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${CLIENT_URL}/billing`,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    console.error("Error creating portal session:", err);
    res.status(500).json({ error: "Unable to create portal session" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/status — lets the frontend show the current plan/status
// ---------------------------------------------------------------------------
router.get("/status", requireAuth, asyncHandler(async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { businessId: req.businessId } });
  res.json(sub || { plan: null, status: "NONE" });
}));

module.exports = router;
