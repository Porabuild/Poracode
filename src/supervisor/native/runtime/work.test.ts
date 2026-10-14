import { describe, expect, it } from "vitest";
import { NativeRuntimeWork } from "./work";
import { spawnAndAwaitExit } from "../../runtime/spawn";

describe("NativeRuntimeWork", () => {
  it("aborts and joins an actual probe child before releasing its lifetime", async () => {
    const owner = new NativeRuntimeWork();
    let pid: number | undefined;
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const pending = owner.run(() =>
      spawnAndAwaitExit(
        process.execPath,
        ["-e", "console.log(process.pid);setInterval(()=>{},1000)"],
        {
          signal: owner.signal,
          timeoutMs: 5000,
          onStdout: (chunk) => {
            pid = Number(chunk.toString().trim());
            ready();
          },
        },
      ),
    );
    const refused = pending.catch((error: unknown) => error);
    await started;
    await owner.stop();
    expect(await refused).toMatchObject({ name: "AbortError" });
    expect(owner.retired).toBe(true);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid!, 0)).toThrow(/ESRCH|no such process/u);
    expect(() => owner.run(async () => {})).toThrow(/stopped/u);
  });

  it("cannot retire while a cancelled extraction still owns its staging directory", async () => {
    const owner = new NativeRuntimeWork();
    let reject!: (error: unknown) => void;
    const pending = owner.run(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const refused = pending.catch((error: unknown) => error);
    let stopped = false;
    const stopping = owner.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(owner.signal.aborted).toBe(true);
    expect(stopped).toBe(false);
    expect(owner.retired).toBe(false);
    reject(owner.signal.reason);
    await stopping;
    expect(await refused).toMatchObject({ name: "AbortError" });
    expect(owner.retired).toBe(true);
  });

  it("keeps an unconfirmed child exit as a failed retirement", async () => {
    const owner = new NativeRuntimeWork();
    let reject!: (error: unknown) => void;
    const pending = owner.run(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const refused = pending.catch((error: unknown) => error);
    const stopping = owner.stop();
    reject(new Error("could not be confirmed exited"));
    await expect(stopping).rejects.toThrow("could not be confirmed exited");
    expect(await refused).toMatchObject({ message: "could not be confirmed exited" });
    expect(owner.retired).toBe(false);
    expect(owner.stop()).toBe(stopping);
  });
});

it("retains an unconfirmed child failure that settled before shutdown", async () => {
  const owner = new NativeRuntimeWork();
  const failure = new Error("probe could not be confirmed exited after SIGKILL");
  await expect(
    owner.run(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await expect(owner.stop()).rejects.toBe(failure);
  expect(owner.retired).toBe(false);
});

it("does not mistake an ordinary install failure for surviving process custody", async () => {
  const owner = new NativeRuntimeWork();
  let reject!: (error: unknown) => void;
  const pending = owner.run(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const handled = pending.catch((error: unknown) => error);
  const stopping = owner.stop();
  reject(new Error("HTTP 503 fetching archive"));
  await stopping;
  expect(await handled).toMatchObject({ message: "HTTP 503 fetching archive" });
  expect(owner.retired).toBe(true);
});

it("registers work before a synchronous callback begins retirement", async () => {
  const owner = new NativeRuntimeWork();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let stopping: Promise<void> | undefined;
  const work = owner.run(() => {
    stopping = owner.stop();
    return pending;
  });
  await Promise.resolve();
  expect(owner.retired).toBe(false);
  release();
  await Promise.all([work, stopping]);
  expect(owner.retired).toBe(true);
});
