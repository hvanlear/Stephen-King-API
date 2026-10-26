import express, { ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import router from "./router";
import morgan from "morgan";
import cors from "cors";
import config from "./config";
import { trackApiHits } from "./modules/analyticsMiddleware";
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

app.use(
  cors({
    methods: ["GET"],
    origin: "*",
  })
);

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  const url = config.url || process.env.URL || "https://stephen-king-api.onrender.com";
  res.render("index", { url: url });
});

app.get("/docs", (req, res) => {
  const url = config.url || process.env.URL || "https://stephen-king-api.onrender.com";
  res.render("docs", { url: url });
});

// Dashboard routes
app.get("/dashboard/login", showLogin);
app.post("/dashboard/login", loginLimiter, handleLogin);
app.get("/dashboard/logout", handleLogout);
app.get("/dashboard", requireDashboardAuth, showDashboard);

app.use("/api", trackApiHits, router);

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err.type === "auth") {
    res.status(401).json({ message: "unauthorized" });
  } else if (err.type === "input") {
    res.status(400).json({ message: "bad request" });
  } else {
    res
      .status(500)
      .json({ message: "All work and no play makes a server error" });
  }
};

app.use(errorHandler);

export default app;
