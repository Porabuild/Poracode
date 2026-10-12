import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { EffortContextMenu } from "@/renderer/components/common/EffortContextMenu/EffortContextMenu";
import {
  buildModelPickerControls,
  patchConfigForModelChange,
  type ModelPickerConfigPatch,
} from "@/renderer/components/thread/buildModelPickerControls";
import "./index";

const capabilities: AgentCapability = {
  contextSizeChangeReloadsSession: true,
  contextSizeReloadStopsSubagents: true,
  models: [
    { id: "claude-fable-5-1", label: "Fable 5.1" },
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "haiku", label: "Haiku" },
  ],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  settingDefs: [],
  contextSizes: [
    { id: "1m", label: "1M" },
    { id: "400k", label: "400k" },
    { id: "200k", label: "200k" },
  ],
  modelContextSizes: {
    "claude-fable-5-1": ["1m", "400k"],
    "claude-opus-4-6": ["1m", "400k"],
  },
};

beforeEach(() => {
  (window as unknown as { poracode: unknown }).poracode = { appVersion: "remote" };
  localStorage.clear();
});
afterEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
  localStorage.clear();
});

describe("Claude context picker", () => {
  it("renders 400k and saves it after confirming the existing-session reload", async () => {
    const onConfigPatch = vi.fn<(patch: ModelPickerConfigPatch) => void>();
    const control = buildModelPickerControls({
      providers: [],
      selectedAgentKind: "claude",
      model: "claude-fable-5-1",
      contextSize: "1m",
      capabilities,
      presentationMode: "gui",
      includeFastToggle: false,
      confirmContextChange: capabilities.contextSizeChangeReloadsSession === true,
      contextSizeReloadStopsSubagents: capabilities.contextSizeReloadStopsSubagents === true,
      onProviderModelChange: () => {},
      onConfigPatch,
    }).find((item) => item.kind === "effort-context");
    expect(control?.kind).toBe("effort-context");
    if (control?.kind !== "effort-context") throw new Error("Missing context picker");
    expect(control.contextSizes.map((option) => option.id)).toEqual(["1m", "400k"]);
    renderWithI18n(<EffortContextMenu {...control} />);
    fireEvent.click(screen.getByRole("button", { name: "Effort and context" }));
    expect(screen.getByRole("button", { name: "1M" })).toBeInTheDocument();
    expect(screen.queryByText("200k")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("400k"));
    expect(await screen.findByText("Change context size to 400k?")).toBeInTheDocument();
    expect(
      screen.getByText("Any subagents still running when the session reloads will be stopped."),
    ).toBeInTheDocument();
    expect(onConfigPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onConfigPatch).toHaveBeenCalledWith({ contextSize: "400k" });
  });

  it("keeps 400k across long-context model changes and clears it for Haiku", () => {
    expect(
      patchConfigForModelChange(capabilities, "claude-opus-4-6", { contextSize: "400k" }),
    ).toMatchObject({ contextSize: "400k" });
    expect(
      patchConfigForModelChange(capabilities, "claude-opus-4-6", { contextSize: "200k" }),
    ).toMatchObject({ contextSize: "1m" });
    expect(patchConfigForModelChange(capabilities, "haiku", { contextSize: "400k" })).toMatchObject(
      { contextSize: "" },
    );
  });
});
