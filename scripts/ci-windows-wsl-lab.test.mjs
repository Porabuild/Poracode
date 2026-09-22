import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDistroNameSafe,
  buildSshProbeArgs,
  buildWslconfig,
  computeTaskkillArgs,
  decodeWslOutput,
  hasDistro,
  isPublicKeyLine,
  normalizeNetworkingMode,
  parseArgv,
  parseDistroList,
  parseOsReleaseField,
  PRIMARY_DISTRO,
  redactPrivateMaterial,
  runBounded,
  SECONDARY_DISTRO,
  SSHD_CONFIGURE_SCRIPT,
  SSHD_INSTALL_SCRIPT,
  TYPED_EXIT_CODES,
  UsageError,
  validateLabJson,
  main,
} from "./ci-windows-wsl-lab.mjs";

// Pure coverage for the Windows/WSL lab CLI. Everything here runs on any host
// OS: no WSL, no wsl.exe, and no network. `runBounded` cases use the current
// `node` binary so the bounded-subprocess contract is itself exercised on the
// machine running the tests.

// ── Distro name fixtures ─────────────────────────────────────────────────────

void test("the lab's distro names are exactly the qualification matrix", () => {
  assert.match(PRIMARY_DISTRO, /^[a-z0-9-]+$/u, "the primary name is plain ASCII");
  assert.match(SECONDARY_DISTRO, / /u, "the secondary name contains spaces");
  // oxlint-disable-next-line no-control-regex -- the ASCII ceiling is the point
  assert.match(SECONDARY_DISTRO, /[^\u0000-\u007f]/u, "the secondary name is non-ASCII");
  assert.doesNotMatch(
    SECONDARY_DISTRO,
    /[\uD800-\uDFFF]/u,
    "no astral characters: a single argv encoding bug stays attributable",
  );
  assert.doesNotThrow(() => assertDistroNameSafe(PRIMARY_DISTRO));
  assert.doesNotThrow(() => assertDistroNameSafe(SECONDARY_DISTRO));
});

void test("distro name validation rejects NUL, control characters, and absurd lengths", () => {
  assert.throws(() => assertDistroNameSafe(""), UsageError);
  assert.throws(() => assertDistroNameSafe("a\0b"), UsageError);
  assert.throws(() => assertDistroNameSafe("a\nb"), UsageError);
  assert.throws(() => assertDistroNameSafe(`a${String.fromCodePoint(1)}b`), UsageError);
  assert.throws(() => assertDistroNameSafe("a".repeat(121)), UsageError);
});

// ── wsl.exe output decoding ──────────────────────────────────────────────────

void test("decodeWslOutput handles BOM'd and bare UTF-16LE plus plain UTF-8", () => {
  const withBom = Buffer.from("\uFEFFUbuntu-24.04\r\nWindows Subsystem", "utf16le");
  assert.deepEqual(parseDistroList(decodeWslOutput(withBom)), [
    "Ubuntu-24.04",
    "Windows Subsystem",
  ]);

  const bare = Buffer.from("poracode-ci-ubuntu-24-04\r\nPoracode CI Ünïcodé", "utf16le");
  assert.deepEqual(parseDistroList(decodeWslOutput(bare)), [
    "poracode-ci-ubuntu-24-04",
    "Poracode CI Ünïcodé",
  ]);

  const utf8 = Buffer.from("/etc/os-release: ok\n", "utf8");
  assert.equal(decodeWslOutput(utf8), "/etc/os-release: ok\n");
});

void test("parseDistroList keeps spaces, drops the legacy header line and blanks", () => {
  assert.deepEqual(parseDistroList("Poracode CI Ünïcodé 日本語 24 04\r\n\r\nUbuntu (default)\n"), [
    "Poracode CI Ünïcodé 日本語 24 04",
    "Ubuntu (default)",
  ]);
  assert.deepEqual(parseDistroList("Windows Subsystem for Linux Distributions:\nUbuntu"), [
    "Ubuntu",
  ]);
  assert.deepEqual(parseDistroList(""), []);
});

void test("hasDistro matches case-insensitively without reformatting names", () => {
  assert.equal(
    hasDistro(["Poracode CI Ünïcodé 日本語 24 04"], "poracode ci ünïcodé 日本語 24 04"),
    true,
  );
  assert.equal(hasDistro(["Ubuntu"], "Ubuntu-24.04"), false);
});

// ── Networking mode helpers ──────────────────────────────────────────────────

void test("normalizeNetworkingMode reads wslinfo and ip-route shapes", () => {
  assert.equal(normalizeNetworkingMode("mirrored\n"), "mirrored");
  assert.equal(normalizeNetworkingMode("nat"), "nat");
  assert.equal(normalizeNetworkingMode("default"), "nat");
  assert.equal(normalizeNetworkingMode(""), "unknown");
  assert.equal(normalizeNetworkingMode("garbage\n"), "unknown");
});

void test("buildWslconfig mirrors by owning the file and is idempotent", () => {
  const fromNat = buildWslconfig("mirrored", "[wsl2]\nnetworkingMode=nat\nmemory=4\n");
  assert.equal(fromNat.changed, true);
  assert.equal(fromNat.content, "[wsl2]\nnetworkingMode=mirrored\n");

  const already = buildWslconfig("mirrored", "[wsl2]\nnetworkingMode=mirrored\nmemory=4\n");
  assert.equal(already.changed, false);
  assert.equal(already.content, "[wsl2]\nnetworkingMode=mirrored\nmemory=4\n");

  const fromNothing = buildWslconfig("mirrored", null);
  assert.equal(fromNothing.changed, true);
  assert.equal(fromNothing.content, "[wsl2]\nnetworkingMode=mirrored\n");
});

void test("buildWslconfig for nat only strips the networkingMode key", () => {
  const strip = buildWslconfig("nat", "[wsl2]\nnetworkingMode=mirrored\nmemory=4\n");
  assert.equal(strip.changed, true);
  assert.equal(strip.content, "[wsl2]\nmemory=4\n");

  const untouched = buildWslconfig("nat", "[wsl2]\nmemory=4\n");
  assert.equal(untouched.changed, false);
  assert.equal(untouched.content, "[wsl2]\nmemory=4\n");

  const absent = buildWslconfig("nat", null);
  assert.equal(absent.changed, false);
  assert.equal(absent.content, null);

  const toEmpty = buildWslconfig("nat", "[wsl2]\nnetworkingMode=mirrored\n");
  assert.equal(toEmpty.changed, true);
  assert.equal(toEmpty.content, null, "an emptied file is deleted, not left behind");
});

// ── os-release parsing ───────────────────────────────────────────────────────

void test("parseOsReleaseField reads quoted and bare values", () => {
  const contents = 'NAME="Ubuntu"\nVERSION_ID=24.04\nID=ubuntu\n';
  assert.equal(parseOsReleaseField(contents, "VERSION_ID"), "24.04");
  assert.equal(parseOsReleaseField(contents, "NAME"), "Ubuntu");
  assert.equal(parseOsReleaseField(contents, "MISSING"), null);
});

// ── Redaction ────────────────────────────────────────────────────────────────

void test("redactPrivateMaterial scrubs whole private key blocks and explicit secrets", () => {
  const dirty = [
    "before",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "b3BlbnNzaC1rZXktdjEAAAAA",
    "-----END OPENSSH PRIVATE KEY-----",
    "after",
  ].join("\n");
  const clean = redactPrivateMaterial(dirty);
  assert.doesNotMatch(clean, /b3BlbnNzaC1rZXktdjEAAAAA/u);
  assert.match(clean, /\[redacted-private-key\]/u);
  assert.match(clean, /before[\s\S]*after/u);

  assert.equal(
    redactPrivateMaterial("leak /state/keys and /state/keys again", ["/state/keys"]),
    "leak [redacted] and [redacted] again",
  );
  assert.equal(redactPrivateMaterial("ordinary text"), "ordinary text");
});

// ── taskkill / bounded subprocess contract ──────────────────────────────────

void test("computeTaskkillArgs kills the whole tree forcibly", () => {
  assert.deepEqual(computeTaskkillArgs(4242), ["/pid", "4242", "/T", "/F"]);
});

void test("runBounded captures output and honors the exit-code contract", async () => {
  const ok = await runBounded(process.execPath, ["-e", "process.stdout.write('lab-ok')"], {
    timeoutMs: 10_000,
  });
  assert.equal(ok.code, 0);
  assert.equal(ok.stdout.toString("utf8"), "lab-ok");

  await assert.rejects(
    runBounded(process.execPath, ["-e", "process.exit(3)"], { timeoutMs: 10_000 }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /exit 3/u);
      return true;
    },
  );

  const tolerated = await runBounded(process.execPath, ["-e", "process.exit(3)"], {
    timeoutMs: 10_000,
    allowExitCodes: [3],
  });
  assert.equal(tolerated.code, 3);
});

void test("runBounded pipes stdin verbatim (the shell-script transport)", async () => {
  const result = await runBounded(
    process.execPath,
    [
      "-e",
      "let data=''; process.stdin.on('data', (c) => (data += c)); process.stdin.on('end', () => process.stdout.write(data.toUpperCase()));",
    ],
    { timeoutMs: 10_000, stdin: "echo '$1'\n" },
  );
  assert.equal(result.stdout.toString("utf8"), "ECHO '$1'\n");
});

void test("runBounded kills timed-out subprocesses and rejects with a timeout code", async () => {
  const started = Date.now();
  await assert.rejects(
    runBounded(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 250 }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /timeout/u);
      return true;
    },
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 10_000, `the deadline must actually fire (took ${elapsed}ms)`);
});

void test("runBounded refuses to run without a positive deadline", () => {
  assert.throws(() => runBounded(process.execPath, ["-e", ""], { timeoutMs: 0 }), UsageError);
});

// ── sshd scripts and probe argv ─────────────────────────────────────────────

void test("the in-distro sshd scripts are constants with positional data only", () => {
  for (const script of [SSHD_INSTALL_SCRIPT, SSHD_CONFIGURE_SCRIPT]) {
    assert.ok(!script.includes(PRIMARY_DISTRO), "no distro name may be baked into the script");
    assert.ok(!script.includes(SECONDARY_DISTRO), "no distro name may be baked into the script");
    assert.ok(!/[A-Z]:\\\\/u.test(script), "no Windows path may be baked into the script");
  }
  assert.match(SSHD_CONFIGURE_SCRIPT, /port="\$1"/u);
  assert.match(SSHD_CONFIGURE_SCRIPT, /pubkey="\$2"/u);
  assert.match(SSHD_CONFIGURE_SCRIPT, /PasswordAuthentication no/u);
  assert.match(SSHD_CONFIGURE_SCRIPT, /chmod 600 \/root\/\.ssh\/authorized_keys/u);
});

void test("public key lines are allowlisted before they may reach the script argv", () => {
  assert.equal(
    isPublicKeyLine("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample poracode-wsl-lab"),
    true,
  );
  assert.equal(isPublicKeyLine("ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB poracode-wsl-lab"), true);
  assert.equal(isPublicKeyLine("ssh-ed25519 AA\nAA comment"), false);
  assert.equal(isPublicKeyLine("ssh-ed25519 AA;rm -rf / comment"), false);
  assert.equal(isPublicKeyLine("not-a-key"), false);
});

void test("ssh probe argv is a flat array with the remote command as constants", () => {
  const args = buildSshProbeArgs({
    keyPath: "/state/keys/id_ed25519",
    port: 22022,
    knownHostsPath: "/state/keys/known_hosts",
  });
  assert.equal(args[0], "-p");
  assert.equal(args[1], "22022");
  assert.deepEqual(args.slice(-2), ["printf", "sshd-ok"]);
  assert.ok(args.includes("/state/keys/id_ed25519"), "the key path rides as one argv element");
  assert.ok(!args.some((arg) => arg.includes(" ")), "no argv element ever needs shell quoting");
});

// ── CLI parsing ──────────────────────────────────────────────────────────────

void test("parseArgv applies documented defaults and derives the state dir", () => {
  const options = parseArgv(["provision"]);
  assert.equal(options.command, "provision");
  assert.equal(options.mode, "nat");
  assert.equal(options.withSshd, false);
  assert.equal(options.guestIngress, true);
  assert.equal(options.state, ".tmp/windows-wsl-lab-state");

  const trailingSlash = parseArgv(["provision", "--out", "evidence//"]);
  assert.equal(trailingSlash.state, "evidence-state");
});

void test("parseArgv accepts the full provision flag set", () => {
  const options = parseArgv([
    "provision",
    "--mode",
    "mirrored",
    "--with-sshd",
    "--out",
    "ev",
    "--state",
    "st",
    "--rootfs",
    "C:\\cache\\rootfs.tar.gz",
    "--rootfs-sha256",
    "a".repeat(64),
    "--sshd-port",
    "22100",
    "--reachability-port",
    "22400",
  ]);
  assert.equal(options.mode, "mirrored");
  assert.equal(options.withSshd, true);
  assert.equal(options.out, "ev");
  assert.equal(options.state, "st");
  assert.equal(options.rootfs, "C:\\cache\\rootfs.tar.gz");
  assert.equal(options.rootfsSha256, "a".repeat(64));
  assert.equal(options.sshdPort, 22100);
  assert.equal(options.reachabilityPort, 22400);
});

void test("parseArgv rejects garbage instead of interpreting it", () => {
  assert.throws(() => parseArgv(["frobnicate"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--mode", "bridge"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--unknown"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--out"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--sshd-port", "0"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--sshd-port", "99999"]), UsageError);
  assert.throws(() => parseArgv(["provision", "--sshd-port", "22o22"]), UsageError);
  assert.equal(parseArgv(["--help"]).command, "help");
});

// ── Lab manifest validation ──────────────────────────────────────────────────

function validLab() {
  return {
    schema: "poracode-windows-wsl-lab/1",
    runId: "r1",
    startedAt: "2026-09-22T00:00:00.000Z",
    finishedAt: "2026-09-22T00:05:00.000Z",
    host: { platform: "win32", wslVersion: "WSL 2.x" },
    mode: "nat",
    modeChanged: false,
    evidenceDir: "C:\\ev",
    stateDir: "C:\\st",
    distros: [
      { name: PRIMARY_DISTRO, role: "primary", importedByThisRun: true, installDir: "C:\\d1" },
      { name: SECONDARY_DISTRO, role: "secondary", importedByThisRun: false, installDir: "C:\\d2" },
    ],
    sshd: { configured: true, ports: { [PRIMARY_DISTRO]: 22022 } },
    firewall: { ruleName: null, ruleAdded: false },
    reachabilityPort: 22333,
    checks: [{ name: "wsl-present", ok: true, ms: 12 }],
  };
}

void test("validateLabJson accepts a well-formed manifest and returns it", () => {
  const lab = validLab();
  assert.equal(validateLabJson(lab), lab);
  assert.equal(validateLabJson(JSON.parse(JSON.stringify(lab))).mode, "nat");
});

void test("validateLabJson fails closed on any shape drift", () => {
  const cases = [
    () => validateLabJson(null),
    () => validateLabJson({ ...validLab(), schema: "old/0" }),
    () => validateLabJson({ ...validLab(), mode: "bridged" }),
    () => validateLabJson({ ...validLab(), distros: [] }),
    () => {
      const lab = validLab();
      delete lab.distros[1].importedByThisRun;
      return validateLabJson(lab);
    },
    () => validateLabJson({ ...validLab(), firewall: { ruleAdded: "yes" } }),
    () => validateLabJson({ ...validLab(), reachabilityPort: 0 }),
    () => {
      const lab = validLab();
      lab.distros[0].role = "tertiary";
      return validateLabJson(lab);
    },
  ];
  for (const runCase of cases) assert.throws(runCase, Error);
});

// ── Exit-code contract ───────────────────────────────────────────────────────

void test("every typed failure exits nonzero with distinct codes", () => {
  for (const [code, value] of Object.entries(TYPED_EXIT_CODES)) {
    if (code === "OK") {
      assert.equal(value, 0);
      continue;
    }
    assert.ok(value > 0, `${code} must exit nonzero`);
  }
  assert.notEqual(TYPED_EXIT_CODES.NOT_WINDOWS, TYPED_EXIT_CODES.WSL_MISSING);
  assert.notEqual(TYPED_EXIT_CODES.PROVISION_FAILED, TYPED_EXIT_CODES.CLEANUP_FAILED);
});

if (process.platform !== "win32") {
  void test("provision fails closed with NOT_WINDOWS off Windows without touching anything", async () => {
    const code = await main(["provision", "--out", "unused-evidence"]);
    assert.equal(code, TYPED_EXIT_CODES.NOT_WINDOWS);
  });
}

void test("usage errors exit with the typed USAGE code from any host", async () => {
  assert.equal(await main(["frobnicate"]), TYPED_EXIT_CODES.USAGE);
  assert.equal(await main(["provision", "--mode", "teleport"]), TYPED_EXIT_CODES.USAGE);
});
