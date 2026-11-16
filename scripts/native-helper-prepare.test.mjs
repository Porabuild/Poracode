// Driver tests for scripts/lib/native-helper-prepare.mjs and the two spec
// scripts. Nothing here invokes cargo: argument parsing, target selection,
// the unsupported-arch fallback, and the --hello handshake / manifest verify
// run against a stub executable and temporary staging dirs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  NATIVE_HELPER_TARGETS,
  UnsupportedArchError,
  parseArgs,
  readHello,
  requestedTargets,
  runNativeHelperPrepare,
  verifyRequested,
} from "./lib/native-helper-prepare.mjs";
import { spec as helperSpec } from "./prepare-computer-use-helper.mjs";
import { spec as relaySpec } from "./prepare-mcp-relay.mjs";
import { spec as gitHelperSpec } from "./prepare-git-helper.mjs";

const temps = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "native-helper-prepare-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stubHello(dir, payload) {
  const path = join(dir, "stub-helper");
  writeFileSync(path, `#!/bin/sh\nprintf '%s' '${JSON.stringify(payload)}'\n`);
  chmodSync(path, 0o755);
  return path;
}

void describe("parseArgs", () => {
  void it("parses shared flags for the relay spec", () => {
    assert.deepEqual(parseArgs(["--host-only", "--require", "--platform=linux"], {}), {
      arch: null,
      check: false,
      force: false,
      hostOnly: true,
      platform: "linux",
      require: true,
    });
    assert.equal(parseArgs(["--arch", "arm64"], {}).arch, "arm64");
    assert.throws(() => parseArgs(["--dev"], {}), /Unknown argument: --dev/u);
    assert.throws(() => parseArgs(["--platform"], {}), /requires a value/u);
  });

  void it("parses the computer-use --dev flag only for its spec", () => {
    const options = parseArgs(["--dev", "--check"], helperSpec.extraFlags);
    assert.equal(options.dev, true);
    assert.equal(options.check, true);
    assert.equal(parseArgs([], helperSpec.extraFlags).dev, false);
    assert.throws(() => parseArgs(["--dev"], {}), /Unknown argument/u);
  });
});

void describe("requestedTargets", () => {
  void it("selects the macOS universal target and per-arch Windows targets", () => {
    assert.deepEqual(requestedTargets("mac", null, true, "x64", NATIVE_HELPER_TARGETS, "relay"), [
      { arch: "universal", id: "darwin-universal" },
    ]);
    assert.deepEqual(
      requestedTargets("win", "arm64", true, "x64", NATIVE_HELPER_TARGETS, "relay"),
      [{ arch: "arm64", id: "win32-arm64", triple: "aarch64-pc-windows-msvc" }],
    );
    assert.equal(
      requestedTargets("win", null, false, "x64", NATIVE_HELPER_TARGETS, "relay").length,
      2,
    );
    assert.equal(
      requestedTargets("linux", null, false, "arm64", NATIVE_HELPER_TARGETS, "relay").length,
      1,
    );
  });

  void it("throws UnsupportedArchError for an arch with no target", () => {
    assert.throws(
      () => requestedTargets("linux", null, true, "arm64", NATIVE_HELPER_TARGETS, "relay"),
      (error) =>
        error instanceof UnsupportedArchError &&
        error.message === "Unsupported linux relay architecture: arm64",
    );
  });

  void it("rejects a non-universal macOS arch with a plain usage error", () => {
    assert.throws(
      () => requestedTargets("mac", "x64", false, "x64", NATIVE_HELPER_TARGETS, "helper"),
      /The macOS helper is always staged as a universal binary/u,
    );
  });
});

void describe("unsupported host arch fallback", () => {
  void it("warns and exits 0 for the relay on --host-only without --require", () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      runNativeHelperPrepare(relaySpec, {
        platform: "linux",
        arch: "arm64",
        argv: ["--host-only"],
      });
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Unsupported linux relay architecture: arm64/u);
    assert.match(warnings[0], /JavaScript relay/u);
  });

  void it("still fails for the computer-use helper and with --require", () => {
    assert.throws(
      () =>
        runNativeHelperPrepare(helperSpec, {
          platform: "linux",
          arch: "arm64",
          argv: ["--host-only"],
        }),
      UnsupportedArchError,
    );
    assert.throws(
      () =>
        runNativeHelperPrepare(relaySpec, {
          platform: "linux",
          arch: "arm64",
          argv: ["--host-only", "--require"],
        }),
      UnsupportedArchError,
    );
  });

  void it("still fails for the relay on --host-only when --arch is explicit", () => {
    // The warn-and-exit-0 fallback is for hosts that simply have no target;
    // an explicit --arch request must surface the error instead.
    assert.throws(
      () =>
        runNativeHelperPrepare(relaySpec, {
          platform: "linux",
          arch: "arm64",
          argv: ["--host-only", "--arch", "arm64"],
        }),
      UnsupportedArchError,
    );
  });
});

void describe("entry-point detection", () => {
  void it("runs the spec when invoked through a symlinked directory", () => {
    // isMain() must compare realpaths: Node realpaths import.meta.url but
    // leaves argv[1] as typed, so a symlinked invocation (macOS /tmp, /var,
    // a linked worktree) would otherwise exit 0 having done nothing.
    const dir = tempDir();
    const real = join(dir, "real");
    mkdirSync(join(real, "scripts", "lib"), { recursive: true });
    mkdirSync(join(real, "src", "supervisor", "mcp"), { recursive: true });
    copyFileSync(
      new URL("./prepare-mcp-relay.mjs", import.meta.url),
      join(real, "scripts", "prepare-mcp-relay.mjs"),
    );
    copyFileSync(
      new URL("./lib/native-helper-prepare.mjs", import.meta.url),
      join(real, "scripts", "lib", "native-helper-prepare.mjs"),
    );
    copyFileSync(
      new URL("../src/supervisor/mcp/mcpToolFilterConfig.ts", import.meta.url),
      join(real, "src", "supervisor", "mcp", "mcpToolFilterConfig.ts"),
    );
    const link = join(dir, "link");
    symlinkSync(real, link, "dir");
    const result = spawnSync(
      process.execPath,
      [join(link, "scripts", "prepare-mcp-relay.mjs"), "--check"],
      { encoding: "utf8" },
    );
    // Executed, --check fails on the missing manifest under the copied
    // repo root; a broken isMain would exit 0 silently instead.
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /manifest is missing/u);
  });
});

void describe("--hello handshake and manifest verify", () => {
  void it("accepts a valid relay hello and rejects an incompatible one", () => {
    const dir = tempDir();
    const hello = {
      helper: "poracode-mcp-relay",
      helperVersion: "0.1.0",
      relayConfigVersion: relaySpec.expectedVersion(),
      platform: "darwin",
      arch: "x64",
    };
    const parsed = readHello(stubHello(dir, hello), relaySpec, relaySpec.expectedVersion());
    assert.equal(parsed.helperVersion, "0.1.0");
    const bad = join(dir, "bad-helper");
    writeFileSync(
      bad,
      `#!/bin/sh\nprintf '%s' '${JSON.stringify({ ...hello, relayConfigVersion: 99 })}'\n`,
    );
    chmodSync(bad, 0o755);
    assert.throws(
      () => readHello(bad, relaySpec, relaySpec.expectedVersion()),
      /invalid or incompatible --hello payload/u,
    );
  });

  void it("verifies the computer-use hello shape", () => {
    const dir = tempDir();
    const version = helperSpec.expectedVersion();
    const hello = {
      helperVersion: "0.1.0",
      protocolVersion: version,
      minClientProtocolVersion: 1,
      platform: "darwin",
      arch: "arm64",
      displayServer: null,
      capabilities: Object.fromEntries(
        [
          "backgroundPointer",
          "backgroundKeyboard",
          "backgroundChords",
          "accessibilityTree",
          "elementActions",
          "occludedCapture",
          "foregroundInput",
          "launchApp",
          "stableWindowIds",
        ].map((key) => [key, true]),
      ),
      permissions: { accessibility: "granted", screenRecording: "granted" },
      notes: [],
    };
    const parsed = readHello(stubHello(dir, hello), helperSpec, version);
    assert.equal(parsed.protocolVersion, version);
  });

  void it("verifies the git-helper hello shape and protocol mismatch rejection", () => {
    const version = gitHelperSpec.expectedVersion();
    assert.doesNotThrow(() =>
      gitHelperSpec.validateHello(
        {
          helper: "poracode-git-helper",
          helperVersion: "0.1.0",
          protocolVersion: version,
          platform: "win32",
          arch: "x64",
        },
        "poracode-git-helper.exe",
        version,
      ),
    );
    assert.throws(
      () =>
        gitHelperSpec.validateHello(
          {
            helper: "poracode-git-helper",
            helperVersion: "0.1.0",
            protocolVersion: 99,
            platform: "win32",
            arch: "x64",
          },
          "poracode-git-helper.exe",
          version,
        ),
      /invalid or incompatible --hello payload/u,
    );
  });

  void it("verifies manifest versions and staged targets", () => {
    const dir = tempDir();
    const resourcesRoot = join(dir, "resources");
    const binary = join(resourcesRoot, "linux-x64", "poracode-mcp-relay");
    mkdirSync(join(resourcesRoot, "linux-x64"), { recursive: true });
    writeFileSync(binary, "stub");
    const ctx = {
      repoRoot: dir,
      crateRoot: dir,
      resourcesRoot,
      binaryName: "poracode-mcp-relay",
      noun: "relay",
      scriptName: "prepare-mcp-relay",
      label: "MCP relay",
      helloNoun: "Relay",
      targetTable: NATIVE_HELPER_TARGETS,
      profile: "release",
    };
    const version = relaySpec.expectedVersion();
    const manifest = {
      helper: "poracode-mcp-relay",
      helperVersion: "0.1.0",
      relayConfigVersion: version,
      clientRelayConfigVersion: version,
      targets: ["linux-x64"],
      builtAt: new Date().toISOString(),
      gitSha: null,
    };
    verifyRequested(ctx, relaySpec, version, manifest, [
      { arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" },
    ]);
    assert.throws(
      () =>
        verifyRequested(ctx, relaySpec, version, { ...manifest, relayConfigVersion: 99 }, [
          { arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" },
        ]),
      /manifest is incompatible/u,
    );
    assert.throws(
      () =>
        verifyRequested(ctx, relaySpec, version, { ...manifest, targets: [] }, [
          { arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" },
        ]),
      /target is missing from manifest/u,
    );
  });
});
