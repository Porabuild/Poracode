import { describe, expect, it } from "vitest";
import {
  scheduledTaskConfigSchema,
  scheduledTaskInputSchema,
  scheduledTaskSchema,
} from "./schedule";
import { prWatchAgentSyncSchema, prWatchInputSchema } from "./prWatch";
import type { SelectionBinding } from "../selectionBinding.schemas";

const stamp: SelectionBinding = {
  version: 1,
  kind: "family-member",
  owner: { agentKind: "sample-agent", presentationMode: "terminal" },
  model: "member-a",
  inertValues: { effort: "", fast: false },
};

const fullTuple = {
  model: "member-a",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
  selectionBinding: stamp,
};

describe("scheduled task config canonical selection", () => {
  it("keeps the legacy minimal shape and the existing nonempty-model rule", () => {
    expect(scheduledTaskConfigSchema.parse({ model: "sample-model" })).toEqual({
      model: "sample-model",
    });
    expect(scheduledTaskConfigSchema.safeParse({ model: "" }).success).toBe(false);
    expect(scheduledTaskConfigSchema.safeParse({}).success).toBe(false);
  });

  it("preserves the full tuple exactly, including falsy carriers and the binding", () => {
    expect(scheduledTaskConfigSchema.parse(fullTuple)).toEqual(fullTuple);
  });

  it("distinguishes omitted carriers from empty/false ones", () => {
    const omitted = scheduledTaskConfigSchema.parse({ model: "m" });
    expect(Object.hasOwn(omitted, "effort")).toBe(false);
    expect(Object.hasOwn(omitted, "fast")).toBe(false);
    expect(Object.hasOwn(omitted, "thinking")).toBe(false);
    expect(Object.hasOwn(omitted, "contextSize")).toBe(false);
    expect(Object.hasOwn(omitted, "selectionBinding")).toBe(false);
    const emptyCarriers = scheduledTaskConfigSchema.parse({
      model: "m",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "",
    });
    expect(emptyCarriers).toEqual({
      model: "m",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "",
    });
  });

  it("rejects malformed, future, and unknown-key bindings instead of stripping them", () => {
    expect(
      scheduledTaskConfigSchema.safeParse({
        ...fullTuple,
        selectionBinding: { ...stamp, version: 2 },
      }).success,
    ).toBe(false);
    expect(
      scheduledTaskConfigSchema.safeParse({
        ...fullTuple,
        selectionBinding: { ...stamp, futureKey: true },
      }).success,
    ).toBe(false);
    expect(
      scheduledTaskConfigSchema.safeParse({ model: "m", selectionBinding: null }).success,
    ).toBe(false);
  });

  it("rejects unknown config keys (canonical strict shape) and coerced carriers", () => {
    expect(scheduledTaskConfigSchema.safeParse({ model: "m", futureAxis: "x" }).success).toBe(
      false,
    );
    expect(scheduledTaskConfigSchema.safeParse({ model: "m", effort: 3 }).success).toBe(false);
    expect(scheduledTaskConfigSchema.safeParse({ model: "m", fast: "false" }).success).toBe(false);
  });

  it("round-trips the full tuple through the task input and stored task shapes", () => {
    const input = {
      name: "Nightly sweep",
      prompt: "check",
      agentKind: "sample-agent",
      config: fullTuple,
      recurrence: { kind: "hourly", minute: 7 },
      enabled: true,
    };
    expect(scheduledTaskInputSchema.parse(input).config).toEqual(fullTuple);
    const stored = scheduledTaskSchema.parse({
      ...input,
      id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextRunAt: null,
      lastRunAt: null,
      lastCompletedAt: null,
      lastStatus: "never",
      lastResult: null,
      lastError: null,
    });
    expect(stored.config).toEqual(fullTuple);
  });
});

describe("pr watch inheritance of the canonical selection", () => {
  const base = {
    projectId: "p1",
    prNumber: 3,
    headBranch: "feature",
    watchEnabled: true,
    autoMerge: false,
  };

  it("carries the full tuple and binding on a watch input and agent sync", () => {
    expect(
      prWatchInputSchema.parse({ ...base, agentKind: "sample-agent", config: fullTuple }),
    ).toEqual({
      ...base,
      agentKind: "sample-agent",
      config: fullTuple,
    });
    expect(
      prWatchAgentSyncSchema.parse({
        projectId: "p1",
        agentKind: "sample-agent",
        config: fullTuple,
      }).config,
    ).toEqual(fullTuple);
  });

  it("rejects a malformed binding through the inherited watch config", () => {
    expect(
      prWatchInputSchema.safeParse({
        ...base,
        agentKind: "sample-agent",
        config: { ...fullTuple, selectionBinding: { ...stamp, version: 2 } },
      }).success,
    ).toBe(false);
    expect(
      prWatchAgentSyncSchema.safeParse({
        projectId: "p1",
        agentKind: "sample-agent",
        config: { ...fullTuple, selectionBinding: { ...stamp, unknownKey: 1 } },
      }).success,
    ).toBe(false);
  });

  it("keeps the optional whole-config omission as a request for the default", () => {
    // The existing superRefine still requires an agent and config for an
    // ENABLED watch; omission is only admitted when the watch is disabled.
    const parsed = prWatchInputSchema.parse({ ...base, watchEnabled: false });
    expect(Object.hasOwn(parsed, "config")).toBe(false);
  });
});
