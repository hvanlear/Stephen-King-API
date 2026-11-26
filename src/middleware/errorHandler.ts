import { STATUS_CODES } from "http";
import { ErrorRequestHandler, Request, RequestHandler, Response } from "express";

// The API answers in JSON; the pages (/, /docs, /dashboard) in HTML
const isApiRequest = (req: Request) => /^\/api(\/|\?|$)/.test(req.originalUrl);

// A broken template shouldn't hide the status, so fall back to plain text
function sendErrorPage(res: Response, status: number, message: string): void {
  res.status(status).render("error", { status, message }, (renderError, html) => {
    if (renderError) {
      res.type("text").send(`${status} ${message}`);
    } else {
      res.send(html);
    }
  });
}

// Unknown /api routes answer in JSON, like the rest of the API
export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not found" });
};

// Unknown site paths get a page rather than Express's bare "Cannot GET"
export const pageNotFound: RequestHandler = (req, res) => {
  sendErrorPage(res, 404, "Not found");
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
  }

  const message =
    status >= 500
      ? "All work and no play makes a server error"
      : err.expose
        ? err.message
        : STATUS_CODES[status] ?? "Error";

  if (!isApiRequest(req)) {
    sendErrorPage(res, status, message);
  } else if (status >= 500) {
    res.status(status).json({ message });
  } else {
    res.status(status).json({ error: message });
  }
};
