import { execFile, type ChildProcess } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { NativeProcessRunner } from "./nativeProcessRunner";

const runners: NativeProcessRunner[] = [];
function runner(options: ConstructorParameters<typeof NativeProcessRunner>[0] = {}) {
  const value = new NativeProcessRunner(options);
  runners.push(value);
  return value;
}
afterEach(async () => {
  for (const value of runners.splice(0)) await value.close();
});

it("returns bounded native output only after process closure", async () => {
  const value = runner();
  await expect(
    value.run(
      process.execPath,
      ["-e", "process.stdout.write('out');process.stderr.write('err');"],
      {
        signal: new AbortController().signal,
      },
    ),
  ).resolves.toEqual({ stdout: "out", stderr: "err" });
  await expect(
    value.run(process.execPath, ["-e", "process.stdout.write('x'.repeat(128));"], {
      signal: new AbortController().signal,
      maxBufferBytes: 8,
    }),
  ).rejects.toThrow("maxBuffer");
});

it.skipIf(process.platform === "win32")(
  "aborts a held command and joins escalation and pipes",
  async () => {
    const ready = Promise.withResolvers<void>();
    let child: ChildProcess | undefined;
    const value = runner({
      stopOptions: { graceMs: 20 },
      launch(command, args, options, callback) {
        child = execFile(command, args, options, callback);
        child.stdout!.once("data", () => ready.resolve());
        return child;
      },
    });
    const cancellation = new AbortController();
    const outcome = value
      .run(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000);",
        ],
        {
          signal: cancellation.signal,
        },
      )
      .catch((error: unknown) => error);
    await ready.promise;
    cancellation.abort();
    const closing = value.close();
    expect(value.close()).toBe(closing);
    expect(child?.exitCode).toBeNull();
    await closing;
    expect(await outcome).toBeInstanceOf(Error);
    expect(child?.signalCode).toBe("SIGKILL");
    expect(child?.stdout?.destroyed).toBe(true);
    expect(child?.stderr?.destroyed).toBe(true);
  },
);

it("refuses aborted and permanently closed actions before calling the launcher", async () => {
  const launch = vi.fn<() => ChildProcess>(() => {
    throw new Error("Unexpected fixture spawn");
  });
  const value = runner({ launch });
  const cancellation = new AbortController();
  cancellation.abort();
  await expect(value.run("synthetic", [], { signal: cancellation.signal })).rejects.toBeDefined();
  await value.close();
  await expect(
    value.run("synthetic", [], { signal: new AbortController().signal }),
  ).rejects.toThrow("closed");
  expect(launch).not.toHaveBeenCalled();
});

it("joins a child created while its launch callback reenters permanent close", async () => {
  let child: ChildProcess | undefined;
  let closing: Promise<void> | undefined;
  const value = runner({
    launch(_command, _args, options, callback) {
      child = execFile(process.execPath, ["-e", "setTimeout(()=>{},1000);"], options, callback);
      closing = value.close();
      callback(null, "synthetic-early-result", "");
      return child;
    },
  });
  const result = value.run("synthetic", [], { signal: new AbortController().signal });
  await closing;
  await expect(result).resolves.toEqual({ stdout: "synthetic-early-result", stderr: "" });
  expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
  expect(child?.stdout?.destroyed).toBe(true);
});

it("joins a missing executable without signaling an absent PID", async () => {
  const value = runner();
  await expect(
    value.run("poracode-synthetic-missing-process-runner-fixture", [], {
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await value.close();
});
