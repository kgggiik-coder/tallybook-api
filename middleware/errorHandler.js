// Final error-handling middleware — must be registered LAST, after every
// route. Express identifies an error handler purely by having 4 parameters,
// so the unused `next` below is required, not dead code — removing it would
// silently turn this back into a normal (non-error) middleware.
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ->`, err);

  if (res.headersSent) return next(err); // let Express's default handler close the connection

  // A couple of Prisma's known error codes are worth a specific, honest
  // status instead of a generic 500 — everything else stays generic so
  // internal details (stack traces, query info) never reach a client.
  if (err?.code === "P2002") return res.status(409).json({ error: "That value is already in use" });
  if (err?.code === "P2025") return res.status(404).json({ error: "Record not found" });

  res.status(err.status || 500).json({ error: "Something went wrong. Please try again." });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

module.exports = { errorHandler, notFoundHandler };
