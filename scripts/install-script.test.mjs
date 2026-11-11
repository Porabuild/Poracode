import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serveDirectory } from "./installer-qualification.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const installScript = join(repoRoot, "website", "public", "install.sh");
const posixOnly = {
  skip: process.platform === "win32" ? "install.sh is the POSIX installer" : false,
};
const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempDirs.push(dir);
  return dir;
}

const hostTarget = `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;

/** A fake release directory served over file:// with SHA256SUMS. */
function publishRelease(base, version, options = {}) {
  const stage = join(base, `stage-${version}`);
  mkdirSync(join(stage, "bin"), { recursive: true });
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "runtime"), { recursive: true });
  writeFileSync(join(stage, "runtime", "node"), '#!/bin/sh\nexec node "$@"\n', { mode: 0o755 });
  writeFileSync(
    join(stage, "standalone.json"),
    `${JSON.stringify(
      {
        formatVersion: 1,
        kind: "poracode-standalone-runtime",
        version,
        target: options.target ?? hostTarget,
        node: { version: "26.13.0", executable: "runtime/node" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(stage, "bin", "poracode"),
    `#!/bin/sh\n` +
      `if [ -n "\${PORACODE_FAKE_LOG:-}" ]; then\n` +
      `  if [ "$1" = update ]; then printf '%s | profile=%s\\n' "$*" "\${PORACODE_BASE_DIR:-}" >> "$PORACODE_FAKE_LOG";\n` +
      `  else printf '%s\\n' "$*" >> "$PORACODE_FAKE_LOG"; fi\n` +
      `fi\n` +
      `if [ "$1" = "tui" ] && [ "\${PORACODE_FAKE_TUI_FAIL:-}" = "1" ]; then exit 1; fi\n` +
      `if [ "$1" = "--version" ]; then\n` +
      `  if [ -n "\${PORACODE_FAKE_VERSION_FAIL:-}" ]; then\n` +
      `    printf '%s\\n' "\${PORACODE_FAKE_VERSION_STDERR:-boom}" >&2\n` +
      `    exit "\${PORACODE_FAKE_VERSION_EXIT:-1}"\n` +
      `  fi\n` +
      `  echo ${version}\n` +
      `else echo "ran:$*"; fi\n`,
    { mode: 0o755 },
  );
  writeFileSync(join(stage, "lib", "server.cjs"), "\n");
  if (options.escape) writeFileSync(join(base, "escape.txt"), "outside\n");
  const releaseDir = join(base, `v${version}`);
  mkdirSync(releaseDir, { recursive: true });
  const name = `poracode-${version}-${hostTarget}.tar.gz`;
  const archive = join(releaseDir, name);
  const members = options.escape ? [".", "../escape.txt"] : ["."];
  execFileSync(
    "tar",
    ["-czf", archive, ...(options.escape ? ["-P"] : []), "-C", stage, ...members],
    { stdio: "pipe" },
  );
  if (options.escape) {
    const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert.match(listing, /^\.\.\/escape\.txt$/mu);
  }
  const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const listed = options.omitTarget ? "other.tar.gz" : name;
  writeFileSync(
    join(releaseDir, "SHA256SUMS"),
    `${options.badChecksum ? "0".repeat(64) : sha}  ${listed}\n`,
  );
  return { archive, sha, stage };
}

function setup() {
  const root = tempDir("poracode-install-sh-");
  const home = join(root, "home");
  const base = join(root, "releases");
  mkdirSync(home, { recursive: true });
  mkdirSync(base, { recursive: true });
  return {
    root,
    home,
    base,
    prefix: join(home, ".local", "share", "poracode", "server"),
    bin: join(home, ".local", "bin"),
  };
}

function installEnv(context, env = {}) {
  const path = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && entry !== context.bin)
    .join(delimiter);
  return {
    PATH: path,
    HOME: context.home,
    SHELL: "/bin/bash",
    TMPDIR: context.root,
    PORACODE_RELEASE_BASE_URL: `file://${context.base}`,
    ...env,
  };
}

function install(context, env = {}) {
  return spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: installEnv(context, env),
  });
}

/** Async variant: an in-process HTTP release server needs the event loop free. */
function installAsync(context, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("/bin/sh", [installScript], { env: installEnv(context, env) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", rejectRun);
    child.once("close", (code) => resolveRun({ status: code, stdout, stderr }));
  });
}

void test("installs, links, updates PATH once, and switches versions", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  const first = install(context, { PORACODE_VERSION: "2.1.0" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readlinkSync(join(context.prefix, "current")), "releases/2.1.0");
  const link = join(context.bin, "poracode");
  assert.equal(readlinkSync(link), join(context.prefix, "current", "bin", "poracode"));
  assert.equal(execFileSync(link, ["--version"], { encoding: "utf8" }).trim(), "2.1.0");
  const bashrc = readFileSync(join(context.home, ".bashrc"), "utf8");
  const snippet =
    'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac';
  assert.equal(bashrc.split("\n").filter((line) => line === snippet).length, 1);
  assert.match(first.stderr, /Installed Poracode 2\.1\.0/u);

  const again = install(context, { PORACODE_VERSION: "v2.1.0" });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stderr, /already installed/u);
  assert.equal(
    readFileSync(join(context.home, ".bashrc"), "utf8")
      .split("\n")
      .filter((l) => l === snippet).length,
    1,
  );

  publishRelease(context.base, "2.2.0-nightly.202611080110");
  const upgrade = install(context, { PORACODE_VERSION: "2.2.0-nightly.202611080110" });
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.equal(
    readlinkSync(join(context.prefix, "current")),
    "releases/2.2.0-nightly.202611080110",
  );
  assert.equal(
    execFileSync(link, ["--version"], { encoding: "utf8" }).trim(),
    "2.2.0-nightly.202611080110",
  );
  assert.ok(existsSync(join(context.prefix, "releases", "2.1.0")), "previous release is kept");
});

void test("a registered service never has its current release switched directly", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  publishRelease(context.base, "2.2.0");
  assert.equal(install(context, { PORACODE_VERSION: "2.1.0", PORACODE_NO_TUI: "1" }).status, 0);
  const profile = join(context.root, "custom profile");
  writeFileSync(
    join(context.prefix, "service-registration.json"),
    JSON.stringify({ profileNamespace: profile }),
  );
  const log = join(context.root, "commands.log");
  const result = install(context, {
    PORACODE_VERSION: "2.2.0",
    PORACODE_NO_TUI: "1",
    PORACODE_FAKE_LOG: log,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /service upgrade did not select/u);
  assert.match(readFileSync(log, "utf8"), /update 2\.2\.0 --prefix/u);
  assert.ok(readFileSync(log, "utf8").includes(`profile=${profile}`));
  assert.equal(readlinkSync(join(context.prefix, "current")), "releases/2.1.0");
});

void test("a nightly installer never upgrades a registered stable service", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  publishRelease(context.base, "2.2.0-nightly.202611100001");
  assert.equal(install(context, { PORACODE_VERSION: "2.1.0", PORACODE_NO_TUI: "1" }).status, 0);
  writeFileSync(join(context.prefix, "service-registration.json"), "{}\n");
  const result = install(context, {
    PORACODE_VERSION: "2.2.0-nightly.202611100001",
    PORACODE_NO_TUI: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stable and nightly require separate prefixes/u);
  assert.equal(readlinkSync(join(context.prefix, "current")), "releases/2.1.0");
});

void test("retained legacy files do not trigger repeated release downloads", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  assert.equal(install(context, { PORACODE_VERSION: "2.1.0", PORACODE_NO_TUI: "1" }).status, 0);
  const old = join(context.home, ".poracode", "server");
  mkdirSync(old, { recursive: true });
  symlinkSync(join(context.prefix, "releases", "2.1.0"), join(old, "current"));
  const before = readdirSync(join(context.prefix, "releases"));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = install(context, { PORACODE_VERSION: "2.1.0", PORACODE_NO_TUI: "1" });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /Downloading/u);
    assert.deepEqual(readdirSync(join(context.prefix, "releases")), before);
  }
});

void test("a legacy default install does not block an explicit separate prefix", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  const old = join(context.home, ".poracode", "server");
  mkdirSync(join(old, "release"), { recursive: true });
  symlinkSync("release", join(old, "current"));
  const custom = join(context.root, "custom-prefix");
  const result = install(context, {
    PORACODE_VERSION: "2.1.0",
    PORACODE_INSTALL_DIR: custom,
    PORACODE_NO_TUI: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readlinkSync(join(custom, "current")), "releases/2.1.0");
});

void test("refuses a checksum mismatch, an unsafe archive and a missing target", posixOnly, () => {
  const mismatch = setup();
  publishRelease(mismatch.base, "2.1.0", { badChecksum: true });
  const bad = install(mismatch, { PORACODE_VERSION: "2.1.0" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /checksum mismatch/u);
  assert.equal(existsSync(join(mismatch.prefix, "releases", "2.1.0")), false);
  assert.equal(existsSync(join(mismatch.prefix, "current")), false);

  const unsafe = setup();
  publishRelease(unsafe.base, "2.1.0", { escape: true });
  const escaped = install(unsafe, { PORACODE_VERSION: "2.1.0" });
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /outside the install directory/u);

  const missing = setup();
  publishRelease(missing.base, "2.1.0", { omitTarget: true });
  const absent = install(missing, { PORACODE_VERSION: "2.1.0" });
  assert.notEqual(absent.status, 0);
  assert.match(absent.stderr, new RegExp(`no self-contained archive for ${hostTarget}`, "u"));
});

void test("keeps a foreign poracode command and honors PORACODE_NO_MODIFY_PATH", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  mkdirSync(context.bin, { recursive: true });
  symlinkSync("/Applications/Poracode.app/desktop-cli/poracode", join(context.bin, "poracode"));
  const result = install(context, { PORACODE_VERSION: "2.1.0", PORACODE_NO_MODIFY_PATH: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Kept the existing/u);
  assert.equal(
    readlinkSync(join(context.bin, "poracode")),
    "/Applications/Poracode.app/desktop-cli/poracode",
  );
  assert.equal(existsSync(join(context.home, ".bashrc")), false);
  assert.equal(readlinkSync(join(context.prefix, "current")), "releases/2.1.0");
});

void test(
  "prefetches the terminal UI once per installer run unless PORACODE_NO_TUI=1",
  posixOnly,
  () => {
    const context = setup();
    publishRelease(context.base, "2.1.0");
    const log = join(context.root, "poracode.log");
    const prefetches = () =>
      readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line === "tui --prefetch").length;
    const first = install(context, { PORACODE_VERSION: "2.1.0", PORACODE_FAKE_LOG: log });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(prefetches(), 1);

    const again = install(context, { PORACODE_VERSION: "2.1.0", PORACODE_FAKE_LOG: log });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stderr, /already installed/u);
    assert.equal(prefetches(), 2, "each installer run prefetches once");

    const skipped = setup();
    publishRelease(skipped.base, "2.1.0");
    const skippedLog = join(skipped.root, "poracode.log");
    const noTui = install(skipped, {
      PORACODE_VERSION: "2.1.0",
      PORACODE_FAKE_LOG: skippedLog,
      PORACODE_NO_TUI: "1",
    });
    assert.equal(noTui.status, 0, noTui.stderr);
    assert.equal(
      readFileSync(skippedLog, "utf8")
        .split("\n")
        .filter((line) => line === "tui --prefetch").length,
      0,
    );
  },
);

void test("a failed terminal UI prefetch warns but still installs", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  const log = join(context.root, "poracode.log");
  const result = install(context, {
    PORACODE_VERSION: "2.1.0",
    PORACODE_FAKE_LOG: log,
    PORACODE_FAKE_TUI_FAIL: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Could not download the terminal UI now/u);
  assert.match(result.stderr, /Installed Poracode 2\.1\.0/u);
  assert.ok(
    readFileSync(log, "utf8").split("\n").includes("tui --prefetch"),
    "the prefetch ran and failed",
  );
});

void test("refuses an archive built for another target", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0", { target: "linux-riscv64" });
  const result = install(context, { PORACODE_VERSION: "2.1.0" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a self-contained archive for/u);
  assert.equal(existsSync(join(context.prefix, "current")), false);
});

void test("reports the runtime's own error when the downloaded CLI cannot run", posixOnly, () => {
  const context = setup();
  const { stage } = publishRelease(context.base, "2.1.0");
  const loader =
    `${stage}/runtime/node: error while loading shared libraries: ` +
    "libatomic.so.1: cannot open shared object file: No such file or directory";
  const result = install(context, {
    PORACODE_VERSION: "2.1.0",
    PORACODE_FAKE_VERSION_FAIL: "1",
    PORACODE_FAKE_VERSION_STDERR: loader,
    PORACODE_FAKE_VERSION_EXIT: "127",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not run on this machine/u);
  assert.match(result.stderr, /error while loading shared libraries: libatomic\.so\.1/u);
  assert.match(result.stderr, /sudo apt-get install libatomic1/u);
  assert.equal(existsSync(join(context.prefix, "current")), false);
  assert.equal(existsSync(join(context.prefix, "releases", "2.1.0")), false);
});

void test("reports a runtime failure without the library hint", posixOnly, () => {
  const context = setup();
  publishRelease(context.base, "2.1.0");
  const result = install(context, {
    PORACODE_VERSION: "2.1.0",
    PORACODE_FAKE_VERSION_FAIL: "1",
    PORACODE_FAKE_VERSION_STDERR: "boom",
    PORACODE_FAKE_VERSION_EXIT: "1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not run on this machine/u);
  assert.match(result.stderr, /\bboom\b/u);
  assert.doesNotMatch(result.stderr, /libatomic/u);
});

void test(
  "the no-SHA256SUMS failure suggests nightly only for an unpinned stable install",
  posixOnly,
  async () => {
    const context = setup();
    mkdirSync(join(context.base, "v9.9.9"), { recursive: true });
    const server = await serveDirectory(context.base);
    try {
      const result = await installAsync(context, {
        PORACODE_VERSION: "9.9.9",
        PORACODE_RELEASE_BASE_URL: server.url,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /has no SHA256SUMS/u);
      assert.doesNotMatch(result.stderr, /PORACODE_CHANNEL/u);
    } finally {
      await server.close();
    }
  },
);

void test("a truncated install.sh piped to sh changes nothing", posixOnly, () => {
  const script = readFileSync(installScript, "utf8");
  const truncated = [
    script.slice(0, Math.floor(script.length / 2)),
    script.slice(0, script.lastIndexOf('main "$@"')),
  ];
  for (const source of truncated) {
    const context = setup();
    const result = spawnSync("/bin/sh", [], {
      input: source,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: context.home,
        SHELL: "/bin/bash",
        TMPDIR: context.root,
        PORACODE_RELEASE_BASE_URL: "http://127.0.0.1:1/unreachable",
        PORACODE_VERSION: "2.1.0",
      },
    });
    assert.equal(existsSync(context.prefix), false, result.stderr);
    assert.equal(existsSync(context.bin), false);
    for (const name of [".bash_profile", ".bash_login", ".profile", ".bashrc"]) {
      assert.equal(existsSync(join(context.home, name)), false, name);
    }
  }
});

void test("writes the PATH line into a HOME containing spaces only", posixOnly, () => {
  const context = setup();
  const spacedHome = join(context.root, "home with space");
  mkdirSync(spacedHome, { recursive: true });
  publishRelease(context.base, "2.1.0");
  const result = spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: {
      PATH: (process.env.PATH ?? "")
        .split(delimiter)
        .filter((entry) => entry && entry !== join(spacedHome, ".local", "bin"))
        .join(delimiter),
      HOME: spacedHome,
      SHELL: "/bin/bash",
      TMPDIR: context.root,
      PORACODE_RELEASE_BASE_URL: `file://${context.base}`,
      PORACODE_VERSION: "2.1.0",
      PORACODE_INSTALL_DIR: join(spacedHome, ".poracode", "server"),
      PORACODE_BIN_DIR: join(spacedHome, ".local", "bin"),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const snippet =
    'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac';
  for (const name of [".bash_profile", ".bashrc"]) {
    const profile = join(spacedHome, name);
    assert.ok(existsSync(profile), name);
    assert.ok(readFileSync(profile, "utf8").split("\n").includes(snippet), name);
  }
  for (const name of [".bash_login", ".profile"]) {
    assert.equal(existsSync(join(spacedHome, name)), false, name);
  }
  const snippetFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && readFileSync(path, "utf8").includes("Poracode CLI PATH")) {
        snippetFiles.push(path);
      }
    }
  };
  walk(context.root);
  assert.deepEqual(
    snippetFiles.sort(),
    [join(spacedHome, ".bash_profile"), join(spacedHome, ".bashrc")].sort(),
  );
});

void test("rejects versions that are not plain release versions", posixOnly, () => {
  for (const version of ["..", "1.2"]) {
    const context = setup();
    publishRelease(context.base, "2.1.0");
    const result = install(context, { PORACODE_VERSION: version });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid version/u);
    assert.doesNotMatch(result.stderr, /Downloading/u);
    assert.equal(existsSync(context.prefix), false);
  }
});

const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
  encoding: "utf8",
});
void test(
  "install.ps1 parses without errors",
  { skip: pwsh.status === 0 ? false : "pwsh is not installed (GitHub ubuntu runners have it)" },
  () => {
    const script = join(repoRoot, "website", "public", "install.ps1");
    const result = spawnSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile($env:PORACODE_PS1, [ref]$null, [ref]$errors) | Out-Null; $errors | ForEach-Object { $_.ToString() }; exit $errors.Count",
      ],
      { encoding: "utf8", env: { ...process.env, PORACODE_PS1: script } },
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  },
);
