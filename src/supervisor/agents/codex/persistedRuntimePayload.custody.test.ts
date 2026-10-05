import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRuntimePayloadCustodyHarness } from "@/backend/runtimePayloadCustody.testFixtures";
import { custodyAdapter } from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import { dbGetThreadRuntimeItemCommitted } from "@/host/db/runtimeItemRead";
import { PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY } from "./persistedRuntimePayload";
const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
type Harness = Awaited<ReturnType<typeof makeRuntimePayloadCustodyHarness>>;
let h: Harness;
beforeEach(async () => {
  vi.useFakeTimers();
  h = await makeRuntimePayloadCustodyHarness(mocks.fork);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await h.dispose();
  vi.useRealTimers();
});
describe("Codex persisted create source-to-reader custody", () => {
  it("repairs only proved new creates through actual guarded source, JSON IPC, queue, SQL and read projection", async () => {
    const path = "/fixture/create.txt";
    const source = {
      changes: [{ path, kind: { type: "add" }, diff: "GENUINE_CREATED\nsecond\nthird\n" }],
    };
    const payload = {
      path,
      changeKind: "create",
      diffSummary: { added: 0, removed: 0 },
      args: source,
      result: source,
    };
    const modern = h.source.attach(
      "a",
      custodyAdapter("unrelated-current-route", PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY),
    );
    modern.handle.emit({
      type: "item.started",
      threadId: "a",
      itemId: "proved-create",
      itemType: "file_change",
      payload,
    });
    h.router.append("a", {
      type: "item.started",
      threadId: "a",
      itemId: "unproved-create",
      itemType: "file_change",
      payload,
    });
    await h.flush();
    expect(h.origin("a", "proved-create")).toBe(PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY);
    expect(h.origin("a", "unproved-create")).toBeUndefined();
    expect(h.row("a", "proved-create")).toMatchObject({ payload: JSON.stringify(payload) });
    expect(h.row("a", "unproved-create")).toMatchObject({ payload: JSON.stringify(payload) });
    expect(dbGetThreadRuntimeItemCommitted("a", "proved-create")?.payload).toEqual({
      ...payload,
      diffSummary: { added: 3, removed: 0 },
    });
    expect(dbGetThreadRuntimeItemCommitted("a", "unproved-create")?.payload).toEqual(payload);
    expect(JSON.stringify(h.published)).not.toContain("runtimePayloadOrigins");
    expect(
      h.published.some(
        (event) =>
          event.type === "thread-runtime-events" &&
          event.events.some((e) => e.type === "item.started" && e.itemId === "proved-create"),
      ),
    ).toBe(true);
  });
});
