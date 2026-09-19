const Stripe = require("stripe");
const prisma = require("../lib/prisma");

const PLAN_TIER = { solo: "SOLO", team: "TEAM", growth: "GROWTH" };

// Same lazy-init reasoning as routes/billing.js — don't let a missing
// STRIPE_SECRET_KEY crash the process at require() time.
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

/**
 * Handles Stripe webhook events. Mounted in app.js with express.raw() BEFORE
 * the global express.json() middleware — Stripe's signature check needs the
 * exact raw request body, and once express.json() has parsed it, the raw
 * bytes are gone and verification fails.
 */
async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const businessId = session.metadata?.businessId;
        const plan = PLAN_TIER[session.metadata?.planId] || "SOLO";
        if (businessId) {
          await prisma.subscription.upsert({
            where: { businessId },
            create: { businessId, stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription, plan, status: "ACTIVE" },
            update: { stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription, plan, status: "ACTIVE" },
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const businessId = sub.metadata?.businessId;
        if (businessId) {
          await prisma.subscription.updateMany({
            where: { businessId },
            data: {
              status: sub.status.toUpperCase(),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const businessId = sub.metadata?.businessId;
        if (businessId) {
          await prisma.subscription.updateMany({ where: { businessId }, data: { status: "CANCELED" } });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("Payment failed for invoice:", invoice.id, "customer:", invoice.customer);
        // TODO: notify the business owner their card was declined
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Error processing webhook event:", event.type, err);
  }

  res.json({ received: true });
}

module.exports = { handleStripeWebhook };
