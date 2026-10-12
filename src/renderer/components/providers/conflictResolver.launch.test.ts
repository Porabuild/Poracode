// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import {
  readConflictResolverSettingsForProject,
  resolveConflictResolverConfig,
  resolveConflictResolverLaunchConfig,
} from "./conflictResolver";
import "./claude";
import "./codex";
import "./cursor";
import "./gemini";

const cursorStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "auto", label: "Auto" },
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
    ],
    efforts: [] as string[],
    modelEfforts: {} as Record<string, string[]>,
  },
} as AgentStatus;

describe("readConflictResolverSettingsForProject", () => {
  const settings = {
    conflictResolverProvider: "cursor",
    conflictResolverModel: "composer-2.5",
    conflictResolverEffort: "",
    conflictResolverFast: false,
    conflictResolverPresentationMode: "terminal" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: "gui" as const,
  };

  it("uses Windows settings for native projects", () => {
    expect(readConflictResolverSettingsForProject("windows", settings)).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      effort: "",
      fast: false,
      presentationMode: "terminal",
      // No canonical tuple exists, so the scalar siblings convert to the
      // unstamped exact tuple.
      selectionSource: "legacy",
      selection: { model: "composer-2.5", effort: "", fast: false },
    });
  });

  it("falls back to Windows settings for WSL projects when WSL conflict resolver is unset", () => {
    expect(readConflictResolverSettingsForProject("wsl", settings)).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      effort: "",
      fast: false,
      presentationMode: "terminal",
      selectionSource: "legacy",
      selection: { model: "composer-2.5", effort: "", fast: false },
    });
  });

  it("uses WSL settings when WSL conflict resolver is configured", () => {
    expect(
      readConflictResolverSettingsForProject("wsl", {
        ...settings,
        wslConflictResolverProvider: "cursor",
        wslConflictResolverModel: "composer-2.5-fast",
        wslConflictResolverPresentationMode: "terminal",
      }),
    ).toEqual({
      provider: "cursor",
      model: "composer-2.5-fast",
      effort: "",
      fast: false,
      presentationMode: "terminal",
      selectionSource: "legacy",
      selection: { model: "composer-2.5-fast", effort: "", fast: false },
    });
  });

  it("a present canonical tuple is the sole complete preset, record and extras intact", () => {
    const binding = {
      version: 1 as const,
      kind: "family-member" as const,
      owner: { agentKind: "claude", presentationMode: "gui" as const },
      model: "sonnet",
      inertValues: { effort: "medium" },
    };
    const canonical = {
      ...settings,
      conflictResolverModel: "stale-scalar-model",
      conflictResolverSelection: {
        model: "sonnet",
        effort: "medium",
        fast: true,
        thinking: false,
        selectionBinding: binding,
      },
    };
    expect(readConflictResolverSettingsForProject("windows", canonical)).toEqual({
      provider: "cursor",
      // The scalar view derives from the tuple, never from stale siblings.
      model: "sonnet",
      effort: "medium",
      fast: true,
      presentationMode: "terminal",
      selectionSource: "canonical",
      selection: {
        model: "sonnet",
        effort: "medium",
        fast: true,
        thinking: false,
        selectionBinding: binding,
      },
    });
  });

  it("a present WSL tuple makes the WSL variant count as configured", () => {
    const result = readConflictResolverSettingsForProject("wsl", {
      ...settings,
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverSelection: { model: "sonnet", effort: "low", fast: false },
    });
    expect(result.selectionSource).toBe("canonical");
    expect(result.selection).toEqual({ model: "sonnet", effort: "low", fast: false });
    expect(result.model).toBe("sonnet");
  });

  it("an invalid canonical tuple falls back to the scalar siblings", () => {
    const result = readConflictResolverSettingsForProject("windows", {
      ...settings,
      conflictResolverSelection: { model: "sonnet", effort: "low", bogus: true } as never,
    });
    expect(result.selection).toEqual({ model: "composer-2.5", effort: "", fast: false });
    expect(result.model).toBe("composer-2.5");
  });
});

describe("resolveConflictResolverLaunchConfig", () => {
  it("keeps an explicit Custom model even when the live probe omits it", () => {
    const probeMissingComposer = {
      kind: "cursor",
      label: "Cursor",
      installed: true,
      authState: "authenticated",
      capabilities: {
        models: [{ id: "auto", label: "Auto" }],
        efforts: [] as string[],
        modelEfforts: {} as Record<string, string[]>,
      },
    } as AgentStatus;

    expect(
      resolveConflictResolverLaunchConfig("cursor", probeMissingComposer, "composer-2.5", ""),
    ).toEqual({ model: "composer-2.5", effort: "" });

    expect(resolveConflictResolverConfig(probeMissingComposer, "composer-2.5", "").model).toBe(
      "auto",
    );
  });

  it("uses resolved Auto model in Auto provider mode", () => {
    expect(resolveConflictResolverLaunchConfig("auto", cursorStatus, "", "")).toEqual({
      model: "composer-2.5-fast",
      effort: "",
    });
  });
});

describe("canonical conflict launch projection", () => {
  it.each([
    { model: "exact-not-in-catalog" },
    {
      model: "exact-not-in-catalog",
      effort: "",
      fast: false,
      thinking: true,
      contextSize: "large",
    },
    {
      model: "exact-not-in-catalog",
      effort: "unsupported",
      fast: true,
      thinking: false,
      contextSize: "",
    },
  ])("preserves complete actual fields and drops utility intent: %j", (actual) => {
    const selection = {
      ...actual,
      selectionBinding: {
        version: 1 as const,
        kind: "family-member" as const,
        owner: { agentKind: "fixture:profile", presentationMode: "terminal" as const },
        model: actual.model,
        inertValues: { fast: false },
      },
    };
    expect(resolveConflictResolverLaunchConfig("auto", cursorStatus, selection)).toStrictEqual(
      actual,
    );
    expect(selection.selectionBinding).toBeDefined();
  });
  it("resolves only a genuine implicit model", () => {
    const expectedModel = resolveConflictResolverConfig(cursorStatus, "", "").model;
    expect(resolveConflictResolverLaunchConfig("auto", cursorStatus, { model: "" })).toStrictEqual({
      model: expectedModel,
    });
    expect(
      resolveConflictResolverLaunchConfig("auto", cursorStatus, {
        model: "",
        effort: "",
        fast: false,
      }),
    ).toStrictEqual({ model: expectedModel, effort: "", fast: false });
  });
});
