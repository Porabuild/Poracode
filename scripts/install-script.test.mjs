import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
      `if [ -n "\${PORACODE_FAKE_LOG:-}" ]; then printf '%s\\n' "$*" >> "$PORACODE_FAKE_LOG"; fi\n` +
      `if [ "$1" = "tui" ] && [ "\${PORACODE_FAKE_TUI_FAIL:-}" = "1" ]; then exit 1; fi\n` +
      `if [ "$1" = "--version" ]; then echo ${version}; else echo "ran:$*"; fi\n`,
    { mode: 0o755 },
  );
  writeFileSync(join(stage, "lib", "server.cjs"), "\n");
  if (options.escape) writeFileSync(join(base, "escape.txt"), "outside\n");
  const releaseDir = join(base, `v${version}`);
  mkdirSync(releaseDir, { recursive: true });
  const name = `poracode-${version}-${hostTarget}.tar.gz`;
  const archive = join(releaseDir, name);
  const members = options.escape ? [".", "../escape.txt"] : ["."];
  execFileSync("tar", ["-czf", archive, "-C", stage, ...members], { stdio: "pipe" });
  const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const listed = options.omitTarget ? "other.tar.gz" : name;
  writeFileSync(
    join(releaseDir, "SHA256SUMS"),
    `${options.badChecksum ? "0".repeat(64) : sha}  ${listed}\n`,
  );
  return { archive, sha };
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
    prefix: join(home, ".poracode", "server"),
    bin: join(home, ".local", "bin"),
  };
}

function install(context, env = {}) {
  const path = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && entry !== context.bin)
    .join(delimiter);
  return spawnSync("/bin/sh", [installScript], {
    encoding: "utf8",
    env: {
      PATH: path,
      HOME: context.home,
      SHELL: "/bin/bash",
      TMPDIR: context.root,
      PORACODE_RELEASE_BASE_URL: `file://${context.base}`,
      ...env,
    },
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
