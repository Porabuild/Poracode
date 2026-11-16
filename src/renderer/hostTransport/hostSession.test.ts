import { describe, expect, it } from "vitest";
import { HostSession, hostEventThreadIds } from "./hostSession";

describe("host session", () => {
  it("keeps catalog and thread live marks separate from HTTP cursors and private events", () => {
    const session = new HostSession();
    session.recordApplied(
      5,
      hostEventThreadIds({ batches: [{ threadId: "a" }, { threadId: "b" }] }),
    );
    session.recordApplied(900, ["a"], "ipc");
    session.advanceResume(100);
    expect(session.appliedSequence()).toBe(5);
    expect(session.threadSequence("a")).toBe(5);
    expect(session.threadSequence("b")).toBe(5);
    expect(session.threadSequence("c")).toBeUndefined();
    expect(session.threadSequence("a", "ipc")).toBe(900);
    expect(session.resumeSeq).toBe(100);
  });

  it("rejects a late HTTP cursor after restart or disconnect and accepts the new epoch", () => {
    const session = new HostSession();
    session.bindResume(40, "old");
    const oldFence = session.resumeFence;
    session.bindResume(0, "new");
    session.advanceResume(50, oldFence);
    expect(session.resumeSeq).toBe(0);
    session.advanceResume(3, session.resumeFence);
    session.advanceResume(1, session.resumeFence);
    expect(session.resumeSeq).toBe(3);
    const newFence = session.resumeFence;
    session.clearResume();
    session.advanceResume(50, newFence);
    expect(session.resumeSeq).toBe(0);
  });

  it("resets only its own host's applied sequence after reconnect", () => {
    const session = new HostSession();
    const other = new HostSession();
    session.recordApplied(50, ["same-thread-id"]);
    other.recordApplied(70, ["same-thread-id"]);
    session.clearApplied();
    session.recordApplied(1, ["same-thread-id"]);
    expect(session.threadSequence("same-thread-id")).toBe(1);
    expect(other.threadSequence("same-thread-id")).toBe(70);
  });
});
