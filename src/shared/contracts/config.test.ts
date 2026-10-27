import { describe, expect, it } from "vitest";
import executionEnvironmentFixture from "../../../protocol/remote/v3/fixtures/thread-config-execution-environment.json";
import {
  areSelectionBindingsEqual,
  isThreadConfigEqual,
  providerDraftConfigSchema,
  projectDraftConfigSchema,
  threadConfigSchema,
  retainThreadToolOverrides,
} from "./config";
import { threadCrewBinding } from "../crew";
import type { SelectionBinding } from "../selectionBinding.schemas";

const stamp: SelectionBinding = {
  version: 1,
  kind: "family-member",
  owner: { agentKind: "sample-agent", presentationMode: "terminal" },
  model: "member-a",
  inertValues: { effort: "", fast: false },
};

describe("thread tool choices", () => {
  it("retains overrides omitted by an older client and permits explicit clearing", () => {
    const previous = {
      model: "old",
      mcpServerOverrides: { custom: true },
      pluginOverrides: { github: false },
    };
    expect(retainThreadToolOverrides({ model: "new" }, previous)).toEqual({
      ...previous,
      model: "new",
    });
    const cleared = { model: "new", mcpServerOverrides: {}, pluginOverrides: {} };
    expect(retainThreadToolOverrides(cleared, previous)).toEqual(cleared);
  });
  it("keeps pre-upgrade config unchanged and round-trips new overrides", () => {
    const previous = { model: "fixture", browserMcp: false };
    expect(threadConfigSchema.parse(previous)).toEqual(previous);
    const next = {
      ...previous,
      mcpServerOverrides: { custom: true },
      pluginOverrides: { github: false },
    };
    expect(threadConfigSchema.parse(next)).toEqual(next);
    expect(isThreadConfigEqual(previous, next)).toBe(false);
    expect(isThreadConfigEqual(next, { ...next, pluginOverrides: { github: true } })).toBe(false);
    expect(isThreadConfigEqual(next, { ...next, mcpServerOverrides: { custom: false } })).toBe(
      false,
    );
    expect(
      isThreadConfigEqual(
        { ...previous, pluginOverrides: { a: true, b: false } },
        { ...previous, pluginOverrides: { b: false, a: true } },
      ),
    ).toBe(true);
  });
});

describe("thread crew binding", () => {
  const crew = {
    version: 1 as const,
    crewId: "ship",
    name: "Ship crew",
    policy: "crew-only" as const,
    roles: [
      {
        id: "builder",
        label: "Builder",
        selection: { agentKind: "codex", model: "gpt-5.5" },
      },
    ],
  };

  it("keeps pre-crew configs unchanged and retains omitted crew from older writers", () => {
    const old = { model: "fixture", browserMcp: false };
    expect(threadConfigSchema.parse(old)).toEqual(old);
    expect(retainThreadToolOverrides({ model: "new" }, { model: "old", crew })).toEqual({
      model: "new",
      crew,
    });
  });

  it("treats null as explicit clear and bindings as replacements", () => {
    const previous = { model: "old", crew };
    expect(retainThreadToolOverrides({ model: "new" }, { model: "old", crew: null })).toEqual({
      model: "new",
      crew: null,
    });
    expect(retainThreadToolOverrides({ model: "new", crew: null }, previous)).toEqual({
      model: "new",
      crew: null,
    });
    const replacement = { ...crew, name: "Review board" };
    expect(retainThreadToolOverrides({ model: "new", crew: replacement }, previous).crew).toEqual(
      replacement,
    );
  });

  it("includes the crew in structural equality", () => {
    expect(isThreadConfigEqual({ model: "same" }, { model: "same", crew: null })).toBe(true);
    expect(isThreadConfigEqual({ model: "same", crew }, { model: "same" })).toBe(false);
    expect(
      isThreadConfigEqual(
        { model: "same", crew },
        { model: "same", crew: { ...crew, policy: "crew-first" } },
      ),
    ).toBe(false);
  });

  it("preserves future crew bindings opaquely and keeps strict parsing for v1", () => {
    const future = { version: 2, futureField: { retained: true } };
    expect(threadConfigSchema.parse({ model: "fixture", crew: future }).crew).toEqual(future);
    expect(threadCrewBinding({ crew: future })).toBeUndefined();
    expect(threadConfigSchema.strict().parse({ model: "fixture", crew })).toEqual({
      model: "fixture",
      crew,
    });
  });
});

describe("thread execution environment", () => {
  it("persists a selected WSL distro", () => {
    expect(threadConfigSchema.parse(executionEnvironmentFixture)).toEqual({
      model: "fixture-model",
      effort: "medium",
      executionEnvironment: { kind: "wsl", distro: "Ubuntu-22.04" },
    });
  });

  it("treats a distro change as a config change", () => {
    expect(
      isThreadConfigEqual(
        { model: "model", executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
        { model: "model", executionEnvironment: { kind: "wsl", distro: "Debian" } },
      ),
    ).toBe(false);
  });
});

describe("thread config selection binding", () => {
  it("round-trips a recognized v1 record on the shared config shape", () => {
    const config = { model: "member-a", effort: "", selectionBinding: stamp };
    expect(threadConfigSchema.parse(config)).toEqual(config);
    // The same shape is inherited by the provider-draft and project-draft configs.
    expect(providerDraftConfigSchema.parse(config)).toEqual(config);
    expect(projectDraftConfigSchema.parse({ ...config, agentKind: "codex" })).toEqual({
      ...config,
      agentKind: "codex",
    });
  });

  it("keeps a legacy unstamped config valid", () => {
    expect(threadConfigSchema.safeParse({ model: "model", effort: "high" }).success).toBe(true);
  });

  it("rejects unknown keys, future versions, and empty recorded maps on the wire", () => {
    const malformed = [
      { ...stamp, unknown: true },
      { ...stamp, version: 2 },
      { ...stamp, kind: "exact-model" },
      { ...stamp, inertValues: {} },
      { ...stamp, model: "" },
      { ...stamp, owner: { ...stamp.owner, presentationMode: "headless" } },
      { ...stamp, inertValues: { effort: null } },
    ];
    for (const selectionBinding of malformed) {
      expect(threadConfigSchema.safeParse({ model: "member-a", selectionBinding }).success).toBe(
        false,
      );
    }
  });

  it("distinguishes missing, empty, false, and default recorded carriers", () => {
    const emptyEffort = threadConfigSchema.parse({
      model: "m",
      selectionBinding: { ...stamp, inertValues: { effort: "" } },
    });
    const defaultEffort = threadConfigSchema.parse({
      model: "m",
      selectionBinding: { ...stamp, inertValues: { effort: "default" } },
    });
    expect(isThreadConfigEqual(emptyEffort, defaultEffort)).toBe(false);
    const falseFast = threadConfigSchema.parse({
      model: "m",
      selectionBinding: { ...stamp, inertValues: { fast: false } },
    });
    const thinkingCarrier = threadConfigSchema.parse({
      model: "m",
      selectionBinding: { ...stamp, inertValues: { fast: false, thinking: false } },
    });
    expect(isThreadConfigEqual(falseFast, thinkingCarrier)).toBe(false);
  });

  it("includes exact stamp presence and every recorded field in config equality", () => {
    const unstamped = { model: "member-a", effort: "" };
    const stamped = { ...unstamped, selectionBinding: stamp };
    expect(isThreadConfigEqual(unstamped, stamped)).toBe(false);
    expect(isThreadConfigEqual(stamped, { ...unstamped, selectionBinding: { ...stamp } })).toBe(
      true,
    );
    // Owner identity: full kind, presentation, and optional instance-id presence.
    expect(
      isThreadConfigEqual(stamped, {
        ...unstamped,
        selectionBinding: {
          ...stamp,
          owner: { ...stamp.owner, agentKind: "other-agent" },
        },
      }),
    ).toBe(false);
    expect(
      isThreadConfigEqual(stamped, {
        ...unstamped,
        selectionBinding: {
          ...stamp,
          owner: { ...stamp.owner, presentationMode: "gui" },
        },
      }),
    ).toBe(false);
    expect(
      isThreadConfigEqual(stamped, {
        ...unstamped,
        selectionBinding: {
          ...stamp,
          owner: { ...stamp.owner, agentInstanceId: "instance-1" },
        },
      }),
    ).toBe(false);
    expect(
      isThreadConfigEqual(
        {
          ...unstamped,
          selectionBinding: { ...stamp, owner: { ...stamp.owner, agentInstanceId: "instance-1" } },
        },
        {
          ...unstamped,
          selectionBinding: { ...stamp, owner: { ...stamp.owner, agentInstanceId: "instance-1" } },
        },
      ),
    ).toBe(true);
    // Recorded model and recorded values.
    expect(
      isThreadConfigEqual(stamped, { ...unstamped, selectionBinding: { ...stamp, model: "m2" } }),
    ).toBe(false);
    expect(
      isThreadConfigEqual(stamped, {
        ...unstamped,
        selectionBinding: { ...stamp, inertValues: { effort: "", fast: true } },
      }),
    ).toBe(false);
  });

  it("compares recognized JSON-shaped records directly, including absent versus a present instance id", () => {
    const withInstance: SelectionBinding = {
      ...stamp,
      owner: { ...stamp.owner, agentInstanceId: "instance-1" },
    };
    expect(areSelectionBindingsEqual(stamp, stamp)).toBe(true);
    expect(areSelectionBindingsEqual(stamp, withInstance)).toBe(false);
    expect(areSelectionBindingsEqual(undefined, stamp)).toBe(false);
    expect(areSelectionBindingsEqual(stamp, undefined)).toBe(false);
    expect(areSelectionBindingsEqual(undefined, undefined)).toBe(true);
    expect(areSelectionBindingsEqual(stamp, { ...stamp, inertValues: { effort: "" } })).toBe(false);
  });
});
