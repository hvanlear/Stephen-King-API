import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import config from "../config";

const COOKIE_NAME = "dashboard_session";
const COOKIE_PATH = "/dashboard";
const SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours

// The dashboard stays off until both are set, so there's never a guessable
// fallback secret.
function dashboardSettings(): { password: string; secret: string } | null {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SECRET;
  return password && secret ? { password, secret } : null;
}

export function dashboardEnabled(): boolean {
  return dashboardSettings() !== null;
}

// Hashing first means neither the length nor the content leaks through timing
function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function sign(expires: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`dashboard:${expires}`)
    .digest("base64url");
}

// The expiry lives inside the signed value, so a copied cookie stops working
// after SESSION_MS no matter what the browser does with it.
function createSession(secret: string): string {
  const expires = Date.now() + SESSION_MS;
  return `${expires}.${sign(expires, secret)}`;
}

function isValidSession(value: unknown, secret: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const [expiresPart, signature] = value.split(".");
  const expires = Number(expiresPart);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || !signature) {
    return false;
  }
  return safeEqual(signature, sign(expires, secret));
}

// Only failed attempts count toward the limit
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render("dashboard-login", {
      error: "Too many failed attempts. Try again in 15 minutes.",
    });
  },
});

export function handleLogin(req: Request, res: Response): void {
  const settings = dashboardSettings();
  if (!settings) {
    res.status(503).render("dashboard-login", {
      error: "The dashboard isn't configured on this server.",
    });
    return;
  }

  const password =
    typeof req.body.password === "string" ? req.body.password : "";
  if (!safeEqual(password, settings.password)) {
    res.status(401).render("dashboard-login", { error: "Invalid password" });
    return;
  }

  res.cookie(COOKIE_NAME, createSession(settings.secret), {
    httpOnly: true,
    secure: config.stage === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_MS,
  });

  res.redirect("/dashboard");
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
}

export function requireDashboardAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const settings = dashboardSettings();
  if (settings && isValidSession(req.cookies[COOKIE_NAME], settings.secret)) {
    next();
  } else {
    res.redirect("/dashboard/login");
  }
}
