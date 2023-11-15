import express from "express";
import router from "./router";
import morgan from "morgan";

const app = express();

const path = require("path");

app.use(express.static(__dirname + '/public'));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  // res.sendFile(path.resolve("src/pages/index.html"));
  res.sendFile(__dirname+"/index.html");
});

app.use("/api", router);
app.use((err, req, res, next) => {
  if(err.type === 'auth'){
    res.status(401).json({message:'unauthorized'})
  } else if (err.type === 'input'){
    res.status(400).json({message: 'bad request'})
  } else {
    res.status(500).json({message: 'All work and no play makes a server error'})
  }
})

export default app;
