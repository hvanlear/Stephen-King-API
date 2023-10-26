import express from "express";
import router from "./router";
import morgan from "morgan";

const app = express();

const path = require("path");

app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("static"));

app.get("/", (req, res) => {
  res.sendFile(path.resolve("src/pages/index.html"));
});

app.use("/api", router);

export default app;
