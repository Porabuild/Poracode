import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { closeSync, constants, openSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { readBoundedRuntimeFile, readBoundedRuntimeFileSync } from "./readBoundedRuntimeFile";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-bounded-runtime-file-"));
  roots.push(root);
  return { root, path: join(root, "runtime.cjs") };
}

it("reads regular files through both bounded readers and refuses excessive size", async () => {
  const { path } = await fixture();
  await writeFile(path, "synthetic bytes");
  expect(readBoundedRuntimeFileSync(path, 15).toString()).toBe("synthetic bytes");
  expect((await readBoundedRuntimeFile(path, 15)).toString()).toBe("synthetic bytes");
  expect(() => readBoundedRuntimeFileSync(path, 3)).toThrow(/byte limit/);
  await expect(readBoundedRuntimeFile(path, 3)).rejects.toThrow(/byte limit/);
  await expect(readBoundedRuntimeFile(path, 15, AbortSignal.abort())).rejects.toThrow(/aborted/i);
});

it.skipIf(process.platform === "win32").each(["async", "sync"] as const)(
  "refuses a real FIFO in the %s reader without needing a peer to unblock open",
  async (mode) => {
    const { root, path } = await fixture();
    execFileSync("mkfifo", [path]);
    const readerUrl = new URL("./readBoundedRuntimeFile.ts", import.meta.url).href;
    // The synchronous regression runs in its own child so its former blocking
    // open cannot prevent the parent from releasing the FIFO or joining it.
    const bootstrap = `const start=async()=>{const readers=await import(${JSON.stringify(readerUrl)});process.send({kind:'ready'});process.once('message',async()=>{try{await readers.${mode === "sync" ? "readBoundedRuntimeFileSync" : "readBoundedRuntimeFile"}(${JSON.stringify(path)},128);process.send({kind:'result',error:null},()=>process.disconnect())}catch(error){process.send({kind:'result',error:String(error)},()=>process.disconnect())}})};void start();`;
    let child: ChildProcess | undefined;
    let completion: Promise<unknown> | undefined;
    let backstop: ReturnType<typeof setTimeout> | undefined;
    let peer: number | undefined;
    let intervention = false;
    try {
      child = fork(join(root, "unused.cjs"), [], {
        execArgv: ["--eval", bootstrap],
        env: { ...process.env, NODE_OPTIONS: "" },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      completion = once(child, "close");
      const exitedEarly = completion.then(() => {
        throw new Error("Runtime reader fixture exited before replying.");
      });
      void exitedEarly.catch(() => undefined);
      expect(await Promise.race([once(child, "message"), exitedEarly])).toEqual([
        { kind: "ready" },
        undefined,
      ]);
      const result = Promise.race([once(child, "message"), exitedEarly]);
      backstop = setTimeout(() => {
        intervention = true;
        peer = openSync(path, constants.O_RDWR | constants.O_NONBLOCK);
      }, 500);
      child.send("read");
      const [message] = await result;
      expect(intervention).toBe(false);
      expect(message).toMatchObject({
        kind: "result",
        error: expect.stringMatching(/regular file/),
      });
      await completion;
      expect(child.connected).toBe(false);
    } finally {
      clearTimeout(backstop);
      if (peer !== undefined) closeSync(peer);
      if (
        child &&
        typeof child.pid === "number" &&
        child.pid > 0 &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill("SIGTERM");
        await Promise.race([completion, delay(2_000)]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await completion;
        }
      }
    }
  },
);
