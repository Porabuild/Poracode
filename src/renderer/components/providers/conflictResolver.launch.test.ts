import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import {
  readConflictResolverSettingsForProject,
  resolveConflictResolverLaunchConfig,
} from "./conflictResolver";
import { resolveConflictResolverConfig } from "./ProviderIcon";
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
    conflictResolverPresentationMode: "terminal" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverPresentationMode: "gui" as const,
  };

  it("uses Windows settings for native projects", () => {
    expect(readConflictResolverSettingsForProject("windows", settings)).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      effort: "",
      presentationMode: "terminal",
    });
  });

  it("falls back to Windows settings for WSL projects when WSL conflict resolver is unset", () => {
    expect(readConflictResolverSettingsForProject("wsl", settings)).toEqual({
      provider: "cursor",
      model: "composer-2.5",
      effort: "",
      presentationMode: "terminal",
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
      presentationMode: "terminal",
    });
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
      model: "composer-2.5",
      effort: "",
    });
  });
});
