import { describe, expect, it } from "vitest";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import type { SessionRef, Thread } from "@/shared/contracts";
import {
  carryVolatileSessionConfigOptions,
  stripVolatileSessionConfigOptions,
} from "./volatileSessionConfigOptions";

const inventory: SessionConfigOptions = [
  {
    id: "mode",
    type: "select",
    role: "mode",
    currentValue: "fast",
    values: [{ value: "fast" }, { value: "careful" }],
    groups: [],
  },
];

const sessionRef: SessionRef = {
  providerSessionId: "session-a",
  discoveredAt: "2026-10-08T00:00:00.000Z",
  executionIdentity: "execution-scope-1",
};

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "test-agent",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    sessionRef,
    ...overrides,
  };
}

/** The resident row as a live runtime left it: inventory attached. */
const liveResident = thread({ sessionConfigOptions: inventory });

/** The replacement row as a durable/pull surface serves it: key omitted. */
function pageOf(resident: Thread, overrides: Partial<Thread> = {}): Thread {
  const { sessionConfigOptions: _omitted, ...page } = resident;
  return { ...page, ...overrides };
}

describe("carryVolatileSessionConfigOptions", () => {
  it("carries a live resident inventory onto a replacement that omits the key", () => {
    const carried = carryVolatileSessionConfigOptions(liveResident, pageOf(liveResident));
    expect(carried.sessionConfigOptions).toBe(inventory);
    expect(carried.title).toBe(liveResident.title);
    expect(carried).not.toBe(liveResident);
  });

  it("returns the incoming row untouched when the carry does not fire", () => {
    const explicit = pageOf(liveResident, { sessionConfigOptions: null });
    expect(carryVolatileSessionConfigOptions(liveResident, explicit)).toBe(explicit);

    const emptied = pageOf(liveResident, { sessionConfigOptions: [] });
    expect(carryVolatileSessionConfigOptions(liveResident, emptied)).toBe(emptied);

    const valued = pageOf(liveResident, {
      sessionConfigOptions: [
        {
          id: "mode",
          type: "select",
          role: "mode",
          currentValue: "careful",
          values: [{ value: "fast" }, { value: "careful" }],
          groups: [],
        },
      ],
    });
    expect(carryVolatileSessionConfigOptions(liveResident, valued)).toBe(valued);

    const retired = thread({ sessionConfigOptions: null });
    const retiredPage = pageOf(retired);
    expect(carryVolatileSessionConfigOptions(retired, retiredPage)).toBe(retiredPage);

    const cold = thread();
    const coldPage = pageOf(cold);
    expect(carryVolatileSessionConfigOptions(cold, coldPage)).toBe(coldPage);
  });

  it("never carries onto an inactive or archived replacement", () => {
    expect(
      carryVolatileSessionConfigOptions(liveResident, pageOf(liveResident, { status: "inactive" }))
        .sessionConfigOptions,
    ).toBeUndefined();
    expect(
      carryVolatileSessionConfigOptions(liveResident, pageOf(liveResident, { archived: true }))
        .sessionConfigOptions,
    ).toBeUndefined();
  });

  it("keeps the carry for a live runtime that merely errored or finished", () => {
    expect(
      carryVolatileSessionConfigOptions(liveResident, pageOf(liveResident, { status: "error" }))
        .sessionConfigOptions,
    ).toBe(inventory);
    expect(
      carryVolatileSessionConfigOptions(
        liveResident,
        pageOf(liveResident, { status: "finished", done: true }),
      ).sessionConfigOptions,
    ).toBe(inventory);
  });

  it("does not carry across a changed owner, session, or execution identity", () => {
    expect(
      carryVolatileSessionConfigOptions(liveResident, pageOf(liveResident, { agentKind: "other" }))
        .sessionConfigOptions,
    ).toBeUndefined();
    expect(
      carryVolatileSessionConfigOptions(
        liveResident,
        pageOf(liveResident, {
          sessionRef: { ...sessionRef, providerSessionId: "session-b" },
        }),
      ).sessionConfigOptions,
    ).toBeUndefined();
    expect(
      carryVolatileSessionConfigOptions(
        liveResident,
        pageOf(liveResident, {
          sessionRef: { ...sessionRef, executionIdentity: "execution-scope-2" },
        }),
      ).sessionConfigOptions,
    ).toBeUndefined();
    // An unresolvable page reference (older host) inherits nothing, and a
    // resident without its own reference has nothing to vouch for.
    const unowned = pageOf(liveResident);
    delete unowned.sessionRef;
    expect(
      carryVolatileSessionConfigOptions(liveResident, unowned).sessionConfigOptions,
    ).toBeUndefined();
    const unownedResident = thread();
    delete unownedResident.sessionRef;
    expect(
      carryVolatileSessionConfigOptions(unownedResident, pageOf(unownedResident))
        .sessionConfigOptions,
    ).toBeUndefined();
  });

  it("is identity-safe for the row the replacement already reuses", () => {
    expect(carryVolatileSessionConfigOptions(liveResident, liveResident)).toBe(liveResident);
    const bare = thread();
    expect(carryVolatileSessionConfigOptions(bare, bare)).toBe(bare);
  });
});

describe("stripVolatileSessionConfigOptions", () => {
  it("removes only the volatile key and keeps clean rows referentially intact", () => {
    const stripped = stripVolatileSessionConfigOptions(liveResident);
    expect(stripped).not.toHaveProperty("sessionConfigOptions");
    expect(stripped.id).toBe(liveResident.id);
    const clean = pageOf(liveResident);
    expect(stripVolatileSessionConfigOptions(clean)).toBe(clean);
    // `null` is an explicit retirement the event stream delivered: the strip
    // removes it like any other value, retirement lives in live rows only.
    expect(
      stripVolatileSessionConfigOptions(thread({ sessionConfigOptions: null })),
    ).not.toHaveProperty("sessionConfigOptions");
  });
});
