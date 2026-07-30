#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
function openDatabase(filename) {
  let nodeSqliteError;
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(filename);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
      close: () => db.close(),
    };
  } catch (error) {
    if (error.code !== "ERR_UNKNOWN_BUILTIN_MODULE") throw error;
    nodeSqliteError = error;
  }

  try {
    const Database = require("better-sqlite3");
    const db = new Database(filename);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
      close: () => db.close(),
    };
  } catch (betterSqliteError) {
    throw new Error(
      `Unable to open sqlite. node:sqlite failed with ${nodeSqliteError.message}; better-sqlite3 failed with ${betterSqliteError.message}`,
      { cause: betterSqliteError },
    );
  }
}

const args = process.argv.slice(2);

function usage() {
  console.error(`Usage:
  node --no-warnings .agents/skills/interactive-testing/scripts/seed-poracode-smoke-db.mjs --baseDir <dir> --projectDir <dir> [--reset]
  node --no-warnings .agents/skills/interactive-testing/scripts/seed-poracode-smoke-db.mjs --baseDir <dir> --wslDistro <name> --wslLinuxPath <path> [--reset]`);
}

function readArg(name) {
  const flag = `--${name}`;
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function parseWslUncPath(value) {
  const match = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(?:\\(.*))?$/i.exec(value);
  if (!match) return null;
  const distro = match[1];
  const rest = match[2];
  return {
    distro,
    linuxPath: rest ? `/${rest.replace(/\\/g, "/")}` : "/",
  };
}

function toWslUncPath(distro, linuxPath) {
  const normalized = linuxPath.replace(/^\/+/, "").replace(/\//g, "\\");
  return `\\\\wsl.localhost\\${distro}\\${normalized}`;
}

function projectNameFromPath(value, locationKind) {
  if (locationKind === "wsl") {
    return path.posix.basename(value.replace(/\/+$/, "")) || "Smoke Project";
  }
  return path.basename(value.replace(/[\\/]+$/, "")) || "Smoke Project";
}

function resolveProjectLocation(projectDir) {
  const wslDistro = readArg("wslDistro");
  const wslLinuxPath = readArg("wslLinuxPath");
  if (wslDistro || wslLinuxPath) {
    if (!wslDistro || !wslLinuxPath) {
      throw new Error("--wslDistro and --wslLinuxPath must be provided together");
    }
    return {
      kind: "wsl",
      distro: wslDistro,
      linuxPath: wslLinuxPath,
      uncPath: readArg("wslUncPath") ?? projectDir ?? toWslUncPath(wslDistro, wslLinuxPath),
    };
  }

  if (!projectDir) {
    throw new Error("--projectDir is required unless WSL path flags provide the project");
  }

  const parsedWsl = parseWslUncPath(projectDir);
  if (parsedWsl) {
    return {
      kind: "wsl",
      distro: parsedWsl.distro,
      linuxPath: parsedWsl.linuxPath,
      uncPath: projectDir,
    };
  }

  return process.platform === "win32"
    ? { kind: "windows", path: path.resolve(projectDir) }
    : { kind: "posix", path: path.resolve(projectDir) };
}

const baseDir = readArg("baseDir") ?? process.env.PORACODE_BASE_DIR;
const projectDir = readArg("projectDir") ?? process.env.PORACODE_SMOKE_PROJECT_DIR;

if (!baseDir) {
  usage();
  throw new Error("--baseDir or PORACODE_BASE_DIR is required");
}

const projectLocation = resolveProjectLocation(projectDir);
const projectId = readArg("projectId") ?? "smoke-project";
const projectName =
  readArg("projectName") ??
  projectNameFromPath(
    projectLocation.kind === "wsl" ? projectLocation.linuxPath : projectLocation.path,
    projectLocation.kind,
  );
const createdAt = new Date().toISOString();
const resolvedBaseDir = path.resolve(baseDir);
const dbPath = path.join(resolvedBaseDir, "state.sqlite");

mkdirSync(resolvedBaseDir, { recursive: true });

if (hasFlag("reset")) {
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(candidate)) rmSync(candidate);
  }
}

const db = openDatabase(dbPath);

try {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location_kind TEXT NOT NULL,
      location_path TEXT,
      location_distro TEXT,
      location_linux_path TEXT,
      location_unc_path TEXT,
      last_draft_config TEXT,
      scripts TEXT,
      search_settings TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertProject = db.prepare(`
    INSERT INTO projects (
      id, name, location_kind, location_path, location_distro,
      location_linux_path, location_unc_path, last_draft_config, scripts,
      search_settings, disabled, sort_order, created_at
    )
    VALUES (
      @id, @name, @locationKind, @locationPath, @locationDistro,
      @locationLinuxPath, @locationUncPath, NULL, @scripts,
      NULL, 0, 0, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      location_kind = excluded.location_kind,
      location_path = excluded.location_path,
      location_distro = excluded.location_distro,
      location_linux_path = excluded.location_linux_path,
      location_unc_path = excluded.location_unc_path,
      scripts = excluded.scripts,
      disabled = 0,
      sort_order = 0
  `);

  const setState = db.prepare(`
    INSERT INTO app_state (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  db.exec("BEGIN");
  try {
    insertProject.run({
      id: projectId,
      name: projectName,
      locationKind: projectLocation.kind,
      locationPath: projectLocation.kind === "wsl" ? null : projectLocation.path,
      locationDistro: projectLocation.kind === "wsl" ? projectLocation.distro : null,
      locationLinuxPath: projectLocation.kind === "wsl" ? projectLocation.linuxPath : null,
      locationUncPath: projectLocation.kind === "wsl" ? projectLocation.uncPath : null,
      scripts: JSON.stringify({
        actions: [{ id: "smoke-check", name: "Smoke check", command: "echo smoke" }],
      }),
      createdAt,
    });
    setState.run({
      key: "view",
      value: JSON.stringify({ kind: "draft", projectId }),
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(
    JSON.stringify(
      {
        dbPath,
        projectId,
        projectName,
        location: projectLocation,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
