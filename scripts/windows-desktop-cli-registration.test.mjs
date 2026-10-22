import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Dedicated native qualification: compiles and runs only this fixture, using a
// fresh UUID-scoped registry key. Never downloads a compiler or touches real PATH.
async function exerciseDesktopCliRegistration(channel) {
  const commandName = channel === "nightly" ? "poracode-next" : "poracode";
  const productFilename = channel === "nightly" ? "Poracode Nightly" : "Poracode";
  const cache = join(process.env.LOCALAPPDATA, "electron-builder", "Cache", "nsis");
  const nsisDir = process.env.PORACODE_TEST_NSIS_DIR ?? join(cache, "nsis-3.0.4.1-nsis-3.0.4.1");
  const plugins =
    process.env.PORACODE_TEST_NSIS_PLUGINS_DIR ??
    join(cache, "nsis-resources-3.4.1-nsis-resources-3.4.1", "plugins", "x86-unicode");
  const compiler = join(nsisDir, "Bin", "makensis.exe");
  assert.ok(
    existsSync(compiler),
    "Select an existing qualified NSIS directory with PORACODE_TEST_NSIS_DIR; no download is implicit.",
  );
  assert.ok(
    existsSync(join(plugins, "StdUtils.dll")),
    "Select existing NSIS resources with PORACODE_TEST_NSIS_PLUGINS_DIR.",
  );
  const scratch = join(repoRoot, "tmp");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "windows-cli-registration-"));
  const nsisString = (value) => {
    assert.ok(!/[\r\n\0]/u.test(value));
    return value.replaceAll("$", () => "$$").replaceAll('"', () => '$\\"');
  };
  const fixtureId = randomUUID();
  const ownKey = `Software\\Poracode\\CliRegistrationTests\\${fixtureId}`;
  const prefix = join(root, "selected ü ! & (app)");
  const commandDir = join(prefix, "resources", "desktop-cli");
  mkdirSync(commandDir, { recursive: true });
  const launcher = "@echo off\r\nexit /b 0\r\n";
  writeFileSync(join(commandDir, `${commandName}.cmd`), launcher);
  const hash = createHash("sha256").update(launcher).digest("hex");
  const program = join(root, "registry-fixture.exe");
  const result = join(root, "result.txt");
  const definitions = {
    PRODUCT_FILENAME: productFilename,
    BUILD_RESOURCES_DIR: root,
    PORACODE_CLI_SOURCE: join(repoRoot, "build", "desktop-cli.nsh"),
    PORACODE_CLI_ENV_KEY: `${ownKey}\\Environment`,
    PORACODE_CLI_REG_KEY: `${ownKey}\\Registration`,
    PORACODE_CLI_MUTEX_PREFIX: `PoracodeCliTest-${fixtureId}`,
    FIXTURE_REG_ROOT: ownKey,
    FIXTURE_ROOT: prefix,
    FIXTURE_EXE: program,
    FIXTURE_RESULT: result,
    FIXTURE_STDUTILS_INCLUDE: join(
      repoRoot,
      "node_modules",
      "app-builder-lib",
      "templates",
      "nsis",
      "include",
      "StdUtils.nsh",
    ),
    FIXTURE_STDUTILS_PLUGINS: plugins,
  };
  writeFileSync(
    join(root, "fixture-config.nsh"),
    "\ufeff" +
      Object.entries(definitions)
        .map(([key, value]) => `!define ${key} "${nsisString(value)}"`)
        .join("\n") +
      "\n",
  );
  writeFileSync(
    join(root, "desktop-cli-config.nsh"),
    `!define PORACODE_CLI_CHANNEL "${channel}"\n!define PORACODE_CLI_COMMAND "${commandName}"\n!define PORACODE_CLI_LAUNCHER_SHA256 "${hash}"\n`,
  );
  copyFileSync(
    join(repoRoot, "build", "desktop-cli-owner.nsh"),
    join(root, "desktop-cli-owner.nsh"),
  );
  writeFileSync(
    join(root, "fixture.nsi"),
    "\ufeff" +
      readFileSync(join(repoRoot, "scripts", "fixtures", "desktop-cli-registration.nsi"), "utf8"),
  );
  // Retain any failed build/probe, including native custody evidence, for review.
  const allowed = new Set([
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "COMSPEC",
    "PATH",
    "PATHEXT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
  ]);
  const nativeEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())),
  );
  execFileSync(compiler, ["/WX", "/V2", join(root, "fixture.nsi")], {
    cwd: root,
    env: { ...nativeEnv, NSISDIR: nsisDir },
    windowsHide: true,
  });
  const sourceHash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const receipt = {
    formatVersion: 1,
    fixtureId,
    channel,
    commandName,
    registryRoot: ownKey,
    compiler: { path: compiler, sha256: sourceHash(compiler) },
    plugin: {
      path: join(plugins, "StdUtils.dll"),
      sha256: sourceHash(join(plugins, "StdUtils.dll")),
    },
    programSha256: sourceHash(program),
    source: Object.fromEntries(
      [
        "build/desktop-cli.nsh",
        "build/desktop-cli-owner.nsh",
        "scripts/fixtures/desktop-cli-registration.nsi",
      ].map((file) => [file, sourceHash(join(repoRoot, file))]),
    ),
    result: "pending",
    workerPid: null,
    joined: false,
    workerExit: null,
  };
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  const workerImage = join(prefix, `${productFilename}.exe`);
  copyFileSync(program, workerImage);
  const worker = spawn(workerImage, ["/GuardWorker"], {
    cwd: root,
    env: nativeEnv,
    stdio: "ignore",
    windowsHide: true,
  });
  receipt.workerPid = worker.pid ?? null;
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  let workerClosed = false,
    workerError;
  worker.once("error", (error) => {
    workerError = error;
  });
  const joined = new Promise((done) =>
    worker.once("close", (code, signal) => {
      workerClosed = true;
      done({ code, signal });
    }),
  );
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  let failure;
  try {
    const readyDeadline = Date.now() + 10_000;
    while (!existsSync(join(prefix, "guard-ready"))) {
      if (workerClosed)
        throw workerError ?? new Error("Owned guard worker exited before readiness.");
      assert.ok(
        Date.now() < readyDeadline,
        "Owned guard worker did not reach its fixture barrier.",
      );
      await sleep(25);
    }
    assert.throws(
      () =>
        execFileSync(program, ["/GuardReject"], { cwd: root, env: nativeEnv, windowsHide: true }),
      (error) => error.status === 2,
      "Replacement must refuse while the exact selected runtime is held.",
    );
    await sleep(25);
    assert.equal(
      workerClosed,
      false,
      "The observed owner must remain alive until its own fixture barrier is released.",
    );
    assert.equal(worker.exitCode, null, "The guard must not terminate the owned running fixture.");
    execFileSync(program, [], { cwd: root, env: nativeEnv, windowsHide: true });
    assert.equal(readFileSync(result, "utf8"), "PASS");
    const heldUpdateStartedAt = Date.now();
    assert.throws(
      () =>
        execFileSync(program, ["--updated", "/GuardHold"], {
          cwd: root,
          env: nativeEnv,
          windowsHide: true,
          timeout: 45_000,
        }),
      (error) => error.status === 2,
      "An automatic update must refuse if the selected runtime does not retire.",
    );
    assert.ok(Date.now() - heldUpdateStartedAt >= 30_000, "Allow the bounded shutdown wait.");
    assert.equal(worker.exitCode, null, "An automatic update must not terminate the held runtime.");
    execFileSync(program, ["--updated"], {
      cwd: root,
      env: nativeEnv,
      windowsHide: true,
      timeout: 45_000,
    });
  } catch (error) {
    failure = error;
  }
  try {
    let releaseError;
    try {
      writeFileSync(join(prefix, "guard-release"), "release");
    } catch (error) {
      releaseError = error;
    }
    const retirementDeadline = Date.now() + 5_000;
    while (Date.now() < retirementDeadline) {
      if (releaseError || workerClosed) break;
      await sleep(25);
    }
    if (!workerClosed && !worker.kill() && worker.exitCode === null)
      throw new Error(
        "The exact owned fixture could not be retired; retain its PID/root evidence.",
      );
    const outcome = await joined;
    receipt.joined = true;
    receipt.workerExit = outcome;
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    if (releaseError)
      throw releaseError instanceof Error
        ? releaseError
        : new Error("Fixture release failed.", { cause: releaseError });
    assert.equal(
      outcome.code,
      0,
      "Owned worker did not confirm graceful retirement; retain the fixture evidence.",
    );
  } catch (error) {
    if (failure)
      throw new AggregateError([failure, error], "Fixture and owned teardown failed.", {
        cause: error,
      });
    throw error;
  }
  if (failure)
    throw failure instanceof Error ? failure : new Error("Fixture failed.", { cause: failure });
  receipt.result = "passed";
  writeFileSync(
    join(scratch, `windows-cli-native-${fixtureId}.json`),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  assert.ok(resolve(root).startsWith(`${resolve(scratch)}${sep}`));
  rmSync(root, { recursive: true, force: true });
}

for (const channel of ["stable", "nightly"]) {
  await test(
    `native Windows ${channel} desktop CLI registry ownership and lossless PATH edits`,
    { skip: process.platform !== "win32" },
    () => exerciseDesktopCliRegistration(channel),
  );
}
