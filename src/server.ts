import express, { ErrorRequestHandler } from "express";
import router from "./router";
import morgan from "morgan";
import cors from "cors";
import config from "./config";

const app = express();

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

app.get("/", (req, res) => {
  const url = config.url || process.env.URL || "https://stephen-king-api.onrender.com";
  res.render("index", { url: url });
});

app.get("/docs", (req, res) => {
  const url = config.url || process.env.URL || "https://stephen-king-api.onrender.com";
  res.render("docs", { url: url });
});

app.use("/api", router);

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
