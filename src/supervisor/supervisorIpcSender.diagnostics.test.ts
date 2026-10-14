import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorReply } from "@/shared/ipc";
import { SupervisorIpcSender } from "./supervisorIpcSender";
import { IpcQueueProbe } from "./ipcQueueProbe";

const reply = (replyTo: string): SupervisorReply => ({ replyTo, ok: true, data: null });

afterEach(() => vi.restoreAllMocks());

describe("IPC application queue observations", () => {
  it("leaves queue observation disabled unless explicitly requested", () => {
    const clock = vi.spyOn(performance, "now");
    const sender = new SupervisorIpcSender({
      send: (_message, done) => {
        done(null);
        return true;
      },
      onError: () => {},
    });
    sender.reply(reply("fixture"));
    expect(sender.getQueueDiagnostics()).toBeUndefined();
    expect(clock).not.toHaveBeenCalled();
  });

  it("stops timestamps and counters when the recorder ends, while preserving message delivery", () => {
    const capture = { active: true };
    const clock = vi.spyOn(performance, "now");
    const delivered: unknown[] = [];
    const sender = new SupervisorIpcSender({
      queueDiagnostics: capture,
      send: (message, done) => {
        delivered.push(message);
        done(null);
        return true;
      },
      onError: () => {},
    });
    sender.reply(reply("recorded"));
    expect(sender.getQueueDiagnostics()?.sendAttempts).toBe(1);
    capture.active = false;
    clock.mockClear();
    sender.reply(reply("after-recording"));
    expect(sender.getQueueDiagnostics()).toBeUndefined();
    expect(clock).not.toHaveBeenCalled();
    expect(delivered).toEqual([reply("recorded"), reply("after-recording")]);
  });

  it("measures waiting bytes and oldest age separately from native sends", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const callbacks: Array<(error: Error | null) => void> = [];
    const sender = new SupervisorIpcSender({
      queueDiagnostics: { active: true },
      backpressureTimeoutMs: null,
      send: (_message, done) => {
        callbacks.push(done);
        return false;
      },
      onError: () => {},
    });
    sender.reply(reply("first"));
    now = 10;
    sender.reply(reply("second🧪"));
    now = 20;
    sender.reply(reply("third"));
    now = 40;
    const queuedBytes =
      Buffer.byteLength(JSON.stringify(reply("second🧪"))) +
      Buffer.byteLength(JSON.stringify(reply("third")));
    expect(sender.getQueueDiagnostics()).toMatchObject({
      waitingMessages: 2,
      waitingEstimatedBytes: queuedBytes,
      oldestQueuedMessageAgeMs: 30,
      inFlightMessages: 1,
      sendAttempts: 1,
      peakWaitingMessages: 2,
      peakWaitingEstimatedBytes: queuedBytes,
      backpressured: true,
    });
    now = 100;
    callbacks[0]!(null);
    expect(sender.getQueueDiagnostics()).toMatchObject({
      waitingMessages: 1,
      oldestQueuedMessageAgeMs: 80,
      inFlightMessages: 1,
      sendAttempts: 2,
    });
    callbacks[1]!(null);
    callbacks[2]!(null);
    expect(sender.getQueueDiagnostics()).toMatchObject({
      waitingMessages: 0,
      waitingEstimatedBytes: 0,
      oldestQueuedMessageAgeMs: null,
      inFlightMessages: 0,
      sendAttempts: 3,
      peakWaitingMessages: 2,
      backpressured: false,
    });
  });

  it("retains the first admission time when a failed reply waits for retry", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const callbacks: Array<(error: Error | null) => void> = [];
    const sender = new SupervisorIpcSender({
      queueDiagnostics: { active: true },
      backpressureTimeoutMs: null,
      send: (_message, done) => {
        callbacks.push(done);
        return callbacks.length === 1;
      },
      onError: () => {},
    });
    sender.reply(reply("retry"));
    now = 10;
    sender.reply(reply("blocking"));
    now = 20;
    sender.reply(reply("queued"));
    now = 80;
    callbacks[0]!(new Error("synthetic send failure"));
    expect(sender.getQueueDiagnostics()).toMatchObject({
      waitingMessages: 2,
      oldestQueuedMessageAgeMs: 80,
      inFlightMessages: 1,
    });
    callbacks[1]!(null);
    callbacks[2]!(null);
    callbacks[3]!(null);
    expect(sender.getQueueDiagnostics()).toMatchObject({ waitingMessages: 0, inFlightMessages: 0 });
  });

  it("reports terminal coalescing separately from the waiting queue", () => {
    const sender = new SupervisorIpcSender({
      queueDiagnostics: { active: true },
      send: (_message, done) => {
        done(null);
        return true;
      },
      onError: () => {},
    });
    sender.emit({
      type: "thread-output",
      threadId: "fixture",
      data: "one",
      outputLength: 3,
      terminalInstanceId: "one",
    });
    sender.emit({
      type: "thread-output",
      threadId: "fixture",
      data: "two",
      outputLength: 6,
      terminalInstanceId: "one",
    });
    expect(sender.getQueueDiagnostics()).toMatchObject({
      waitingMessages: 0,
      waitingEstimatedBytes: 0,
      oldestQueuedMessageAgeMs: null,
      terminalBatchMessages: 1,
      inFlightMessages: 0,
      sendAttempts: 0,
    });
    sender.flush();
    expect(sender.getQueueDiagnostics()).toMatchObject({
      terminalBatchMessages: 0,
      sendAttempts: 1,
    });
  });

  it.each(["eager", "overflow"] as const)(
    "retains an existing %s recovery marker's age when merging later sheds",
    (mode) => {
      type Message = { kind: "bulk" | "gap"; data: string };
      let now = 0;
      vi.spyOn(performance, "now").mockImplementation(() => now);
      const callbacks: Array<(error: Error | null) => void> = [];
      const sender = new SupervisorIpcSender<Message>({
        queueDiagnostics: { active: true },
        backpressureTimeoutMs: null,
        maxQueuedMessages: 2,
        send: (_message, done) => {
          callbacks.push(done);
          return false;
        },
        onError: () => {},
        shedPolicy: {
          isSheddable: (message) => "kind" in message && message.kind === "bulk",
          isRecoverySignal: (message) => "kind" in message && message.kind === "gap",
          createRecoverySignal: () => ({ kind: "gap", data: "gap" }),
        },
      });
      sender.reply(reply("held"));
      if (mode === "eager") sender.setEagerShed(true);
      let shedBytes = 0;
      // Eager mode sheds each incoming bulk at the source (4 messages). The
      // overflow mode needs a fifth message so the third bulk is shed into the
      // already-queued marker; the marker keeps its original admission time.
      const messageCount = mode === "eager" ? 4 : 5;
      for (let index = 1; index <= messageCount; index++) {
        now = index * 10;
        const message: Message = { kind: "bulk", data: `${index}🧪` };
        sender.sendMessage(message);
        if (mode === "eager" || index < 4) shedBytes += Buffer.byteLength(JSON.stringify(message));
      }
      now = 100;
      expect(sender.getQueueDiagnostics()).toMatchObject({
        oldestQueuedMessageAgeMs: mode === "eager" ? 90 : 70,
        shedMessages: mode === "eager" ? 4 : 3,
        shedEstimatedBytes: shedBytes,
        untimedWaitingMessages: 0,
      });
      while (callbacks.length) callbacks.shift()!(null);
    },
  );

  it("reports unknown oldest age if any waiting message lacks a valid admission timestamp", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    const probe = new IpcQueueProbe();
    const sample = probe.sample({
      queue: [{ queuedAt: 10 }, {}, { queuedAt: NaN }, { queuedAt: 101 }],
      waitingEstimatedBytes: 4,
      maxWaitingMessages: 10,
      maxWaitingEstimatedBytes: 100,
      terminalBatchMessages: 0,
      inFlightMessages: 0,
      backpressured: true,
      failed: false,
    });
    expect(sample).toMatchObject({
      waitingMessages: 4,
      oldestQueuedMessageAgeMs: null,
      untimedWaitingMessages: 3,
    });
  });
});
