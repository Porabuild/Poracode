#!/usr/bin/env node
/**
 * Out-of-checkout standalone server qualification (V6 D.1 + D.4).
 *
 * Installs a tarball to a prefix outside the checkout, runs doctor, starts,
 * pairs, sends one terminal-thread turn and reads its effect back over the
 * terminal watch, SIGTERMs, asserts the owner lease is released — then
 * upgrades the same prefix from the same tarball, re-runs doctor plus one
 * authenticated request against the upgraded install, and SIGTERMs the
 * upgraded daemon asserting the lease is released again.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installServerPrefix } from "./install-server-prefix.mjs";
import { readServerArtifactMetadata } from "./server-artifact-metadata.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Plan D3: qualification runs on the exact artifact metadata the release will
 * promote. The tarball hash must match, and every resource the metadata
 * advertises (bundled web client, native overlay targets) must be present in
 * the installed release.
 */
function assertArtifactIntegrity({ tarball, artifactPath, prefix }) {
  if (!artifactPath) return null;
  const metadata = readServerArtifactMetadata(artifactPath);
  const actual = sha256File(tarball);
  if (actual !== metadata.tarball.sha256) {
    throw new Error(
      `artifact integrity failed: tarball sha256 ${actual} does not match server-artifact.json ` +
        `${metadata.tarball.sha256}`,
    );
  }
  const current = join(prefix, "current");
  const releasePackage = JSON.parse(readFileSync(join(current, "package.json"), "utf8"));
  if (releasePackage.version !== metadata.version) {
    throw new Error(
      `artifact integrity failed: installed version ${releasePackage.version} does not match ` +
        `server-artifact.json ${metadata.version}`,
    );
  }
  if (metadata.webClient?.present === true) {
    const index = join(current, "renderer", "index.html");
    if (!existsSync(index)) {
      throw new Error(`artifact integrity failed: advertised web client is missing (${index})`);
    }
  }
  // The documented target recipe installs and runs from the artifact alone, so
  // the frozen bytes must ship the thin prefix installer (with its full import
  // closure) and the systemd unit.
  for (const shippedPath of [
    "scripts/install-server-prefix.mjs",
    "scripts/server-release-install.mjs",
    "scripts/server-native-overlay.mjs",
    "packaging/systemd/poracode-server.service",
  ]) {
    if (!existsSync(join(current, shippedPath))) {
      throw new Error(`artifact integrity failed: release is missing ${shippedPath}`);
    }
  }
  for (const moduleName of ["node-pty", "better-sqlite3"]) {
    const overlayPath = join(current, "native-overlay", moduleName, "overlay.json");
    if (!existsSync(overlayPath)) continue;
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    const pinned = releasePackage.dependencies?.[moduleName];
    if (typeof overlay.version === "string" && pinned !== undefined && overlay.version !== pinned) {
      throw new Error(
        `artifact integrity failed: ${moduleName} overlay ${overlay.version} != package pin ${pinned}`,
      );
    }
  }
  return metadata;
}

function allocateLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "qualification\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "pipe" });
  execFileSync(
    "git",
    ["-c", "user.email=qualify@poracode.local", "-c", "user.name=qualify", "commit", "-m", "init"],
    { cwd: dir, stdio: "pipe" },
  );
}

function waitForText(stream, needle, timeoutMs) {
  return new Promise((resolveWait, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${needle}`)), timeoutMs);
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes(needle)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolveWait(buf);
      }
    };
    stream.on("data", onData);
  });
}

function startPtyWatch({ wsUrl, shellId }) {
  const ws = new WebSocket(wsUrl);
  let buf = "";
  const opened = new Promise((resolveOpened, reject) => {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "terminal-watch", id: shellId }));
      resolveOpened();
    });
    ws.addEventListener("error", reject);
  });
  return {
    opened,
    waitFor(needle, timeoutMs) {
      return new Promise((resolveFrame, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for PTY echo ${needle}`)),
          timeoutMs,
        );
        const onMessage = (event) => {
          let frame;
          try {
            frame = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (frame?.type === "terminal-output" && typeof frame.data === "string") {
            buf += frame.data;
            if (buf.includes(needle)) {
              clearTimeout(timer);
              ws.removeEventListener("message", onMessage);
              resolveFrame(true);
            }
          }
        };
        if (buf.includes(needle)) {
          clearTimeout(timer);
          resolveFrame(true);
          return;
        }
        ws.addEventListener("message", onMessage);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function jsonRequest(url, { method = "GET", token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

/** Environment for a spawned server/CLI step. `port === null` selects a
 * read-only one-shot command (doctor, pair) that must not touch a listener. */
function serverEnv(profile, port) {
  return {
    ...process.env,
    PORACODE_BASE_DIR: profile,
    PORACODE_HEADLESS_SERVER: "1",
    ...(port === null
      ? {}
      : { PORACODE_REMOTE_ACCESS_HOST: "127.0.0.1", PORACODE_REMOTE_ACCESS_PORT: String(port) }),
  };
}

function assertDoctorOk(entry, profile, label) {
  const doctor = execFileSync(process.execPath, [entry, "doctor", "--json"], {
    encoding: "utf8",
    env: serverEnv(profile, null),
  });
  const doctorReport = JSON.parse(doctor);
  if ((doctorReport.checks ?? []).some((check) => check.status === "error")) {
    throw new Error(`${label} doctor failed: ${doctor}`);
  }
  return doctorReport;
}

/** Pair against the running daemon, exchange the credential, read describe. */
async function pairAndAuthenticate(entry, profile, httpBase) {
  const pairingRaw = execFileSync(process.execPath, [entry, "pair", "--json"], {
    encoding: "utf8",
    env: serverEnv(profile, null),
  });
  const pairing = JSON.parse(pairingRaw);
  const credential = new URLSearchParams(new URL(pairing.pairingUrl).hash.replace(/^#/, "")).get(
    "token",
  );
  if (!credential) throw new Error("pair --json missing token");

  const token = await jsonRequest(`${httpBase}/oauth/token`, {
    method: "POST",
    body: {
      grantType: "pairing-token",
      credential,
      scopes: [
        "session:read",
        "session:operate",
        "projects:manage",
        "terminal:operate",
        "terminal:read",
      ],
      client: { label: "qualify", deviceType: "desktop" },
    },
  });
  if (token.status !== 200) throw new Error(`token ${token.status}`);

  const describeRes = await jsonRequest(`${httpBase}/api/host/describe`, {
    token: token.body.accessToken,
  });
  if (describeRes.status !== 200) {
    throw new Error(`describe ${describeRes.status}: ${JSON.stringify(describeRes.body)}`);
  }
  return {
    token: token.body.accessToken,
    capabilities: describeRes.body?.capabilities ?? {},
  };
}

function assertOutOfCheckoutCapabilities(doctorReport, capabilities) {
  if (capabilities.ssh !== true || capabilities.computerUse !== true) {
    throw new Error(
      `C.1 out-of-checkout host must declare ssh:true and computerUse:true: ${JSON.stringify(capabilities)}`,
    );
  }
  if (
    doctorReport.hostServices?.ssh?.enabled !== true ||
    doctorReport.hostServices?.computerUse?.enabled !== true
  ) {
    throw new Error(
      `doctor hostServices not enabled: ${JSON.stringify(doctorReport.hostServices)}`,
    );
  }
}

function readOwnerRecord(profile) {
  const ownerRecordPath = `${profile}.host-owner.json`;
  if (!existsSync(ownerRecordPath)) return null;
  return JSON.parse(readFileSync(ownerRecordPath, "utf8"));
}

async function waitForOwnerPhase(profile, phase, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = readOwnerRecord(profile);
    let processGone = true;
    if (record && Number.isSafeInteger(record.pid) && record.pid > 0) {
      try {
        process.kill(record.pid, 0);
        processGone = false;
      } catch {
        processGone = true;
      }
    }
    if (record?.phase === phase && processGone) return record;
    if (Date.now() >= deadline) {
      throw new Error(
        `lease did not reach phase=${phase}: ${JSON.stringify(readOwnerRecord(profile))}`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 20_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

/** Send one terminal-thread turn and assert its EFFECT comes back (V6 D.1).
 * The needle only exists in the command's OUTPUT — the shell must execute the
 * arithmetic — so the echoed input can never satisfy the wait. */
async function runOneThreadTurn({ httpBase, token, shellId, ticket }) {
  const watch = startPtyWatch({
    wsUrl: `ws://127.0.0.1:${new URL(httpBase).port}/ws?ticket=${encodeURIComponent(ticket)}`,
    shellId,
  });
  await watch.opened;
  try {
    await Promise.all([
      watch.waitFor("pty-192-turn", 20_000),
      (async () => {
        const written = await jsonRequest(`${httpBase}/api/threads/${shellId}/terminal/write`, {
          method: "POST",
          token,
          body: { data: "sh -c 'echo pty-$((128+64))-turn'\n" },
        });
        if (written.status !== 200) {
          throw new Error(`terminal/write ${written.status}: ${JSON.stringify(written.body)}`);
        }
      })(),
    ]);
  } finally {
    watch.close();
  }
}

/**
 * Upgrade the running-install prefix from the tarball just installed (V6 D.4),
 * re-run doctor plus one authenticated request against the upgraded install,
 * and SIGTERM the upgraded daemon asserting the lease is released.
 */
async function runUpgradePhase({ prefix, tarball, profile, port, httpBase }) {
  const entry = join(prefix, "current", "lib", "server.cjs");
  const currentBefore = readlinkSync(join(prefix, "current"));

  // The upgrade CLI respawns the daemon detached with this process's
  // environment, so it rebinds the same loopback port and profile.
  const upgradeStdout = execFileSync(
    process.execPath,
    [entry, "upgrade", "--from", tarball, "--prefix", prefix, "--json"],
    { encoding: "utf8", env: serverEnv(profile, port), stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = JSON.parse(upgradeStdout.trim().split("\n").at(-1));
  if (result.ok !== true || result.rolledBack !== false) {
    throw new Error(`upgrade failed: ${JSON.stringify(result)}`);
  }
  const currentAfter = readlinkSync(join(prefix, "current"));
  if (currentAfter === currentBefore) {
    throw new Error(`upgrade did not swap <prefix>/current: ${currentAfter}`);
  }

  const doctorReport = assertDoctorOk(entry, profile, "upgraded-install");
  const { capabilities } = await pairAndAuthenticate(entry, profile, httpBase);
  assertOutOfCheckoutCapabilities(doctorReport, capabilities);

  const pidPath = join(prefix, "poracode-server.pid");
  if (!existsSync(pidPath)) {
    throw new Error(
      "upgrade restart did not record the new daemon pid — the default restart is a no-op",
    );
  }
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error(`invalid upgraded daemon pid: ${pid}`);
  process.kill(pid, "SIGTERM");
  await waitForOwnerPhase(profile, "stopped", 20_000);
  return { ok: true, upgradedDaemonPid: pid, current: currentAfter };
}

export async function qualifyServerInstall(options) {
  const prefix = options.prefix;
  const entry = join(prefix, "current", "lib", "server.cjs");
  if (!existsSync(entry)) throw new Error(`installed server missing: ${entry}`);
  const artifactMetadata =
    options.tarball && options.artifactPath
      ? assertArtifactIntegrity({
          tarball: options.tarball,
          artifactPath: options.artifactPath,
          prefix,
        })
      : null;

  const profile = mkdtempSync(join(options.workRoot ?? tmpdir(), "poracode-qualify-profile-"));
  // Project files are not legacy profile data. Keeping them in the profile
  // namespace would correctly trigger the host's offline-import admission gate.
  const project = mkdtempSync(join(options.workRoot ?? tmpdir(), "poracode-qualify-project-"));
  gitInit(project);

  const doctorReport = assertDoctorOk(entry, profile, "pre-start");

  const port = await allocateLoopbackPort();
  const httpBase = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [entry], {
    env: serverEnv(profile, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  try {
    await waitForText(child.stdout, "listening at:", 60_000);
    const envRes = await fetch(`${httpBase}/.well-known/poracode/environment`);
    if (!envRes.ok) throw new Error(`environment ${envRes.status}`);

    const { token, capabilities } = await pairAndAuthenticate(entry, profile, httpBase);
    assertOutOfCheckoutCapabilities(doctorReport, capabilities);

    const add = await jsonRequest(`${httpBase}/api/projects/command`, {
      method: "POST",
      token,
      body: { kind: "add-existing", path: project, name: "qualify" },
    });
    if (add.status !== 200 && add.status !== 201) {
      throw new Error(`add-existing ${add.status}: ${JSON.stringify(add.body)}`);
    }

    const shellId = "qualify-shell";
    const start = await jsonRequest(`${httpBase}/api/terminal/start`, {
      method: "POST",
      token,
      body: {
        shellId,
        projectLocation: { kind: "posix", path: project },
        initialSize: { cols: 80, rows: 24 },
      },
    });
    if (start.status !== 200) {
      throw new Error(`terminal/start ${start.status}: ${JSON.stringify(start.body)}`);
    }
    const ticket = await jsonRequest(`${httpBase}/api/auth/websocket-ticket`, {
      method: "POST",
      token,
    });
    if (ticket.status !== 200 || typeof ticket.body?.ticket !== "string") {
      throw new Error(`websocket-ticket ${ticket.status}: ${JSON.stringify(ticket.body)}`);
    }
    await runOneThreadTurn({ httpBase, token, shellId, ticket: ticket.body.ticket });
  } finally {
    await stopChild(child);
  }

  // Throws with the observed record when the lease is not cleanly released.
  await waitForOwnerPhase(profile, "stopped", 20_000);

  let upgrade;
  if (options.tarball) {
    upgrade = await runUpgradePhase({
      prefix,
      tarball: resolve(options.tarball),
      profile,
      port,
      httpBase,
    });
  }

  return {
    profile,
    prefix,
    doctor: doctorReport,
    ownerPhase: "stopped",
    upgrade,
    artifactVersion: artifactMetadata?.version ?? null,
    webClient: artifactMetadata?.webClient ?? null,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  let tarball = argv.find((_, i) => argv[i - 1] === "--tarball");
  let prefix = argv.find((_, i) => argv[i - 1] === "--prefix");
  let artifactPath = argv.find((_, i) => argv[i - 1] === "--artifact");
  if (!tarball) {
    throw new Error(
      "Usage: server-install-qualification.mjs --tarball <file> [--prefix <dir>] " +
        "[--artifact <server-artifact.json>]",
    );
  }
  tarball = resolve(tarball);
  const workRoot = mkdtempSync(join(tmpdir(), "poracode-qualify-"));
  prefix = prefix ? resolve(prefix) : join(workRoot, "prefix");
  if (!existsSync(join(prefix, "current", "lib", "server.cjs"))) {
    installServerPrefix({ tarball, prefix });
  }
  const result = await qualifyServerInstall({
    prefix,
    workRoot,
    tarball,
    ...(artifactPath ? { artifactPath: resolve(artifactPath) } : {}),
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      ownerPhase: result.ownerPhase,
      upgrade: result.upgrade?.ok === true,
      artifactVersion: result.artifactVersion,
      webClientPresent: result.webClient?.present === true,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  });
}
