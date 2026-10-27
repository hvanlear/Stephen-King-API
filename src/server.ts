import express from "express";
import cookieParser from "cookie-parser";
import router from "./router";
import morgan from "morgan";
import cors from "cors";
import config from "./config";
import { trackApiHits } from "./modules/analyticsMiddleware";
import { createApiLimiter } from "./modules/apiLimiter";
import { apiNotFound, errorHandler } from "./modules/errorHandler";
import {
  requireDashboardAuth,
  handleLogin,
  loginLimiter,
} from "./modules/dashboardAuth";
import { showLogin, showDashboard, handleLogout } from "./handlers/dashboard";

const app = express();

// Render sits behind a proxy; without this every client shares its IP and
// rate limiting can't tell them apart
app.set("trust proxy", 1);

// Temporary: shows how a request reaches the app through Render's proxies, so
// "trust proxy" can be set to the right number of hops. Remove once it is.
app.get("/debug/ip", (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const hops = [
    req.socket.remoteAddress ?? null,
    ...(typeof forwardedFor === "string" ? forwardedFor.split(",").map((ip) => ip.trim()).reverse() : []),
  ];
  res.set("Cache-Control", "no-store").json({
    ip: req.ip,
    forwardedFor: forwardedFor ?? null,
    // What req.ip would be with "trust proxy" set to each number of hops
    ipByTrustedHops: Object.fromEntries(hops.map((ip, count) => [count, ip])),
    cfConnectingIp: req.headers["cf-connecting-ip"] ?? null,
    trueClientIp: req.headers["true-client-ip"] ?? null,
    realIp: req.headers["x-real-ip"] ?? null,
  });
});

app.use(
  cors({
    methods: ["GET"],
    origin: "*",
    // Lets browser apps see how much of the rate limit they have left
    exposedHeaders: ["RateLimit", "RateLimit-Policy", "Retry-After"],
  })
);

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.render("index", { url: config.url });
});

app.get("/docs", (req, res) => {
  res.render("docs", { url: config.url });
});

// Dashboard routes
app.get("/dashboard/login", showLogin);
app.post("/dashboard/login", loginLimiter, handleLogin);
app.get("/dashboard/logout", handleLogout);
app.get("/dashboard", requireDashboardAuth, showDashboard);

app.use("/api", createApiLimiter(config.apiRateLimit), trackApiHits, router);
app.use("/api", apiNotFound);

app.use(errorHandler);

export default app;
