import { fork, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { DEVICE_WORKSPACE_AGENT_KEY_ENV } from "@/shared/deviceWorkspaceAgentProof";
import { PTY_BROKER_INPUT_MAX_BYTES, type PtyBrokerRequest } from "@/shared/contracts/ptyBroker";
import { WindowsPty } from "./windowsPty";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: vi.fn<typeof fork>(),
  spawn: vi.fn<typeof spawn>(),
}));

function child(pid: number) {
  const value = Object.assign(new EventEmitter(), {
    pid,
    connected: true,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => boolean>(),
    send: vi.fn<(frame: PtyBrokerRequest, done: (error: Error | null) => void) => boolean>(),
  });
  const close = () => {
    if (value.exitCode !== null) return;
    value.exitCode = 0;
    value.connected = false;
    value.stdin.destroy();
    value.stdout.end();
    value.stderr.end();
    value.emit("exit", 0, null);
    value.emit("close", 0, null);
  };
  value.kill.mockImplementation(() => {
    close();
    return true;
  });
  return { value, process: value as unknown as ChildProcessWithoutNullStreams, close };
}

const fixtures: Array<{ pty: WindowsPty; finish(): void }> = [];
let sequence = 0;
function fixture({
  heldStart = false,
  heldClose = false,
  flowControlPause = "\x13",
  flowControlResume = "\x11",
} = {}) {
  const pid = 900_000 + ++sequence * 3;
  const broker = child(pid);
  const helper = child(pid + 1);
  const bootstrapId = randomUUID();
  const frames: PtyBrokerRequest[] = [];
  let nonce = "";
  let autoClose = !heldClose;
  const reply = (frame: object) => broker.value.emit("message", { version: 1, nonce, ...frame });
  vi.mocked(fork).mockImplementationOnce((_path, args) => {
    nonce = args![0]!;
    queueMicrotask(() => reply({ kind: "ready", pid: broker.value.pid, bootstrapId }));
    return broker.process;
  });
  const line = (data: string) => helper.value.stdout.write(`${data}\n`);
  const finish = () => {
    if (helper.value.exitCode === null) line(`retired-v1 ${nonce} 0`);
    helper.close();
    broker.close();
  };
  vi.mocked(spawn).mockImplementationOnce(() => {
    queueMicrotask(() => line(`ready-v1 ${nonce}`));
    return helper.process;
  });
  helper.value.stdin.on("data", (data) => {
    const [kind, , operationId, preparedPid] = String(data).trim().split(" ");
    if (kind === "bind-v1") line(`bound-v1 ${nonce}`);
    if (kind === "prepare-v1") line(`prepared-v1 ${nonce} ${operationId} ${preparedPid} 123456789`);
    if (kind === "assign-v1") line(`assigned-v1 ${nonce} ${operationId} ${broker.value.pid}`);
    if (kind === "close-v1" && autoClose) queueMicrotask(finish);
  });
  broker.value.send.mockImplementation((frame, done) => {
    frames.push(frame);
    queueMicrotask(() => {
      done(null);
      if (frame.kind === "prove") reply({ ...frame, kind: "proof", pid: broker.value.pid });
      if (frame.kind === "start" && !heldStart)
        reply({
          kind: "started",
          pid: pid + 2,
          cols: frame.launch.options.cols,
          rows: frame.launch.options.rows,
        });
    });
    return true;
  });
  const pty = new WindowsPty(
    "fixture.exe",
    [],
    {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: "C:\\owned",
      flowControlPause,
      flowControlResume,
      env: {
        SELECTED_PROVIDER_SECRET: "fixture-value",
        [DEVICE_WORKSPACE_AGENT_KEY_ENV]: "host-key",
      },
    },
    { helperPath: "C:\\owned\\helper.exe", brokerPath: "C:\\owned\\broker.cjs" },
  );
  fixtures.push({
    pty,
    finish() {
      autoClose = true;
      finish();
    },
  });
  return { pty, broker, helper, frames, reply, finish };
}

afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    const closing = f.pty.close().catch(() => {});
    f.finish();
    await closing;
  }
  vi.resetAllMocks();
});

it("cancels in the admission turn before creating either process", async () => {
  const f = fixture();
  const exit = vi.fn<(event: { exitCode: number; signal?: number }) => void>();
  f.pty.onExit(exit);
  await f.pty.close();
  await expect(f.pty.ready).rejects.toThrow("cancelled");
  expect(fork).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledExactlyOnceWith({ exitCode: 0 });
  expect(f.pty.exitConfirmed).toBe(true);
});

it("queues early input and latest geometry, isolates control, and strips the host signing key", async () => {
  const f = fixture();
  const input: Buffer[] = [];
  f.broker.value.stdin.on("data", (data: Buffer) => input.push(data));
  const output: string[] = [];
  f.pty.onData((data) => output.push(data));
  f.pty.write("early input\r");
  f.pty.resize(111, 33);
  await f.pty.ready;
  expect(Buffer.concat(input).toString()).toBe("early input\r");
  const start = f.frames.find((frame) => frame.kind === "start");
  expect(start?.launch.options).toMatchObject({
    cols: 111,
    rows: 33,
    env: { SELECTED_PROVIDER_SECRET: "fixture-value" },
  });
  expect(start?.launch.options.env).not.toHaveProperty(DEVICE_WORKSPACE_AGENT_KEY_ENV);
  const spoof = JSON.stringify({ version: 1, kind: "exited", exitCode: 99 });
  f.broker.value.stdout.write(spoof);
  expect(output).toEqual([spoof]);
  expect(f.pty.exitConfirmed).toBe(false);
  expect(f.pty.pid).toBe(f.broker.value.pid + 2);
});

it("refuses excess early input without accepting the rejected chunk or starting an extra child", async () => {
  const f = fixture();
  f.pty.write(Buffer.alloc(PTY_BROKER_INPUT_MAX_BYTES, 65));
  expect(() => f.pty.write("rejected")).toThrow("startup input queue is full");
  await f.pty.close();
  expect(fork).not.toHaveBeenCalled();
  expect(() => f.pty.write("late")).toThrow("no input was accepted");
});

it.each([
  { flowControlPause: "\x13", flowControlResume: "\x11" },
  { flowControlPause: "PAUSE_Ж", flowControlResume: "RESUME_Ж" },
])(
  "consumes string flow-control messages before raw pipe chunking: $flowControlPause",
  async (controls) => {
    const f = fixture(controls);
    const input: Buffer[] = [];
    f.broker.value.stdin.on("data", (data: Buffer) => input.push(data));
    f.pty.handleFlowControl = true;
    f.pty.write(controls.flowControlPause);
    await f.pty.ready;
    expect(Buffer.concat(input).length).toBe(0);
    expect(f.frames.at(-1)).toMatchObject({ kind: "pause" });
    f.pty.write(controls.flowControlResume);
    expect(f.frames.at(-1)).toMatchObject({ kind: "resume" });
    f.pty.write(Buffer.from(controls.flowControlPause));
    f.pty.handleFlowControl = false;
    f.pty.write(controls.flowControlPause);
    expect(Buffer.concat(input).toString()).toBe(controls.flowControlPause.repeat(2));
  },
);

it("joins assigned custody when startup is held and does not publish an early exit", async () => {
  const f = fixture({ heldStart: true, heldClose: true });
  const exit = vi.fn<(event: { exitCode: number; signal?: number }) => void>();
  f.pty.onExit(exit);
  await vi.waitFor(() => expect(f.frames.some((frame) => frame.kind === "start")).toBe(true));
  const closing = f.pty.close();
  await expect(f.pty.ready).rejects.toThrow("cancelled");
  expect(exit).not.toHaveBeenCalled();
  expect(f.pty.exitConfirmed).toBe(false);
  f.finish();
  await closing;
  expect(exit).toHaveBeenCalledOnce();
  expect(f.pty.exitConfirmed).toBe(true);
});

it("keeps final stdout listeners until actual broker pipe close and reports the real exit", async () => {
  const f = fixture({ heldClose: true });
  const events: string[] = [];
  f.pty.onData((data) => events.push(data));
  f.pty.onExit((event) => events.push(`exit:${event.exitCode}`));
  await f.pty.ready;
  f.reply({ kind: "exited", exitCode: 7 });
  f.broker.value.stdout.write("final Ж bytes");
  expect(events).toEqual(["final Ж bytes"]);
  f.finish();
  await f.pty.closed;
  expect(events).toEqual(["final Ж bytes", "exit:7"]);
});

it("does not confirm retirement or publish exit when the helper dies without its kernel ACK", async () => {
  const f = fixture({ heldClose: true });
  const exit = vi.fn<(event: { exitCode: number; signal?: number }) => void>();
  f.pty.onExit(exit);
  await f.pty.ready;
  const closing = f.pty.close();
  f.helper.close();
  f.broker.close();
  await expect(closing).rejects.toThrow("did not confirm kernel process retirement");
  expect(f.pty.exitConfirmed).toBe(false);
  expect(exit).not.toHaveBeenCalled();
  await expect(f.pty.close()).rejects.toThrow("did not confirm kernel process retirement");
});

it("retires only the selected terminal and keeps another owner's input/output live", async () => {
  const first = fixture();
  const second = fixture();
  await Promise.all([first.pty.ready, second.pty.ready]);
  const data: string[] = [];
  const input: Buffer[] = [];
  second.pty.onData((value) => data.push(value));
  second.broker.value.stdin.on("data", (value: Buffer) => input.push(value));
  await first.pty.close();
  expect(second.pty.exitConfirmed).toBe(false);
  second.pty.write("still owned");
  second.broker.value.stdout.write("still live");
  expect(Buffer.concat(input).toString()).toBe("still owned");
  expect(data).toEqual(["still live"]);
  expect(second.broker.value.exitCode).toBeNull();
});

it.each(["version", "nonce", "unknown"])("retires on a refused %s control frame", async (field) => {
  const f = fixture();
  await f.pty.ready;
  const exit = vi.fn<(event: { exitCode: number; signal?: number }) => void>();
  f.pty.onExit(exit);
  f.reply({
    kind: "exited",
    exitCode: 0,
    ...{ version: { version: 2 }, nonce: { nonce: "b".repeat(48) }, unknown: { future: true } }[
      field
    ],
  });
  await f.pty.closed;
  expect(f.pty.exitConfirmed).toBe(true);
  expect(exit).toHaveBeenCalledExactlyOnceWith({ exitCode: 1 });
});

it.each(["stdin", "stdout", "stderr"] as const)(
  "joins a %s error without leaking native error details",
  async (stream) => {
    const f = fixture();
    let output = "";
    f.pty.onData((data) => {
      output += data;
    });
    await f.pty.ready;
    f.broker.value[stream].emit("error", new Error("fixture-private-secret"));
    await f.pty.closed;
    expect(f.pty.exitConfirmed).toBe(true);
    expect(output).toContain("pipe failed");
    expect(output).not.toContain("fixture-private-secret");
  },
);
