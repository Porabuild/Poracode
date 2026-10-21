import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { lock } from "proper-lockfile";
import test from "node:test";

const taskRequire = createRequire(import.meta.url);

async function waitFor(condition) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(10);
  }
  assert.fail("Development launcher did not finish the expected lifecycle transition.");
}

async function fixture(t, holdAcquisition = false) {
  const root = await mkdtemp(join(tmpdir(), "poracode-dev-launch-"));
  let child;
  t.after(async () => {
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await waitFor(() => child.exitCode !== null || child.signalCode !== null);
      await delay(350);
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const path of ["scripts", "node_modules/electron", ".tmp/dev-runtime"])
    await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, "package.json"), '{"type":"module","main":"app.cjs"}');
  await writeFile(
    join(root, "app.cjs"),
    `require('node:fs').writeFileSync('.tmp/app-started',String(process.pid));`,
  );
  await writeFile(join(root, "node_modules/electron/package.json"), '{"main":"index.cjs"}');
  await writeFile(
    join(root, "node_modules/electron/index.cjs"),
    `if(process.execArgv.includes('--require')){let quitting=false;module.exports={app:{quit(){if(quitting)return;quitting=true;require('node:fs').writeFileSync('.tmp/app-quitting','');setTimeout(()=>process.exit(0),300);}}};}else module.exports=process.execPath;`,
  );
  await copyFile(
    resolve("scripts/dev-electron-hook.cjs"),
    join(root, "scripts/dev-electron-hook.cjs"),
  );
  for (const script of [
    "ensure-native-deps.mjs",
    "prepare-pty-job-owner.mjs",
    "prepare-computer-use-helper.mjs",
    "prepare-wsl-helpers.mjs",
    "prepare-agent-plugins.mjs",
    "wait-dev-server.mjs",
  ])
    await writeFile(join(root, "scripts", script), "export {};");
  await writeFile(
    join(root, "scripts/prepare-pty-job-owner.mjs"),
    "import {writeFileSync} from 'node:fs'; if(!process.argv.includes('--if-supported'))throw Error('Expected host-only preparation'); writeFileSync('.tmp/pty-owner-ready','');",
  );
  await writeFile(
    join(root, "scripts/sweepStaleSupervisors.mjs"),
    "export function sweepStaleSupervisors(){}",
  );
  let launcher = await readFile(resolve("scripts/dev-launch.mjs"), "utf8");
  for (const script of ["native-dev-lib.mjs", "dev-server-port.mjs"])
    launcher = launcher.replace(`./${script}`, pathToFileURL(resolve("scripts", script)).href);
  await writeFile(join(root, "scripts/dev-launch.mjs"), launcher);
  await writeFile(
    join(root, "scripts/dev-runtime-watch.mjs"),
    `import {existsSync} from 'node:fs';import {writeFile} from 'node:fs/promises';
import {lock} from ${JSON.stringify(pathToFileURL(taskRequire.resolve("proper-lockfile")).href)};
export async function watchRuntime({root,onPublished}){
if(!existsSync(root+'/.tmp/pty-owner-ready'))throw Error('PTY owner was not prepared before building');
const release=await lock(root+'/.tmp/dev-runtime');await writeFile(root+'/.tmp/acquiring','');
while(existsSync(root+'/.tmp/hold-acquisition'))await new Promise(done=>setTimeout(done,10));
const keepAlive=setInterval(()=>{},1000);let running,resolveReady,rejectReady;
const ready=new Promise((done,reject)=>{resolveReady=done;rejectReady=reject;});void ready.catch(()=>{});
const timer=setTimeout(()=>{running=onPublished({isCurrent:()=>true}).then(resolveReady,rejectReady);},75);
return {ready,async close(){clearTimeout(timer);clearInterval(keepAlive);await running;rejectReady(new Error('stopped'));await release();await writeFile(root+'/.tmp/closed','');}};}`,
  );
  await writeFile(
    join(root, "control.mjs"),
    `process.on('message',message=>{if(message==='stop'){process.emit('SIGTERM');process.disconnect();}});`,
  );
  if (holdAcquisition) await writeFile(join(root, ".tmp/hold-acquisition"), "");
  child = fork(join(root, "scripts/dev-launch.mjs"), {
    cwd: root,
    execArgv: ["--import", pathToFileURL(join(root, "control.mjs")).href],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, PORACODE_CDP_USER_DATA_DIR: "" },
    windowsHide: true,
  });
  let log = "";
  const collect = (chunk) => {
    log += chunk;
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  return { root, child, log: () => log };
}

await test(
  "keeps exclusive output ownership until Electron finishes its graceful shutdown",
  { timeout: 20_000 },
  async (t) => {
    const { root, child, log } = await fixture(t);
    await waitFor(() => existsSync(join(root, ".tmp/app-started")));
    child.send("stop");
    await waitFor(() => existsSync(join(root, ".tmp/app-quitting")));
    await assert.rejects(lock(join(root, ".tmp/dev-runtime")), { code: "ELOCKED" });
    await waitFor(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0, log());
    assert.ok(existsSync(join(root, ".tmp/closed")));
    const release = await lock(join(root, ".tmp/dev-runtime"));
    await release();
  },
);

await test(
  "closes a watcher acquired after shutdown was requested",
  { timeout: 20_000 },
  async (t) => {
    const { root, child, log } = await fixture(t, true);
    await waitFor(() => existsSync(join(root, ".tmp/acquiring")));
    child.send("stop");
    await delay(25);
    await rm(join(root, ".tmp/hold-acquisition"));
    await waitFor(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0, log());
    assert.equal(existsSync(join(root, ".tmp/app-started")), false);
    assert.ok(existsSync(join(root, ".tmp/closed")));
    const release = await lock(join(root, ".tmp/dev-runtime"));
    await release();
  },
);
