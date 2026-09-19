// Wraps an async Express route handler so a thrown error or rejected
// promise is forwarded to next(err) — and therefore to the error-handling
// middleware in middleware/errorHandler.js — instead of becoming an
// unhandled promise rejection that leaves the request hanging forever.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
