import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const release = `poracode@${pkg.version}`;
const sentryCli = process.platform === "win32" ? "sentry-cli.cmd" : "sentry-cli";

function run(args, options = {}) {
  const result = spawnSync(sentryCli, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.allowFailure ? "pipe" : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.allowFailure) {
      return false;
    }
    process.exit(result.status ?? 1);
  }
  return true;
}

if (!run(["releases", "new", release], { allowFailure: true })) {
  run(["releases", "info", release]);
}
run(["sourcemaps", "inject", "dist/main", "dist/renderer"]);
run(["sourcemaps", "upload", "--release", release, "dist/main", "dist/renderer"]);
run(["releases", "finalize", release]);
