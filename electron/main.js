const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

app.setName("Flux Journal");

const DEV_URL = process.env.ELECTRON_DEV_URL;
const PORT = 3100;

let serverProcess = null;
let win = null;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error("Server did not start in time"));
          } else {
            setTimeout(attempt, 200);
          }
        });
    };
    attempt();
  });
}

// Everything the packaged server needs (standalone build + template db) is
// copied next to the app bundle as "extraResources" by electron-builder.
// The same relative layout under the project root lets this same code path
// be exercised locally (via `npm run electron:build:app` without full
// packaging) for a quick pre-flight check.
function resolveResourcePaths() {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return {
    standaloneDir: path.join(resourcesPath, app.isPackaged ? "standalone" : ".next/standalone"),
    templateDb: path.join(resourcesPath, app.isPackaged ? "template.db" : "electron/resources/template.db"),
    migrationsDir: path.join(resourcesPath, app.isPackaged ? "migrations" : "prisma/migrations"),
  };
}

// Runs any prisma/migrations/*/migration.sql not yet recorded in this specific
// database file. template.db (used for brand-new installs) already has every
// migration up to build time applied and recorded, so this is a no-op there —
// it only does real work for a user upgrading an existing install whose
// dev.db predates a schema change shipped in a later version of the app.
function runMigrations(dbPath, standaloneDir, migrationsDir) {
  const Database = require(path.join(standaloneDir, "node_modules", "better-sqlite3"));
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                    TEXT PRIMARY KEY NOT NULL,
      "checksum"              TEXT NOT NULL,
      "finished_at"           DATETIME,
      "migration_name"        TEXT NOT NULL,
      "logs"                  TEXT,
      "rolled_back_at"        DATETIME,
      "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);
  const applied = new Set(db.prepare(`SELECT migration_name FROM "_prisma_migrations"`).all().map((r) => r.migration_name));
  const folders = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const insert = db.prepare(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)`);
  for (const folder of folders) {
    if (applied.has(folder)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
    db.exec(sql);
    insert.run(require("node:crypto").randomUUID(), "", folder);
  }
  db.close();
}

async function startServer() {
  const { standaloneDir, templateDb, migrationsDir } = resolveResourcePaths();

  const dataDir = app.getPath("userData");
  const uploadsDir = path.join(dataDir, "uploads");
  const dbPath = path.join(dataDir, "dev.db");

  fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.copyFileSync(templateDb, dbPath);
  }
  runMigrations(dbPath, standaloneDir, migrationsDir);

  const serverEntry = path.join(standaloneDir, "server.js");

  // Electron's own binary can act as a plain Node runtime for the child
  // process when ELECTRON_RUN_AS_NODE=1 is set — no separate Node install
  // needed on the user's machine.
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: `file:${dbPath}`,
      UPLOADS_DIR: uploadsDir,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  await waitForServer(`http://127.0.0.1:${PORT}`);
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Flux Journal",
    backgroundColor: "#0d0c12",
  });

  if (DEV_URL) {
    await win.loadURL(DEV_URL);
  } else {
    await startServer();
    await win.loadURL(`http://127.0.0.1:${PORT}`);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
