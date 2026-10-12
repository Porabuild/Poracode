import type { ChildProcess, PromiseWithChild } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readMacKeychainPassword,
  readMacKeychainFingerprint,
  writeMacKeychainPassword,
  withMacKeychainAuthorizationRetry,
  resetMacKeychainStateForTests,
} from "./macKeychain";
import { retireMacKeychainCommands } from "./macKeychainProcess";
import { mockExecFileCommand } from "./macKeychain.testFixtures";

const security = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: { timeout: number },
    ) => PromiseWithChild<{ stdout: string; stderr: string }>
  >(),
);
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: security }),
}));

describe("Keychain command retirement", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  let children: ChildProcess[];

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    resetMacKeychainStateForTests();
    children = [];
    security.mockImplementation(() => {
      const request = mockExecFileCommand(
        new Promise<{ stdout: string; stderr: string }>(() => {}),
        false,
      );
      children.push(request.child);
      return request;
    });
  });

  afterEach(async () => {
    for (const child of children) child.emit("close");
    await retireMacKeychainCommands();
    vi.useRealTimers();
    Object.defineProperty(process, "platform", platformDescriptor);
  });

  it("stops every command, joins pipe closure and prevents queued retries from spawning", async () => {
    const item = { service: "fixture-login", account: "user" };
    const password = readMacKeychainPassword(item);
    const attributes = readMacKeychainFingerprint({ ...item, service: "fixture-attributes" });
    const write = writeMacKeychainPassword(
      { ...item, service: "fixture-write" },
      "synthetic-token",
    ).catch(() => undefined);
    const forced = withMacKeychainAuthorizationRetry(() => readMacKeychainPassword(item));
    let completed = false;
    const retirement = retireMacKeychainCommands().then(() => {
      completed = true;
    });

    expect(children).toHaveLength(3);
    for (const child of children) expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    await expect(Promise.all([password, attributes, write, forced])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(security).toHaveBeenCalledTimes(3);
    expect(completed).toBe(false);

    for (const child of children) child.emit("close");
    await retirement;
    expect(completed).toBe(true);
    await expect(
      readMacKeychainPassword({ service: "fresh-login", account: "user" }),
    ).resolves.toBeUndefined();
    expect(security).toHaveBeenCalledTimes(3);
  });

  it("reports unconfirmed shutdown after bounded escalation instead of forgetting custody", async () => {
    vi.useFakeTimers();
    const password = readMacKeychainPassword({ service: "fixture-login", account: "user" });
    const result = retireMacKeychainCommands().then(
      () => ({ stopped: true }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(1_250);
    expect(await result).toMatchObject({ error: expect.any(AggregateError) });
    expect(children[0]?.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(children[0]?.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(resetMacKeychainStateForTests).toThrow("still active");
    await expect(password).resolves.toBeUndefined();
  });
});
