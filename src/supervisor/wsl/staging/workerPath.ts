import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WslStagingProcessSpec } from "./executor";

const WORKER_FILE_NAMES = ["wslStagingWorker.cjs", "wslStagingWorker.mjs", "wslStagingWorker.js"];

function moduleDirectory(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function unpackedAsarPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

export function resolveWslStagingWorkerPath(): string | undefined {
  const directory = moduleDirectory();
  const unpacked = unpackedAsarPath(directory);
  const candidates: string[] = [];
  for (const name of WORKER_FILE_NAMES) {
    if (unpacked !== directory) candidates.push(join(unpacked, name));
    candidates.push(join(directory, name));
  }
  return candidates.find((candidate) => existsSync(candidate));
}

export function wslStagingProcessSpec(): WslStagingProcessSpec | undefined {
  const workerPath = resolveWslStagingWorkerPath();
  if (!workerPath) return undefined;
  return {
    command: process.execPath,
    args: [workerPath],
    env: {
      ...process.env,
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    cwd: dirname(workerPath),
  };
}
