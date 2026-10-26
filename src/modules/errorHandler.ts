import { STATUS_CODES } from "http";
import { ErrorRequestHandler, RequestHandler } from "express";

// Unknown /api routes answer in JSON, like the rest of the API
export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not found" });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Too late to send a clean error; Express closes the connection
  if (res.headersSent) {
    return next(err);
  }

  // Errors from Express and its parsers say which status to send, such as
  // 400 for malformed JSON. Anything else is a bug.
  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  if (status >= 500) {
    // Render keeps stdout/stderr, so this is the only trace of a failure
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    res
      .status(status)
      .json({ message: "All work and no play makes a server error" });
    return;
  }

  res.status(status).json({ error: err.expose ? err.message : STATUS_CODES[status] });
};
