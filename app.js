/**
 * Tallybook API — single entry point.
 *
 * npm install express cors dotenv bcrypt jsonwebtoken stripe @prisma/client
 *   helmet express-rate-limit
 *
 * .env:
 *   DATABASE_URL=postgresql://...
 *   JWT_SECRET=...
 *   STRIPE_SECRET_KEY=sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *   CLIENT_URL=http://localhost:5173   (also used as the allowed CORS origin)
 *   PORT=4000
 */

require("dotenv").config();

// Fail fast, with one clear line, before requiring anything downstream that
// would otherwise throw its own (much less obvious) error the moment it's
// required — lib/prisma.js constructs a PrismaClient at require-time, and
// lib/jwt.js throws immediately if JWT_SECRET is missing. Checking here
// first means the deploy log shows exactly what to fix.
const REQUIRED_ENV_VARS = ["DATABASE_URL", "JWT_SECRET"];
const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
  console.error("Set these in your platform's environment variables screen, then redeploy.");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { execSync } = require("child_process");

const { handleStripeWebhook } = require("./lib/stripeWebhook");
const { generalLimiter, authLimiter } = require("./middleware/rateLimit");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const authRouter = require("./routes/auth");
const appointmentsRouter = require("./routes/appointments");
const noShowsRouter = require("./routes/noShows");
const staffRouter = require("./routes/staff");
const billingRouter = require("./routes/billing");

// ---------------------------------------------------------------------------
// Auto-sync the database schema on boot.
// ---------------------------------------------------------------------------
function syncDatabaseSchema() {
  if (process.env.AUTO_MIGRATE === "false") {
    console.log("AUTO_MIGRATE=false — skipping schema sync.");
    return;
  }
  console.log("Syncing database schema with schema.prisma...");
  try {
    execSync("npx prisma db push --accept-data-loss --skip-generate", { stdio: "inherit" });
    console.log("Database schema is up to date.");
  } catch (err) {
    console.error("Failed to sync database schema. Check DATABASE_URL is set correctly.");
    process.exit(1);
  }
}

syncDatabaseSchema();

const app = express();

app.use(helmet());

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({ origin: CLIENT_URL, credentials: true }));

app.use(generalLimiter);

app.post("/api/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json({ limit: "100kb" }));

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/no-shows", noShowsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/billing", billingRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`Tallybook API running on port ${PORT}`));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — shutting down for a clean restart:", err);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});
