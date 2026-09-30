import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { stopOwnedProcess, stopOwnedProcesses } from "./smoke-owned-process.mjs";

void test(
  "cancellation during the first session write never starts the runtime build",
  { skip: process.platform === "win32" },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "poracode-cancel-before-build-"));
    const root = join(temporary, "session");
    const marker = join(temporary, "build-started");
    const preload = join(temporary, "cancel-on-session-write.cjs");
    try {
      await mkdir(root);
      await writeFile(
        preload,
        `const fs=require("node:fs"),fsp=require("node:fs/promises"),cp=require("node:child_process");let requested=false;const write=fsp.writeFile;fsp.writeFile=async function(...args){await write.apply(this,args);if(!requested&&String(args[0]).startsWith(${JSON.stringify(join(root, "session.json."))})){requested=true;process.kill(process.pid,"SIGINT");await new Promise(done=>setTimeout(done,50));}};const spawn=cp.spawn;cp.spawn=function(command,args,options){if(args?.some(value=>String(value).endsWith("prepare-smoke-runtime.mjs"))){fs.writeFileSync(${JSON.stringify(marker)},"attempted");throw new Error("Build started after cancellation");}return spawn.call(this,command,args,options);};require("node:module").syncBuiltinESMExports();`,
      );
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(new URL("./run-poracode-smoke.mjs", import.meta.url)),
          "--launch-only",
          "--new",
          "--mode",
          "mock",
          "--root",
          root,
        ],
        {
          env: { ...process.env, NODE_OPTIONS: `--require=${JSON.stringify(preload)}` },
          timeout: 10000,
        },
      );
      await assert.rejects(readFile(marker), { code: "ENOENT" });
      assert.equal(JSON.parse(await readFile(join(root, "session.json"), "utf8")).state, "stopped");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);

void test(
  "stopping a build joins a descendant that outlives its wrapper and ignores SIGINT",
  { skip: process.platform === "win32" },
  async () => {
    const descendantSource =
      'process.on("SIGINT",()=>{});process.send("ready");setInterval(()=>{},1000);';
    const wrapperSource = `const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e",${JSON.stringify(descendantSource)}],{stdio:["ignore","ignore","ignore","ipc"]});child.once("message",()=>process.send({pid:child.pid}));setInterval(()=>{},1000);`;
    const wrapper = spawn(process.execPath, ["-e", wrapperSource], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let descendantPid;
    try {
      [{ pid: descendantPid }] = await once(wrapper, "message");
      await stopOwnedProcess(wrapper, { graceMs: 100 });
      assert.equal(
        isExecuting(descendantPid),
        false,
        "the ignored first signal must not leave a build descendant executing",
      );
    } finally {
      if (isExecuting(descendantPid)) process.kill(descendantPid, "SIGKILL");
      if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
      if (wrapper.connected) wrapper.disconnect();
    }
  },
);

void test(
  "a stopped child record cannot authorize signaling a reused live PID",
  { skip: process.platform === "win32" },
  async () => {
    const unrelated = spawn(
      process.execPath,
      ["-e", 'process.send("ready");setInterval(()=>{},1000);'],
      { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    try {
      await once(unrelated, "message");
      await assert.rejects(
        stopOwnedProcess({ pid: unrelated.pid, exitCode: 0, signalCode: null }),
        /Cannot safely reclaim/,
      );
      assert.equal(isExecuting(unrelated.pid), true);
    } finally {
      await stopOwnedProcess(unrelated, { graceMs: 100 });
    }
  },
);

function isExecuting(pid) {
  if (!pid) return false;
  try {
    return !/^Z/.test(
      execFileSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).trim(),
    );
  } catch {
    return false;
  }
}

void test(
  "an unconfirmed app stop still stops its owned renderer sibling and retains the failure",
  { skip: process.platform === "win32" },
  async () => {
    const start = () => {
      const child = spawn(
        process.execPath,
        ["-e", 'process.send("ready");setInterval(()=>{},1000);'],
        { detached: true, stdio: ["ignore", "ignore", "pipe", "ipc"] },
      );
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.on("error", () => {});
      const ready = once(child, "message");
      void ready.catch(() => {});
      return { child, closed, ready };
    };
    const refused = start();
    const renderer = start();
    try {
      await Promise.all([refused.ready, renderer.ready]);
      const stoppedRecord = { pid: refused.child.pid, exitCode: 0, signalCode: null };
      await assert.rejects(
        stopOwnedProcesses([undefined, stoppedRecord, renderer.child], { graceMs: 100 }),
        (error) =>
          error instanceof AggregateError &&
          error.errors.length === 1 &&
          /Cannot safely reclaim/.test(error.errors[0].message),
      );
      assert.equal(isExecuting(refused.child.pid), true, "the refused group must remain untouched");
      assert.equal(isExecuting(renderer.child.pid), false, "the owned sibling must still stop");
    } finally {
      await stopOwnedProcesses([refused.child, renderer.child], { graceMs: 100 });
      await Promise.all([refused.closed, renderer.closed]);
    }
  },
);
