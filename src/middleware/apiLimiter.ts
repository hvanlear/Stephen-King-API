import rateLimit from "express-rate-limit";

// Counted per client IP ("trust proxy" in server.ts makes that the real
// client on Render). Every list comes back in one request, so ordinary use
// stays far below the limit.
export function createApiLimiter(limit: number) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res
        .status(429)
        .json({ error: "Too many requests. Try again in a minute." });
    },
  });
}
