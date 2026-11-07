import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { WindowsPtyJob, ptyBootstrapEnvironment, type PtyBrokerProof } from "./windowsPtyJob";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn<typeof spawn>(),
}));

let sequence = 0;
const fixtures: Array<{ cleanup(): void; job: WindowsPtyJob }> = [];
function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}
function fakeChild(pid: number) {
  const child = Object.assign(new EventEmitter(), {
    pid,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => boolean>(),
  });
  const close = (code = 0) => {
    if (child.exitCode !== null) return;
    child.exitCode = code;
    child.stdin.destroy();
    child.stdout.end();
    child.stderr.end();
    child.emit("exit", code, null);
    child.emit("close", code, null);
  };
  child.kill.mockImplementation(() => {
    close(1);
    return true;
  });
  return {
    child: child as unknown as ChildProcessWithoutNullStreams,
    stdout: child.stdout,
    close,
    kill: child.kill,
  };
}
function fixture() {
  const index = ++sequence;
  const nonce = index.toString(16).padStart(48, "0");
  const helper = fakeChild(1_000_000 + index * 2);
  const broker = fakeChild(1_000_001 + index * 2);
  vi.mocked(spawn).mockReturnValueOnce(helper.child);
  const failure = vi.fn<(error: Error) => void>();
  const job = new WindowsPtyJob({
    executable: "C:\\owned\\pty-job-owner-v1.exe",
    nonce,
    broker: broker.child,
    env: {},
    onFailure: failure,
  });
  const commands: string[] = [];
  helper.child.stdin.on("data", (data) => commands.push(String(data).trim()));
  const reply = (line: string) => helper.stdout.write(`${line}\n`);
  const bound = () => {
    reply(`ready-v1 ${nonce}`);
    reply(`bound-v1 ${nonce}`);
  };
  const prepared = async (pid = broker.child.pid!) => {
    await vi.waitFor(() => expect(commands).toContain(`prepare-v1 ${nonce} 1 ${broker.child.pid}`));
    reply(`prepared-v1 ${nonce} 1 ${pid} 123456789012345678`);
  };
  const admit = async () => {
    const proof = vi.fn<(proof: PtyBrokerProof) => Promise<void>>(async () => {});
    const starting = job.assignBroker(proof);
    bound();
    await prepared();
    await vi.waitFor(() => expect(commands).toContain(`assign-v1 ${nonce} 1`));
    reply(`assigned-v1 ${nonce} 1 ${broker.child.pid}`);
    await starting;
    return proof;
  };
  const finish = () => {
    reply(`retired-v1 ${nonce} 0`);
    helper.close();
    broker.close();
  };
  const gates: Array<ReturnType<typeof Promise.withResolvers<void>>> = [];
  const value = {
    job,
    nonce,
    helper,
    broker,
    commands,
    reply,
    bound,
    prepared,
    admit,
    finish,
    failure,
    gate() {
      const gate = Promise.withResolvers<void>();
      gates.push(gate);
      return gate;
    },
    cleanup() {
      for (const gate of gates) gate.resolve();
      helper.close();
      broker.close();
    },
  };
  fixtures.push(value);
  return value;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    f.cleanup();
    await f.job.close().catch(() => {});
  }
  vi.clearAllMocks();
});

it("keeps provider, plugin, signing and Node injection variables out of bootstrap environments", () => {
  expect(
    ptyBootstrapEnvironment({
      Path: "C:\\Windows",
      SystemRoot: "C:\\Windows",
      HOME: "C:\\owned",
      NODE_OPTIONS: "--require=private",
      NODE_PATH: "private",
      ELECTRON_RUN_AS_NODE: "1",
      PROVIDER_API_KEY: "private",
      PLUGIN_OAUTH_TOKEN: "private",
      PORACODE_DEVICE_AGENT_KEY: "private",
      UNSET: undefined,
    }),
  ).toEqual({ Path: "C:\\Windows", SystemRoot: "C:\\Windows", HOME: "C:\\owned" });
});

it("requires the private proof after handle capture and joins both processes after the kernel ACK", async () => {
  const f = fixture();
  const proof = await f.admit();
  expect(proof).toHaveBeenCalledWith({
    operationId: "1",
    creationTicks: "123456789012345678",
    signal: expect.any(AbortSignal),
  });
  let joined = false;
  const closing = f.job.close().then(() => {
    joined = true;
  });
  expect(f.commands).toContain(`close-v1 ${f.nonce}`);
  expect(f.helper.kill).not.toHaveBeenCalled();
  expect(f.broker.kill).not.toHaveBeenCalled();
  f.reply(`retired-v1 ${f.nonce} 0`);
  f.helper.close();
  await Promise.resolve();
  expect(joined).toBe(false);
  expect(f.job.exitConfirmed).toBe(false);
  f.broker.close();
  await closing;
  expect(f.job.exitConfirmed).toBe(true);
});

it("cancels before helper ready without leaving admission or pipe joins pending", async () => {
  const f = fixture();
  const starting = rejection(f.job.assignBroker(async () => {}));
  await f.job.close();
  expect(await starting).toMatchObject({ message: expect.stringMatching(/cancelled/) });
  expect(f.commands).toEqual([]);
  expect(f.helper.kill).toHaveBeenCalledOnce();
  expect(f.broker.kill).toHaveBeenCalledOnce();
  expect(f.job.exitConfirmed).toBe(true);
});

it("propagates cancellation into held private proof and never assigns afterward", async () => {
  const f = fixture();
  let proofSignal: AbortSignal | undefined;
  const starting = f.job.assignBroker(({ signal }) => {
    proofSignal = signal;
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  });
  const refused = rejection(starting);
  f.bound();
  await f.prepared();
  await vi.waitFor(() => expect(proofSignal).toBeDefined());
  await f.job.close();
  expect(await refused).toMatchObject({ message: expect.stringMatching(/cancelled/) });
  expect(proofSignal?.aborted).toBe(true);
  expect(f.commands.some((command) => command.startsWith("assign-v1"))).toBe(false);
  expect(f.job.exitConfirmed).toBe(true);
});

it("retains the original proof task even after both unassigned processes close", async () => {
  const f = fixture(),
    gate = f.gate();
  let proving = false;
  const refused = rejection(
    f.job.assignBroker(async () => {
      proving = true;
      await gate.promise;
    }),
  );
  f.bound();
  await f.prepared();
  await vi.waitFor(() => expect(proving).toBe(true));
  let joined = false;
  const closing = f.job.close().then(() => {
    joined = true;
  });
  await Promise.resolve();
  expect(f.broker.child.exitCode).toBe(1);
  expect(f.helper.child.exitCode).toBe(1);
  expect(joined).toBe(false);
  expect(f.job.exitConfirmed).toBe(false);
  gate.resolve();
  await closing;
  expect(await refused).toMatchObject({ message: expect.stringMatching(/cancelled/) });
  expect(f.commands.some((command) => command.startsWith("assign-v1"))).toBe(false);
});

it("treats cancellation while assignment is in flight as assigned custody", async () => {
  const f = fixture();
  const refused = rejection(f.job.assignBroker(async () => {}));
  f.bound();
  await f.prepared();
  await vi.waitFor(() => expect(f.commands).toContain(`assign-v1 ${f.nonce} 1`));
  const closing = f.job.close();
  f.reply(`assigned-v1 ${f.nonce} 1 ${f.broker.child.pid}`);
  expect(f.helper.kill).not.toHaveBeenCalled();
  expect(f.broker.kill).not.toHaveBeenCalled();
  f.finish();
  await closing;
  expect(await refused).toMatchObject({ message: expect.stringMatching(/cancelled/) });
  expect(f.job.exitConfirmed).toBe(true);
});

it("joins repeated close and refuses reuse of an admitted operation", async () => {
  const f = fixture();
  await f.admit();
  const closing = f.job.close();
  expect(f.job.close()).toBe(closing);
  await expect(f.job.assignBroker(async () => {})).rejects.toThrow(/already used or closing/);
  f.finish();
  await closing;
  await f.job.close();
  expect(f.commands.filter((command) => command.startsWith("close-v1"))).toHaveLength(1);
});

it("refuses mismatched captured broker identity before assignment", async () => {
  const f = fixture();
  const refused = rejection(f.job.assignBroker(async () => {}));
  f.bound();
  await f.prepared(f.broker.child.pid! + 100);
  expect(await refused).toMatchObject({ message: expect.stringMatching(/identity differs/) });
  await f.job.close();
  expect(f.commands.some((command) => command.startsWith("assign-v1"))).toBe(false);
});

it("does not confirm helper loss after assignment without a kernel-empty receipt", async () => {
  const f = fixture();
  await f.admit();
  f.helper.close(1);
  f.broker.close(1);
  await expect(f.job.close()).rejects.toThrow(/did not confirm kernel/);
  expect(f.job.exitConfirmed).toBe(false);
  expect(f.broker.kill).not.toHaveBeenCalled();
});

it.each(["helper", "broker"] as const)(
  "handles %s stream errors during startup and joins unassigned custody",
  async (target) => {
    const f = fixture();
    const refused = rejection(f.job.assignBroker(async () => {}));
    f[target].child.stderr.emit("error", new Error("fixture private material"));
    expect(await refused).toMatchObject({ message: expect.stringMatching(/pipe failed/) });
    await f.job.close();
    expect(f.failure).toHaveBeenCalledOnce();
    expect(f.failure.mock.calls[0]?.[0].message).not.toContain("private material");
    expect(f.job.exitConfirmed).toBe(true);
  },
);

it.each(["ready-v2", "retired-v1"])("refuses future or out-of-order %s replies", async (kind) => {
  const f = fixture();
  const refused = rejection(f.job.assignBroker(async () => {}));
  f.reply(`${kind} ${f.nonce}${kind === "retired-v1" ? " 0" : ""}`);
  expect(await refused).toMatchObject({
    message: expect.stringMatching(/protocol differs|unexpected control reply/),
  });
  await f.job.close();
  expect(f.commands.some((command) => command.startsWith("prepare-v1"))).toBe(false);
});

it("refuses a foreign nonce without closing another owner's bootstrap", async () => {
  const a = fixture(),
    b = fixture();
  const refused = rejection(a.job.assignBroker(async () => {}));
  a.reply(`ready-v1 ${b.nonce}`);
  expect(await refused).toMatchObject({
    message: expect.stringMatching(/identity or protocol differs/),
  });
  await a.job.close();
  expect(b.helper.kill).not.toHaveBeenCalled();
  expect(b.broker.kill).not.toHaveBeenCalled();
  expect(b.job.exitConfirmed).toBe(false);
});

it("bounds unterminated control frames without disclosing their bytes", async () => {
  const f = fixture();
  const refused = rejection(f.job.assignBroker(async () => {}));
  f.helper.stdout.write("s".repeat(1024));
  expect(await refused).toMatchObject({ message: expect.stringMatching(/exceeds its limit/) });
  await f.job.close();
  expect(f.failure.mock.calls[0]?.[0].message).not.toContain("ssss");
});
