#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  overlayTargets,
  readBetterSqlite3Overlay,
  readNodePtyOverlay,
} from "./server-native-overlay.mjs";

function memberPath(path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`native overlay member must be relative: ${String(path)}`);
  }
  const normalized = normalize(path);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new Error(`native overlay member escapes its root: ${path}`);
  }
  return normalized.split(sep).join("/");
}

export function requiredServerTarballMembers(overlayRoot, targets) {
  const nodePty = overlayTargets(readNodePtyOverlay(overlayRoot));
  const sqlite = readBetterSqlite3Overlay(overlayRoot);
  if (!sqlite || !Array.isArray(sqlite.targets)) {
    throw new Error("better-sqlite3 overlay.json carries no staged targets.");
  }

  const required = new Set([
    "npm-shrinkwrap.json",
    "renderer/index.html",
    "native-overlay/node-pty/overlay.json",
    "native-overlay/better-sqlite3/overlay.json",
  ]);
  for (const target of targets) {
    const pty = nodePty.find((candidate) => candidate.dir === target);
    if (!pty) throw new Error(`node-pty overlay does not advertise ${target}`);
    for (const name of Object.keys(pty.stagedSha256)) {
      required.add(`native-overlay/node-pty/${memberPath(pty.dir)}/${memberPath(name)}`);
    }

    const binding = sqlite.targets.find((candidate) => candidate.dir === target);
    if (!binding) throw new Error(`better-sqlite3 overlay does not advertise ${target}`);
    required.add(`native-overlay/${memberPath(binding.file)}`);
  }
  return [...required].sort();
}

export function verifyServerTarballContents({ tarball, overlayRoot, targets }) {
  const members = new Set(
    execFileSync("tar", ["-tzf", tarball], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean)
      .map((entry) => entry.replace(/^\.\//u, "").replace(/\/$/u, "")),
  );
  const missing = requiredServerTarballMembers(overlayRoot, targets).filter(
    (required) => !members.has(required),
  );
  if (missing.length > 0) {
    throw new Error(`server tarball is missing required member(s): ${missing.join(", ")}`);
  }
}

function parseArgs(argv) {
  let tarball;
  let overlayRoot;
  const targets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--tarball") tarball = argv[++index];
    else if (argument === "--overlay-root") overlayRoot = argv[++index];
    else if (argument === "--target") targets.push(argv[++index]);
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!tarball || !overlayRoot || targets.length === 0 || targets.some((target) => !target)) {
    throw new Error(
      "usage: verify-server-tarball-contents --tarball <path> --overlay-root <path> --target <platform-arch> [...]",
    );
  }
  return { tarball, overlayRoot, targets };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  verifyServerTarballContents(parseArgs(process.argv.slice(2)));
}
