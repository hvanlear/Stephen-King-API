const port = 5000;
import app from "./server";

// creates and starts a server for our API on a defined port
app.listen(port, () => {
  console.log(` listening at http://localhost:${port}`);
});
