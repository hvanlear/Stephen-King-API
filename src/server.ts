import express from "express";
import cookieParser from "cookie-parser";
import router from "./router";
import morgan from "morgan";
import cors from "cors";
import config from "./config";
import { trackApiHits } from "./modules/analyticsMiddleware";
import { createApiLimiter } from "./modules/apiLimiter";
import { apiNotFound, pageNotFound, errorHandler } from "./modules/errorHandler";
import {
  requireDashboardAuth,
  handleLogin,
  loginLimiter,
} from "./modules/dashboardAuth";
import { showLogin, showDashboard, handleLogout } from "./handlers/dashboard";

const app = express();

// Requests reach the app as client → Cloudflare edge → Render's balancer, so
// the client is two hops back. At one hop every Cloudflare edge got its own
// rate limit counter. Forged X-Forwarded-For entries land further back and
// don't change it.
app.set("trust proxy", 2);

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
app.use(pageNotFound);

app.use(errorHandler);

export default app;
