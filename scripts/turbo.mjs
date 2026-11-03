import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const commands = {
  typecheck: [[process.execPath, "check", "-p", "tsconfig.json"]],
  lint: [
    [process.execPath, "lint", "--deny-warnings", "."],
    [
      process.execPath,
      "lint",
      "--type-aware",
      "--deny-warnings",
      "-c",
      ".oxlintrc.type-aware.json",
      ".",
    ],
  ],
  "fmt:check": [[process.execPath, "fmt", "--check"]],
  "build:renderer": [
    ["node", join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "build"],
  ],
  build: [[process.execPath, "run", "build:electron"]],
};
const [task, ...args] = process.argv.slice(2);
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
process.env[pathKey] = `${dirname(process.execPath)}${delimiter}${process.env[pathKey] ?? ""}`;

if (Object.hasOwn(commands, task)) {
  if (process.env.TURBO_HASH) {
    for (const [executable, ...command] of commands[task]) {
      const result = spawnSync(executable, [...command, ...args], {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          ...(executable === process.execPath && command[0] !== "run"
            ? { npm_lifecycle_event: command[0] }
            : {}),
        },
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
    process.exit(0);
  }
  const forwarded = args.filter((arg) => arg !== "--force");
  process.argv.splice(
    2,
    process.argv.length - 2,
    "run",
    `//#${task}`,
    ...(args.includes("--force") ? ["--force"] : []),
    ...(forwarded.length ? ["--", ...forwarded] : []),
  );
}

const node = spawnSync("node", ["-p", "process.versions.node"], {
  encoding: "utf8",
  windowsHide: true,
});
if (node.error) throw node.error;
if (node.status !== 0) {
  process.stderr.write(node.stderr);
  process.exit(node.status ?? 1);
}

// Bun's process.versions.node is a compatibility version, not the installed Node runtime.
process.env.PORACODE_TOOLCHAIN_CACHE_KEY = JSON.stringify({
  version: 1,
  platform: process.platform,
  arch: process.arch,
  bun: process.versions.bun,
  bunRevision: Bun.revision,
  node: node.stdout.trim(),
});
// CI always verifies fresh. Custom arguments/targets can change output paths.
if (
  process.argv[2] === "run" &&
  (process.env.CI ||
    process.argv.includes("--") ||
    ["web", "extension"].includes(process.env.PORACODE_BUILD_TARGET))
) {
  process.argv.splice(3, 0, "--cache=local:,remote:");
}
// Use Turbo's own signal/terminal handling without another Bun wrapper process.
require("turbo");
