
import app from "./server";
import config from "./config";

// creates and starts a server for our API on a defined port
app.listen(config.port, () => {
  console.log(` listening at http://localhost:${config.port}`);
});
