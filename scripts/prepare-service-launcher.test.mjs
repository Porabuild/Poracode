import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, toNamespacedPath } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { prepareServiceLauncher } from "./prepare-service-launcher.mjs";
import { readServiceLauncherArtifact } from "../src/shared/serverServiceLauncherArtifact.ts";

const scratch = resolve("tmp");
mkdirSync(scratch, { recursive: true });
const root = realpathSync.native(mkdtempSync(join(scratch, "service-launcher-native-")));
await test(
  "non-Windows builder refuses before invoking a compiler",
  { skip: process.platform === "win32" },
  () => {
    let invoked = false;
    assert.throws(
      () =>
        prepareServiceLauncher({
          outDir: root,
          run: () => {
            invoked = true;
          },
        }),
      /native Windows/,
    );
    assert.equal(invoked, false);
  },
);
if (process.platform === "win32") {
  const manifest = prepareServiceLauncher({ outDir: join(root, "resources") });
  const target = `win32-${process.arch}`,
    qualified = readServiceLauncherArtifact(join(root, "resources"), target);
  assert.equal(qualified.artifact.sha256, manifest.targets[target].sha256);
  async function fixture(transform) {
    const own = realpathSync.native(mkdtempSync(join(root, "case ü-"))),
      prefix = join(own, "selected prefix"),
      profile = join(own, "profile"),
      release = join(prefix, "releases", "selected-release");
    mkdirSync(join(release, "lib"), { recursive: true });
    copyFileSync(qualified.path, join(prefix, "service-launcher-v1.exe"));
    symlinkSync(release, join(prefix, "current"), "junction");
    const nonce = randomBytes(24).toString("hex"),
      entry = join(release, "lib/server.cjs");
    writeFileSync(
      entry,
      `const fs=require('node:fs');const [flag,profile,mode,...rest]=process.argv.slice(2);if(flag!=='--base-dir'||mode!=='serve')process.exit(64);const bad=['NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','PORACODE_BASE_DIR','PORACODE_APP_VERSION','PORACODE_UPGRADE_STAGING'].filter(k=>process.env[k]);fs.writeFileSync(profile+'.ready',JSON.stringify({pid:process.pid,parentPid:process.ppid,entrypoint:process.argv[1],rest,bad}));console.log('owned startup output');let code=0;if(rest.length){if(rest[0]!=='--config')process.exit(65);code=JSON.parse(fs.readFileSync(rest[1],'utf8')).exitCode;}const timer=setInterval(()=>{let stop;try{stop=fs.readFileSync(profile+'.stop','utf8')}catch{}if(stop===${JSON.stringify(nonce)}){clearInterval(timer);process.exitCode=code;}},50);const expiry=setTimeout(()=>{clearInterval(timer);process.exitCode=124;},30000);expiry.unref();`,
    );
    const args = ["--run-v1", nonce, realpathSync.native(process.execPath), prefix, profile, ""];
    const child = spawn(
      join(prefix, "service-launcher-v1.exe"),
      transform(args, { own, prefix, profile, entry }),
      {
        windowsHide: true,
        env: {
          ...process.env,
          NODE_OPTIONS: "--invalid-node-option",
          NODE_PATH: join(own, "wrong"),
          ELECTRON_RUN_AS_NODE: "1",
          PORACODE_BASE_DIR: join(own, "wrong-profile"),
          PORACODE_APP_VERSION: "wrong-version",
          PORACODE_UPGRADE_STAGING: "1",
        },
        stdio: "ignore",
      },
    );
    const closed = new Promise((done, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => done({ code, signal }));
    });
    return { own, prefix, profile, nonce, child, closed };
  }
  await test("future manifest refuses before compiler or staged-file replacement", () => {
    const future = join(root, "future");
    mkdirSync(future);
    const path = join(future, "manifest.json"),
      before = '{"formatVersion":99,"preserve":"future"}\n';
    writeFileSync(path, before);
    let compiled = false;
    assert.throws(
      () =>
        prepareServiceLauncher({
          outDir: future,
          run: () => {
            compiled = true;
          },
        }),
      /formatVersion/,
    );
    assert.equal(compiled, false);
    assert.equal(readFileSync(path, "utf8"), before);
    const alias = join(root, "checkout alias");
    symlinkSync(process.cwd(), alias, "junction");
    const command = spawnSync(
      process.execPath,
      [join(alias, "scripts", "prepare-service-launcher.mjs"), "--out-dir", future],
      { windowsHide: true, encoding: "utf8" },
    );
    assert.notEqual(
      command.status,
      0,
      "The CLI must execute its refusal through an aliased checkout.",
    );
    assert.match(command.stderr, /formatVersion/);
    assert.equal(readFileSync(path, "utf8"), before);
  });
  await test("future launcher protocol refuses before log or host effects", async () => {
    const f = await fixture((args) => ["--run-v2", ...args.slice(1)]);
    assert.equal((await f.closed).code, 1);
    assert.equal(existsSync(f.profile + ".ready"), false);
    assert.equal(existsSync(join(f.prefix, "service-startup.log")), false);
  });
  await test("native launcher clears ambient launch modes and joins the exact host exit", async () => {
    const f = await fixture((args, { own }) => {
      const config = join(own, "selected configuration.json");
      writeFileSync(config, JSON.stringify({ exitCode: 7 }));
      return [...args.slice(0, -1), config];
    });
    let outcome;
    try {
      for (let i = 0; i < 100 && !existsSync(f.profile + ".ready"); i++) {
        assert.equal(f.child.exitCode, null);
        await delay(50);
      }
      const ready = JSON.parse(readFileSync(f.profile + ".ready", "utf8"));
      assert.deepEqual(ready.bad, []);
      assert.equal(ready.parentPid, f.child.pid);
      assert.equal(
        ready.entrypoint,
        toNamespacedPath(realpathSync.native(join(f.prefix, "current", "lib", "server.cjs"))),
      );
      assert.equal(f.child.exitCode, null);
      assert.equal(ready.rest[0], "--config");
      assert.equal(existsSync(f.profile), false);
    } finally {
      writeFileSync(f.profile + ".stop", f.nonce);
      outcome = await f.closed;
    }
    assert.equal(outcome.code, 7);
    assert.match(
      readFileSync(join(f.prefix, "service-startup.log"), "utf8"),
      /host joined \(exit 7\)/,
    );
  });
  await test("current retargeted outside installed releases refuses before spawn", async () => {
    const f = await fixture((args, { own, prefix, entry }) => {
      const outside = join(own, "outside release");
      mkdirSync(join(outside, "lib"), { recursive: true });
      copyFileSync(entry, join(outside, "lib/server.cjs"));
      unlinkSync(join(prefix, "current"));
      symlinkSync(outside, join(prefix, "current"), "junction");
      return args;
    });
    assert.equal((await f.closed).code, 1);
    assert.equal(existsSync(f.profile + ".ready"), false);
  });
  writeFileSync(
    join(root, "qualification.json"),
    JSON.stringify(
      {
        manifest,
        native: true,
        fixturesJoined: true,
        limits: ["Tests use an owned fake server. Task/owner/upgrade qualification is separate."],
      },
      null,
      2,
    ) + "\n",
  );
}
