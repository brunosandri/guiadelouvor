const { createServer } = require("node:http");
const next = require("next");

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`Cifra Igreja running on http://${hostname}:${port}`);
  });
});
