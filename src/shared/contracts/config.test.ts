import { describe, expect, it } from "vitest";
import executionEnvironmentFixture from "../../../protocol/remote/v3/fixtures/thread-config-execution-environment.json";
import {
  areSelectionBindingsEqual,
  isThreadConfigEqual,
  providerDraftConfigSchema,
  projectDraftConfigSchema,
  threadConfigSchema,
} from "./config";
import type { SelectionBinding } from "../selectionBinding.schemas";

const stamp: SelectionBinding = {
  version: 1,
  kind: "family-member",
  owner: { agentKind: "sample-agent", presentationMode: "terminal" },
  model: "member-a",
  inertValues: { effort: "", fast: false },
};

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
