import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeClosure } from "./runtime-closure.mjs";
import {
  DESKTOP_CLI_BOOTSTRAP_VERSION,
  DESKTOP_CLI_PREFIX,
  desktopCliExecutableName,
  desktopCliRelativePath,
  validateDesktopManifest,
} from "../packages/poracode-cli/lib/desktopBundle.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function prepareDesktopCli(options) {
  const prefix = join(options.stageRoot, "dist", "cli-runtime");
  const helperDir = join(options.stageRoot, "resources", "desktop-cli");
  const closure = readRuntimeClosure(options.mainBundleDir);
  if (
    !closure.files.some((file) => file.path === "server.cjs") ||
    !closure.files.some((file) => file.path === "supervisor.cjs")
  )
    throw new Error("Desktop CLI requires the frozen server and supervisor runtime closure.");
  const files = new Map();
  const publish = (relative, bytes, expectedSha) => {
    if (!desktopCliRelativePath(relative))
      throw new Error("Desktop CLI staging refused a non-canonical file path.");
    if (expectedSha !== undefined && sha256(bytes) !== expectedSha)
      throw new Error(`Desktop CLI input hash differs: ${relative}`);
    const target = relative.startsWith("desktop-cli/")
      ? join(helperDir, relative.slice("desktop-cli/".length))
      : join(prefix, relative.slice(`${DESKTOP_CLI_PREFIX}/`.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    files.set(relative, { path: relative, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) });
  };
  for (const file of closure.files) {
    if (
      !desktopCliRelativePath(file.path) ||
      !/\.(?:cjs|mjs|js)$/u.test(file.path) ||
      !/^[a-f0-9]{64}$/u.test(file.sha256)
    )
      throw new Error("Desktop CLI input has an invalid runtime code declaration.");
    const source = join(options.mainBundleDir, file.path);
    if (!lstatSync(source).isFile())
      throw new Error("Desktop CLI cannot stage linked runtime code.");
    publish(`${DESKTOP_CLI_PREFIX}/lib/${file.path}`, readFileSync(source), file.sha256);
  }
  for (const name of closure.manifestFiles)
    publish(`${DESKTOP_CLI_PREFIX}/lib/${name}`, readFileSync(join(options.mainBundleDir, name)));
  publish(
    `${DESKTOP_CLI_PREFIX}/package.json`,
    JSON.stringify({ name: "poracode-desktop-cli", private: true, version: options.appVersion }) +
      "\n",
  );
  publish(`${DESKTOP_CLI_PREFIX}/resources/.desktop-cli-v1`, "1\n");
  // The TUI binary manifest is the download trust root inside the packaged
  // CLI layout; absent manifests resolve to a clear "not available" error.
  const tuiManifestPath =
    options.tuiManifestPath ?? join(options.stageRoot, "resources", "tui", "manifest.json");
  if (existsSync(tuiManifestPath)) {
    const tuiManifest = readFileSync(tuiManifestPath, "utf8");
    if (JSON.parse(tuiManifest)?.formatVersion !== 1)
      throw new Error(`Invalid TUI manifest at ${tuiManifestPath}`);
    publish(`${DESKTOP_CLI_PREFIX}/resources/tui/manifest.json`, tuiManifest);
  }
  // The same renderer the desktop packages already supports browser bootstrap;
  // keep the CLI on those exact bytes instead of choosing a stale second build.
  cpSync(options.rendererDir, join(prefix, "renderer"), { recursive: true, dereference: false });
  const modulePath =
    options.modulePath ?? join(repoRoot, "packages", "poracode-cli", "lib", "desktopBundle.mjs");
  publish("desktop-cli/desktopBundle.mjs", readFileSync(modulePath));
  publish(
    "desktop-cli/bootstrap.mjs",
    [
      'import { dirname, resolve } from "node:path";',
      'import { fileURLToPath } from "node:url";',
      'import { runDesktopBundle } from "./desktopBundle.mjs";',
      'try { runDesktopBundle({ resourcesDir: resolve(dirname(fileURLToPath(import.meta.url)), "..") }); }',
      'catch { process.stderr.write("Desktop CLI could not use its packaged runtime. Reinstall the matching desktop release.\\n"); process.exitCode = 1; }',
      "",
    ].join("\n"),
  );
  return {
    prefix,
    helperDir,
    writeManifest({ platform, channel, executableName, electronVersion }) {
      if (
        !["win32", "darwin", "linux"].includes(platform) ||
        !["stable", "nightly"].includes(channel) ||
        !desktopCliExecutableName(executableName)
      )
        throw new Error(
          "Desktop CLI staging requires a supported platform, channel and executable basename.",
        );
      const commandName = channel === "nightly" ? "poracode-next" : "poracode";
      const shellWord = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
      const launcher =
        platform === "win32"
          ? [
              "@echo off",
              "rem poracode-desktop-cli-v1",
              "setlocal EnableExtensions DisableDelayedExpansion",
              'set "NODE_OPTIONS="',
              'set "NODE_PATH="',
              'set "ELECTRON_RUN_AS_NODE=1"',
              `if not exist "%~dp0..\\..\\${executableName}" goto missing`,
              `"%~dp0..\\..\\${executableName}" "%~dp0bootstrap.mjs" %*`,
              "exit /b %ERRORLEVEL%",
              ":missing",
              "echo Poracode desktop has moved or been removed. Open or reinstall the selected desktop release to repair its command. 1>&2",
              "exit /b 127",
              "",
            ].join("\r\n")
          : [
              "#!/bin/sh",
              "# poracode-desktop-cli-v1",
              "self=$0",
              "hops=0",
              'while [ -L "$self" ]; do',
              '  [ "$hops" -lt 16 ] || { echo "Poracode command link loop." >&2; exit 1; }',
              '  target=$(readlink "$self") || exit 1',
              '  case "$target" in /*) self=$target ;; *) self=$(dirname "$self")/$target ;; esac',
              "  hops=$((hops + 1))",
              "done",
              'dir=$(CDPATH= cd -P "$(dirname "$self")" && pwd) || exit 1',
              `app="$dir/${platform === "darwin" ? "../../MacOS/" : "../../"}"${shellWord(executableName)}`,
              'if [ ! -x "$app" ]; then',
              '  echo "Poracode desktop has moved or been removed. Open or reinstall the selected desktop release to repair its command." >&2',
              "  exit 127",
              "fi",
              'exec env NODE_OPTIONS= NODE_PATH= ELECTRON_RUN_AS_NODE=1 "$app" "$dir/bootstrap.mjs" "$@"',
              "",
            ].join("\n");
      const launcherPath = `desktop-cli/${commandName}${platform === "win32" ? ".cmd" : ""}`;
      publish(launcherPath, launcher);
      if (platform === "win32") {
        const buildDir = join(options.stageRoot, "build");
        mkdirSync(buildDir, { recursive: true });
        writeFileSync(
          join(buildDir, "desktop-cli-config.nsh"),
          [
            `!define PORACODE_CLI_CHANNEL "${channel}"`,
            `!define PORACODE_CLI_COMMAND "${commandName}"`,
            `!define PORACODE_CLI_LAUNCHER_SHA256 "${sha256(launcher)}"`,
            "",
          ].join("\n"),
        );
      }
      if (platform !== "win32") chmodSync(join(helperDir, commandName), 0o755);
      const manifest = {
        formatVersion: DESKTOP_CLI_BOOTSTRAP_VERSION,
        runtime: "electron-run-as-node",
        platform,
        channel,
        commandName,
        appVersion: options.appVersion,
        electronVersion,
        executableName,
        serverPrefixRelative: DESKTOP_CLI_PREFIX,
        entryRelative: "lib/server.cjs",
        files: [...files.values()].toSorted((left, right) =>
          left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
        ),
      };
      validateDesktopManifest(manifest);
      writeFileSync(join(helperDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
      return manifest;
    },
  };
}
