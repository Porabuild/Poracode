// Exercises native/locked-computer-use/locked-computer-use-installer against a
// temporary root with fake `security`, `codesign`, and `chown`. Nothing here
// runs as root or touches the real authorization database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerSource = join(
  repoRoot,
  "native",
  "locked-computer-use",
  "locked-computer-use-installer",
);
const skip = process.platform !== "darwin" ? "requires macOS plutil" : false;

const RIGHT = "com.poracode.locked-computer-use.unlock";
const SCREENSAVER = "system.login.screensaver";

const STOCK_RULE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>class</key>
	<string>rule</string>
	<key>comment</key>
	<string>The owner or any administrator can unlock the screensaver, set rule to "authenticate-session-owner-or-admin" to enable SecurityAgent.</string>
	<key>created</key>
	<real>802088075.93699598</real>
	<key>modified</key>
	<real>802088075.93699598</real>
	<key>rule</key>
	<array>
		<string>use-login-window-ui</string>
	</array>
	<key>version</key>
	<integer>1</integer>
</dict>
</plist>
`;

const VENDOR_RULE = STOCK_RULE.replace(
  "<string>use-login-window-ui</string>",
  "<string>com.vendor.sso.unlock</string>\n\t\t<string>use-login-window-ui</string>",
);

const FAKE_SECURITY = `#!/bin/bash
set -u
printf '%s\\n' "$*" >>"$FAKE_LOG"
if [[ "$1" == authorizationdb ]]; then
  file="$FAKE_SECURITY_DB/$3.plist"
  case "$2" in
    read)
      if [[ -f "$file" ]]; then cat "$file"; echo "YES (0)" >&2; exit 0; fi
      echo "NO (-60005)" >&2; exit 255 ;;
    write)
      if [[ "\${FAKE_IGNORE_WRITE:-}" == "$3" ]]; then cat >/dev/null; echo "YES (0)" >&2; exit 0; fi
      if [[ $# -ge 4 ]]; then
        printf '<plist version="1.0"><dict><key>class</key><string>rule</string><key>rule</key><array><string>%s</string></array></dict></plist>\\n' "$4" >"$file"
      else
        cat >"$file"
      fi
      echo "YES (0)" >&2; exit 0 ;;
    remove)
      rm -f "$file"; echo "YES (0)" >&2; exit 0 ;;
  esac
elif [[ "$1" == authorize ]]; then
  case "\${FAKE_AUTHORIZE:-deny}" in
    deny)
      log_dir="$PORACODE_LCU_TEST_ROOT/Library/Logs/Poracode"
      mkdir -p "$log_dir"
      echo "2026-11-04T00:00:00Z uid=0 outcome=deny reason=helper_unavailable approval=- thread=-" >>"$log_dir/locked-computer-use.log"
      echo "NO (-60005)"; exit 255 ;;
    deny_unlogged) echo "NO (-60005)"; exit 255 ;;
    internal) echo "NO (-60008)"; exit 255 ;;
    allow) echo "YES (0)"; exit 0 ;;
  esac
fi
exit 2
`;

const FAKE_CODESIGN = `#!/bin/bash
printf 'codesign %s\\n' "$*" >>"$FAKE_LOG"
exit "\${FAKE_CODESIGN_STATUS:-0}"
`;

const FAKE_CHOWN = `#!/bin/bash
printf 'chown %s\\n' "$*" >>"$FAKE_LOG"
exit 0
`;

function writeExecutable(path, contents) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function fixture(t, { screensaver = STOCK_RULE } = {}) {
  const root = mkdtempSync(join(tmpdir(), "poracode-lcu-installer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sysroot = join(root, "sysroot");
  const bin = join(root, "bin");
  const db = join(root, "db");
  const resources = join(root, "resources");
  for (const dir of [sysroot, bin, db, resources]) mkdirSync(dir, { recursive: true });

  writeExecutable(join(bin, "security"), FAKE_SECURITY);
  writeExecutable(join(bin, "codesign"), FAKE_CODESIGN);
  writeExecutable(join(bin, "chown"), FAKE_CHOWN);
  writeFileSync(join(db, `${SCREENSAVER}.plist`), screensaver);

  const installer = join(resources, "locked-computer-use-installer");
  copyFileSync(installerSource, installer);
  chmodSync(installer, 0o755);
  const bundle = join(resources, "PoracodeLockedUse.bundle", "Contents");
  mkdirSync(join(bundle, "MacOS"), { recursive: true });
  copyFileSync(
    join(repoRoot, "native", "locked-computer-use", "Info.plist"),
    join(bundle, "Info.plist"),
  );
  writeFileSync(join(bundle, "MacOS", "PoracodeLockedUse"), "fake mach-o\n");

  const plugins = join(sysroot, "Library", "Security", "SecurityAgentPlugins");
  const kandji = join(plugins, "KandjiPassport.bundle", "Contents");
  mkdirSync(kandji, { recursive: true });
  writeFileSync(join(kandji, "Info.plist"), "kandji\n");
  chmodSync(join(kandji, "Info.plist"), 0o640);

  const support = join(sysroot, "Library", "Application Support", "Poracode", "LockedComputerUse");
  const log = join(root, "fake.log");
  writeFileSync(log, "");

  const run = (args, env = {}) => {
    const result = spawnSync(installer, args, {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: root,
        PORACODE_LCU_TEST_ROOT: sysroot,
        PORACODE_LCU_TEST_BIN: bin,
        FAKE_SECURITY_DB: db,
        FAKE_LOG: log,
        ...env,
      },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  return {
    run,
    dbFile: (right) => join(db, `${right}.plist`),
    readDb: (right) => readFileSync(join(db, `${right}.plist`), "utf8"),
    bundleDest: join(plugins, "PoracodeLockedUse.bundle"),
    kandji: join(plugins, "KandjiPassport.bundle"),
    support,
    log: () => readFileSync(log, "utf8"),
  };
}

function plistJson(text, keyPath) {
  const result = spawnSync("/usr/bin/plutil", ["-extract", keyPath, "json", "-o", "-", "-"], {
    input: text,
    encoding: "utf8",
  });
  return result.status === 0 ? JSON.parse(result.stdout) : undefined;
}

function plistXml(text, keyPath) {
  const result = spawnSync("/usr/bin/plutil", ["-extract", keyPath, "xml1", "-o", "-", "-"], {
    input: text,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout : undefined;
}

function assertKandjiUntouched(f) {
  const info = join(f.kandji, "Contents", "Info.plist");
  assert.equal(readFileSync(info, "utf8"), "kandji\n");
  assert.equal(statSync(info).mode & 0o777, 0o640);
}

function status(f) {
  const result = f.run(["status"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

void test("install on the stock rule backs it up and prepends our right", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"]);
  assert.equal(result.status, 0, result.stderr);

  const combined = f.readDb(SCREENSAVER);
  assert.deepEqual(plistJson(combined, "rule"), [RIGHT, "use-login-window-ui"]);
  assert.match(plistXml(combined, "k-of-n"), /<integer>1<\/integer>/u);
  for (const key of ["class", "comment", "created", "modified", "version"]) {
    assert.equal(plistXml(combined, key), plistXml(STOCK_RULE, key), key);
  }

  const right = f.readDb(RIGHT);
  assert.deepEqual(plistJson(right, "mechanisms"), ["PoracodeLockedUse:allow,privileged"]);
  assert.match(plistXml(right, "class"), /evaluate-mechanisms/u);
  assert.match(plistXml(right, "tries"), /<integer>1<\/integer>/u);
  assert.match(plistXml(right, "shared"), /<false\/>/u);

  const backups = join(f.support, "backups");
  assert.equal(readFileSync(join(backups, "original.plist"), "utf8"), STOCK_RULE);
  assert.equal(statSync(join(backups, "original.plist")).mode & 0o777, 0o600);
  const stamped = readdirSync(backups).filter((name) => name !== "original.plist");
  assert.equal(stamped.length, 1);
  assert.match(stamped[0], /^system\.login\.screensaver\.\d{8}T\d{6}Z\.plist$/u);
  assert.equal(readFileSync(join(backups, stamped[0]), "utf8"), STOCK_RULE);
  assert.equal(statSync(join(backups, stamped[0])).mode & 0o777, 0o600);

  const executable = join(f.bundleDest, "Contents", "MacOS", "PoracodeLockedUse");
  assert.equal(statSync(executable).mode & 0o777, 0o755);
  assert.equal(statSync(join(f.bundleDest, "Contents", "Info.plist")).mode & 0o777, 0o644);
  assert.equal(statSync(join(f.bundleDest, "Contents")).mode & 0o777, 0o755);

  const state = JSON.parse(readFileSync(join(f.support, "state.json"), "utf8"));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.pluginVersion, "1.0.0");
  assert.equal(state.backup, "original.plist");
  assert.deepEqual(state.users, [501]);
  assert.match(state.installedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  assert.equal(statSync(join(f.support, "state.json")).mode & 0o777, 0o644);

  assert.equal(statSync(join(f.support, "run")).mode & 0o777, 0o755);
  assert.equal(statSync(join(f.support, "run", "501")).mode & 0o777, 0o700);
  assert.match(f.log(), /chown 501 .*\/run\/501\n/u);
  assert.match(f.log(), /authorize -u com\.poracode\.locked-computer-use\.unlock/u);
  // The pre-flight runs before the screensaver rule is written.
  const log = f.log();
  assert.ok(
    log.indexOf(`authorize -u ${RIGHT}`) < log.indexOf(`authorizationdb write ${SCREENSAVER}`),
  );
  assertKandjiUntouched(f);
});

void test("reinstall is idempotent and keeps the original backup", { skip }, (t) => {
  const f = fixture(t);
  assert.equal(f.run(["install", "--user", "501"]).status, 0);
  const firstRule = f.readDb(SCREENSAVER);
  const second = f.run(["install", "--user", "502"]);
  assert.equal(second.status, 0, second.stderr);

  assert.equal(f.readDb(SCREENSAVER), firstRule);
  assert.deepEqual(plistJson(f.readDb(SCREENSAVER), "rule"), [RIGHT, "use-login-window-ui"]);
  const backups = join(f.support, "backups");
  assert.equal(readFileSync(join(backups, "original.plist"), "utf8"), STOCK_RULE);
  assert.equal(readdirSync(backups).length, 2);
  const state = JSON.parse(readFileSync(join(f.support, "state.json"), "utf8"));
  assert.deepEqual(state.users, [501, 502]);
  assert.ok(existsSync(join(f.support, "run", "502")));
  assertKandjiUntouched(f);
});

void test("install refuses a non-stock rule without changing anything", { skip }, (t) => {
  const f = fixture(t, { screensaver: VENDOR_RULE });
  const result = f.run(["install", "--user", "501"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /unsupported_rule/u);
  assert.equal(f.readDb(SCREENSAVER), VENDOR_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
  assert.equal(existsSync(f.bundleDest), false);
  assert.equal(existsSync(f.support), false);
  assert.doesNotMatch(f.log(), /authorizationdb (write|remove)/u);
  assertKandjiUntouched(f);
});

void test("install refuses an invalid bundle signature before any change", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"], { FAKE_CODESIGN_STATUS: "1" });
  assert.equal(result.status, 4);
  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
  assert.equal(existsSync(f.bundleDest), false);
  assert.doesNotMatch(f.log(), /authorizationdb (write|remove)/u);
});

void test("a failed pre-flight rolls back and leaves the screensaver rule alone", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"], { FAKE_AUTHORIZE: "internal" });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /verification_failed/u);
  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.doesNotMatch(f.log(), new RegExp(`authorizationdb write ${SCREENSAVER}`, "u"));
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
  assert.equal(existsSync(f.bundleDest), false);
  assert.equal(existsSync(join(f.support, "state.json")), false);
  assert.equal(existsSync(join(f.support, "run")), false);
  assert.equal(
    readFileSync(join(f.support, "backups", "original.plist"), "utf8"),
    STOCK_RULE,
    "backups are kept",
  );
  assertKandjiUntouched(f);
});

void test("a denial without a plug-in audit line is treated as a failure", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"], { FAKE_AUTHORIZE: "deny_unlogged" });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /no audit line/u);
  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
});

void test("an allowing pre-flight is treated as a failure", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"], { FAKE_AUTHORIZE: "allow" });
  assert.equal(result.status, 4);
  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
});

void test("a screensaver read-back mismatch rolls back our right and bundle", { skip }, (t) => {
  const f = fixture(t);
  const result = f.run(["install", "--user", "501"], { FAKE_IGNORE_WRITE: SCREENSAVER });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /read-back mismatch/u);
  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
  assert.equal(existsSync(f.bundleDest), false);
  assert.equal(existsSync(join(f.support, "state.json")), false);
  assertKandjiUntouched(f);
});

void test("uninstall restores the original rule byte for byte", { skip }, (t) => {
  const f = fixture(t);
  assert.equal(f.run(["install", "--user", "501"]).status, 0);
  const result = f.run(["uninstall"]);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(f.readDb(SCREENSAVER), STOCK_RULE);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
  assert.equal(existsSync(f.bundleDest), false);
  assert.equal(existsSync(join(f.support, "run")), false);
  assert.equal(existsSync(join(f.support, "state.json")), false);
  const backups = join(f.support, "backups");
  assert.equal(readFileSync(join(backups, "original.plist"), "utf8"), STOCK_RULE);
  assert.equal(readdirSync(backups).length, 2);
  // The screensaver rule is restored before our right is removed.
  const log = f.log();
  assert.ok(
    log.lastIndexOf(`authorizationdb write ${SCREENSAVER}`) <
      log.indexOf(`authorizationdb remove ${RIGHT}`),
  );
  assertKandjiUntouched(f);

  assert.equal(f.run(["uninstall"]).status, 6);
});

void test("uninstall without a backup removes only our rule entry", { skip }, (t) => {
  const f = fixture(t);
  assert.equal(f.run(["install", "--user", "501"]).status, 0);
  rmSync(join(f.support, "backups"), { recursive: true });
  const result = f.run(["uninstall"]);
  assert.equal(result.status, 0, result.stderr);
  const restored = f.readDb(SCREENSAVER);
  assert.deepEqual(plistJson(restored, "rule"), ["use-login-window-ui"]);
  assert.equal(plistXml(restored, "k-of-n"), undefined);
  assert.equal(existsSync(f.dbFile(RIGHT)), false);
});

void test("status reports JSON without root", { skip }, (t) => {
  const f = fixture(t);
  assert.deepEqual(status(f), {
    installed: false,
    ruleInstalled: false,
    bundleInstalled: false,
    rightInstalled: false,
    originalBackup: false,
    pluginVersion: null,
    bundledPluginVersion: "1.0.0",
  });
  assert.equal(f.run(["install", "--user", "501"]).status, 0);
  assert.deepEqual(status(f), {
    installed: true,
    ruleInstalled: true,
    bundleInstalled: true,
    rightInstalled: true,
    originalBackup: true,
    pluginVersion: "1.0.0",
    bundledPluginVersion: "1.0.0",
  });
  rmSync(f.dbFile(RIGHT));
  assert.equal(status(f).installed, false);
  assert.equal(status(f).rightInstalled, false);
});

void test("usage errors exit 2", { skip }, (t) => {
  const f = fixture(t);
  for (const args of [
    [],
    ["bogus"],
    ["install"],
    ["install", "--user", "abc"],
    ["install", "--user", "0"],
    ["uninstall", "extra"],
  ]) {
    assert.equal(f.run(args).status, 2, args.join(" "));
  }
  const relative = f.run(["status"], { PORACODE_LCU_TEST_ROOT: "relative/root" });
  assert.equal(relative.status, 2);
});

void test(
  "future installer state refuses install and uninstall without mutations",
  { skip },
  (t) => {
    const f = fixture(t);
    assert.equal(f.run(["install", "--user", "501"]).status, 0);
    const path = join(f.support, "state.json");
    const future = '{"schemaVersion":2,"users":[501],"custody":"preserve"}\n';
    writeFileSync(path, future);
    const rule = f.readDb(SCREENSAVER);
    const right = f.readDb(RIGHT);
    for (const args of [["install", "--user", "502"], ["uninstall"]]) {
      assert.equal(f.run(args).status, 3);
      assert.equal(readFileSync(path, "utf8"), future);
      assert.equal(f.readDb(SCREENSAVER), rule);
      assert.equal(f.readDb(RIGHT), right);
      assert.ok(existsSync(f.bundleDest));
    }
  },
);

void test("uninstall preserves policy edited by MDM after installation", { skip }, (t) => {
  const f = fixture(t);
  assert.equal(f.run(["install", "--user", "501"]).status, 0);
  const installed = f.readDb(SCREENSAVER);
  for (const customized of [
    installed.replace(
      "<string>use-login-window-ui</string>",
      "<string>com.vendor.sso.unlock</string><string>use-login-window-ui</string>",
    ),
    installed.replace(
      "<key>version</key>",
      "<key>tries</key><integer>2</integer><key>version</key>",
    ),
  ]) {
    writeFileSync(f.dbFile(SCREENSAVER), customized);
    assert.equal(f.run(["uninstall"]).status, 3);
    assert.equal(f.readDb(SCREENSAVER), customized);
    assert.ok(existsSync(f.dbFile(RIGHT)));
    assert.ok(existsSync(f.bundleDest));
  }
});
