#!/usr/bin/env node
/**
 * Installer qualification for one qualified self-contained archive: serve it
 * from a local HTTP "release" (`v<version>/<archive>`, `SHA256SUMS`, and the
 * installer scripts), run the real one-liner (`curl … | sh`, or
 * `irm … | iex` on Windows) into a throwaway prefix, then prove that the
 * installed command runs without a host Node, a re-run is idempotent,
 * `poracode up --no-service` saves settings, `poracode update` sees the
 * install as current, and `poracode uninstall --yes` removes it. HOME, the
 * profile, the command directory and PATH edits stay inside a temporary root.
 *
 * Usage:
 *   node scripts/installer-qualification.mjs --archive <archive> --metadata <standalone-<target>.json>
 */
import { spawn } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "./build-standalone-archive.mjs";
import { releaseScratchRoot } from "./server-host-tools.mjs";
import {
  readStandaloneArchiveMetadata,
  renderSha256Sums,
  sha256File,
} from "./standalone-runtime.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Serve `root` read-only over loopback; anything outside it is a 404. */
export async function serveDirectory(root) {
  const canonicalRoot = realpathSync(root);
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("bad request\n");
      return;
    }
    const path = resolve(canonicalRoot, `.${pathname}`);
    if (
      !path.startsWith(`${canonicalRoot}${sep}`) ||
      !existsSync(path) ||
      !statSync(path).isFile()
    ) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found\n");
      return;
    }
    const text = /\.(sh|ps1)$|SHA256SUMS$/u.test(path);
    response.writeHead(200, {
      "Content-Type": text ? "text/plain; charset=utf-8" : "application/octet-stream",
      "Content-Length": statSync(path).size,
    });
    createReadStream(path).pipe(response);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

/** A local release directory with the archive, its SHA256SUMS and both installers. */
export function stageLocalRelease(root, { archive, metadata }) {
  const releaseRoot = join(root, "release");
  const versionDir = join(releaseRoot, `v${metadata.version}`);
  mkdirSync(versionDir, { recursive: true });
  copyFileSync(archive, join(versionDir, metadata.archive.name));
  writeFileSync(
    join(versionDir, "SHA256SUMS"),
    renderSha256Sums([{ name: metadata.archive.name, sha256: metadata.archive.sha256 }]),
  );
  for (const script of ["install.sh", "install.ps1"]) {
    copyFileSync(join(repoRoot, "website", "public", script), join(releaseRoot, script));
  }
  return releaseRoot;
}

/**
 * Run a child to completion without blocking the event loop: the local HTTP
 * release is served from this same process.
 */
function runAsync(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 600_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolveRun({ stdout, stderr });
      else {
        rejectRun(
          new Error(`${command} ${args.join(" ")} exited ${code ?? signal}:\n${stdout}${stderr}`),
        );
      }
    });
  });
}

/** Run the real one-liner; the installers report on stderr, so keep both streams. */
async function runInstaller({ windows, url, env }) {
  const { stdout, stderr } = windows
    ? await runAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `irm '${url}/install.ps1' | iex`,
        ],
        { env },
      )
    : await runAsync("/bin/sh", ["-c", `curl -fsSL '${url}/install.sh' | sh`], { env });
  return `${stdout}${stderr}`;
}

async function runInstalled({ windows, command, args, env }) {
  if (windows) {
    const quoted = args.map((arg) => (/\s/u.test(arg) ? `"${arg}"` : arg)).join(" ");
    const { stdout } = await runAsync(
      join(env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"),
      ["/d", "/s", "/c", `""${command}" ${quoted}"`],
      { env, windowsVerbatimArguments: true, timeoutMs: 120_000 },
    );
    return stdout;
  }
  const { stdout } = await runAsync(command, args, { env, timeoutMs: 120_000 });
  return stdout;
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

export async function qualifyInstaller({ archive, metadataPath, platform = process.platform }) {
  const metadata = readStandaloneArchiveMetadata(metadataPath);
  if (sha256File(archive) !== metadata.archive.sha256) {
    throw new Error(`${archive} does not match ${metadataPath}`);
  }
  const windows = platform === "win32";
  const root = realpathSync(mkdtempSync(join(releaseScratchRoot(), "poracode-installer-qualify-")));
  const releaseRoot = stageLocalRelease(root, { archive, metadata });
  const server = await serveDirectory(releaseRoot);
  try {
    const home = join(root, "home");
    const prefix = join(root, "prefix");
    const binDir = join(root, "bin");
    const profile = join(root, "profile");
    mkdirSync(home, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      TMPDIR: root,
      PORACODE_VERSION: metadata.version,
      PORACODE_RELEASE_BASE_URL: server.url,
      PORACODE_INSTALL_DIR: prefix,
      PORACODE_BIN_DIR: binDir,
      PORACODE_NO_MODIFY_PATH: "1",
      PORACODE_BASE_DIR: profile,
      PORACODE_TUI_DOWNLOAD_BASE_URL: server.url,
      PORACODE_TUI_CACHE_DIR: join(root, "tui-cache"),
      ...(windows
        ? { USERPROFILE: home, LOCALAPPDATA: join(home, "AppData", "Local"), TEMP: root, TMP: root }
        : {}),
    };

    const first = await runInstaller({ windows, url: server.url, env });
    if (
      !new RegExp(`Installed Poracode ${metadata.version.replaceAll(".", "\\.")}`, "u").test(first)
    ) {
      throw new Error(`installer did not report the install:\n${first}`);
    }
    const releaseDir = realpathSync(join(prefix, "releases", metadata.version));
    if (realpathSync(join(prefix, "current")) !== releaseDir) {
      throw new Error("<prefix>/current does not point at the installed release");
    }
    const command = windows ? join(binDir, "poracode.cmd") : join(binDir, "poracode");
    if (!windows && !lstatSync(command).isSymbolicLink())
      throw new Error(`${command} is not a link`);

    // The installed command must run with no host Node or npm on PATH.
    const isolated = {
      ...isolatedEnvironment(home, platform, process.env),
      PORACODE_BASE_DIR: profile,
      PORACODE_RELEASE_BASE_URL: server.url,
      PORACODE_TUI_DOWNLOAD_BASE_URL: server.url,
      PORACODE_TUI_CACHE_DIR: join(root, "tui-cache"),
    };
    const reported = (await runInstalled({ windows, command, args: ["--version"], env: isolated }))
      .trim()
      .split(/\r?\n/u)
      .at(-1);
    if (reported !== metadata.version) {
      throw new Error(`installed poracode reported ${reported}, expected ${metadata.version}`);
    }

    const again = await runInstaller({ windows, url: server.url, env });
    if (!/already installed/u.test(again)) throw new Error(`re-run was not idempotent:\n${again}`);

    const up = await runInstalled({
      windows,
      command,
      args: ["up", "--local-only", "--no-service"],
      env: isolated,
    });
    if (!/Saved remote access settings: --bind-mode/u.test(up)) {
      throw new Error(`poracode up did not save settings:\n${up}`);
    }

    const lastJson = async (args) =>
      JSON.parse(
        (await runInstalled({ windows, command, args, env: isolated }))
          .trim()
          .split(/\r?\n/u)
          .at(-1),
      );
    const update = await lastJson(["update", metadata.version, "--json"]);
    if (update.outcome !== "current") throw new Error(`update: ${JSON.stringify(update)}`);

    // Profile data (here the settings `up` saved beside the profile path)
    // must survive the uninstall.
    const profileEntries = readdirSync(root).filter((name) => name.startsWith("profile"));
    if (profileEntries.length === 0) throw new Error("poracode up wrote no profile settings");
    const uninstall = await lastJson(["uninstall", "--yes", "--json", "--bin-dir", binDir]);
    if (!uninstall.removedCommands.some((removed) => removed === command)) {
      throw new Error(`uninstall kept the command: ${JSON.stringify(uninstall)}`);
    }
    await waitFor(() => !existsSync(prefix), windows ? 60_000 : 5_000, "the prefix removal");
    for (const name of profileEntries) {
      if (!existsSync(join(root, name))) throw new Error(`uninstall removed profile data ${name}`);
    }
    return {
      ok: true,
      version: metadata.version,
      target: metadata.target,
      prefixRemoval: uninstall.prefixRemoval,
    };
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const argv = process.argv.slice(2);
    const option = (name) => {
      const index = argv.indexOf(name);
      return index >= 0 ? argv[index + 1] : undefined;
    };
    const archive = option("--archive");
    const metadataPath = option("--metadata");
    if (!archive || !metadataPath) {
      throw new Error("Usage: installer-qualification.mjs --archive <archive> --metadata <json>");
    }
    const result = await qualifyInstaller({
      archive: resolve(archive),
      metadataPath: resolve(metadataPath),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  }
}
