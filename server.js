const { createServer } = require("node:http");
const { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } = require("node:fs");
const path = require("node:path");
const next = require("next");

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

function seedLibraryVolume() {
  const targets = [
    {
      source: path.join(process.cwd(), "cifras"),
      target: process.env.CIFRAS_DIR || "/data/cifras",
      extension: ".pdf"
    },
    {
      source: path.join(process.cwd(), "vs"),
      target: process.env.VS_DIR || "/data/vs",
      extension: ".mp3"
    }
  ];

  for (const target of targets) {
    if (!existsSync(target.source)) continue;

    mkdirSync(target.target, { recursive: true });
    const existing = readdirSync(target.target).filter((name) => name.toLowerCase().endsWith(target.extension));
    if (existing.length > 0) continue;

    const files = readdirSync(target.source).filter((name) => name.toLowerCase().endsWith(target.extension));
    for (const file of files) {
      const from = path.join(target.source, file);
      const to = path.join(target.target, file);
      if (statSync(from).isFile()) copyFileSync(from, to);
    }

    console.log(`Seeded ${files.length} files into ${target.target}`);
  }
}

if (process.env.SEED_LIBRARY_ON_START === "1") {
  seedLibraryVolume();
}

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`Cifra Igreja running on http://${hostname}:${port}`);
  });
});
