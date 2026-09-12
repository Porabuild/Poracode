import { describe, expect, it, vi } from "vitest";
import { TerminalScrollbackPersistence } from "./terminalScrollbackPersistence";

describe("TerminalScrollbackPersistence", () => {
  it("coalesces output and flushes it at terminal exit", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "one",
      outputLength: 3,
      terminalInstanceId: "gen-test",
    });
    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "two",
      outputLength: 6,
      terminalInstanceId: "gen-test",
    });
    expect(append).not.toHaveBeenCalled();

    persistence.handle({ type: "thread-exited", threadId: "thread-1", exitCode: 0 });
    expect(append).toHaveBeenCalledWith("thread-1", "onetwo", 6);
  });

  it("drops pending output and clears durable state on reset", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const clear = vi.fn<(threadId: string) => void>();
    const persistence = new TerminalScrollbackPersistence({ append, clear });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "old",
      outputLength: 3,
      terminalInstanceId: "gen-test",
    });
    persistence.handle({ type: "thread-reset", threadId: "thread-1" });
    persistence.flush();

    expect(append).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith("thread-1");
  });

  it("does not persist transient shell-action output", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle({
      type: "thread-output",
      threadId: "shell:git-status",
      data: "noise",
      outputLength: 5,
      terminalInstanceId: "gen-test",
    });
    persistence.flush();
    expect(append).not.toHaveBeenCalled();
  });

  it("flushes pending output before a generation change (mirrors SupervisorIpcSender)", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "old",
      outputLength: 3,
      terminalInstanceId: "gen-a",
    });
    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "new",
      outputLength: 3,
      terminalInstanceId: "gen-b",
    });

    // Old generation flushed immediately; new generation still pending.
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith("thread-1", "old", 3);

    persistence.flush();
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenLastCalledWith("thread-1", "new", 3);
  });
});
