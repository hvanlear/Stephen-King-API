import express from "express";
import cookieParser from "cookie-parser";
import router from "./router";
import morgan from "morgan";
import cors from "cors";
import config from "./config";
import { trackApiHits } from "./middleware/analyticsMiddleware";
import { createApiLimiter } from "./middleware/apiLimiter";
import { apiNotFound, pageNotFound, errorHandler } from "./middleware/errorHandler";
import {
  requireDashboardAuth,
  handleLogin,
  loginLimiter,
} from "./middleware/dashboardAuth";
import { showLogin, showDashboard, handleLogout } from "./handlers/dashboard";
import { showGraphHome } from "./handlers/graphHome";
import { graph } from "./graph/build";

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

// The graph explorer's files have the content hash in their names, so they
// can be cached for good. The manifest says which ones are current.
const IMMUTABLE = "public, max-age=31536000, immutable";
app.get(graph.path, (req, res) => {
  res.set("Cache-Control", IMMUTABLE).type("json").send(graph.json);
});
app.use(
  "/assets",
  express.static("public/assets", {
    setHeaders: (res, file) => {
      res.setHeader("Cache-Control", file.endsWith("manifest.json") ? "no-cache" : IMMUTABLE);
    },
  })
);
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// The home page: the catalog as a graph you can walk (SK-045)
app.get("/", showGraphHome);

// Where the graph home page was built. Links to it, ?focus= included, still work.
app.get("/next", (req, res) => {
  const query = req.originalUrl.indexOf("?");
  res.redirect(301, query === -1 ? "/" : "/" + req.originalUrl.slice(query));
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
