import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  custodyStarted,
  FORMAT_A,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import { makeRuntimePayloadCustodyHarness } from "./runtimePayloadCustody.testFixtures";

const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: vi.fn<() => void>() }));

type Harness = Awaited<ReturnType<typeof makeRuntimePayloadCustodyHarness>>;
let h: Harness | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  if (h) await h.dispose();
  h = undefined;
  vi.useRealTimers();
});

describe("canonical credit during supervisor retirement", () => {
  it("releases a credit-held final envelope into SQLite before the child closes", async () => {
    h = await makeRuntimePayloadCustodyHarness(mocks.fork);
    const initialCredit = 1_000_000;
    h.sender.setCanonicalCredit({ windowBytes: initialCredit, generation: h.generation });
    h.emitA(custodyStarted("a", "first"));
    h.router.flush();
    const firstEnvelopeBytes = initialCredit - h.sender.canonicalCreditRemaining();
    expect(firstEnvelopeBytes).toBeGreaterThan(0);
    h.sender.setCanonicalCredit({ windowBytes: firstEnvelopeBytes, generation: h.generation });
    expect(h.sender.canonicalCreditRemaining()).toBe(0);

    // The first envelope's coalesced admission ACK is still scheduled when
    // disposal starts. Its released credit must reach the SAME retiring child.
    const retiring = h.core.disposeSupervisor();
    h.emitA(custodyStarted("a", "final"));
    h.router.flush();
    expect(h.wire).toHaveLength(1);
    vi.advanceTimersByTime(0);
    await h.flush();

    expect(h.wire).toHaveLength(2);
    expect(h.row("a", "first")).toMatchObject({ type: "tool_call" });
    expect(h.row("a", "final")).toMatchObject({ type: "tool_call" });
    expect(h.origin("a", "final")).toBe(FORMAT_A);
    h.child.finish();
    await retiring;
  });
});
