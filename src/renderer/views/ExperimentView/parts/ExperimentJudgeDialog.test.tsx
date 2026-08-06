import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const { composerSpy } = vi.hoisted(() => ({
  composerSpy: vi.fn<(controls: ComposerControl[]) => void>(),
}));

vi.mock("@/renderer/components/thread/ThreadComposer", () => ({
  ThreadComposer: (props: { controls: ComposerControl[] }) => {
    composerSpy(props.controls);
    return <div data-testid="judge-controls" />;
  },
}));

import {
  ExperimentJudgeDialog,
  resolveExperimentJudgeConfig,
  type ExperimentJudgeConfig,
} from "./ExperimentJudgeDialog";
import { isEligibleExperimentJudgeAgent } from "@/renderer/actions/experimentActions";

function agent(kind: string, models: string[], defaultEffort = "high"): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: models.map((model) => ({ id: model, label: model })),
      efforts: ["low", "high"],
      defaultEffort,
      modelEfforts: {},
      fastModels: models.slice(0, 1),
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: false,
      supportsDirectInput: false,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
      supportsOneShot: true,
    },
  };
}

describe("resolveExperimentJudgeConfig", () => {
  it("excludes one-shot providers that have no selectable models", () => {
    expect(isEligibleExperimentJudgeAgent(agent("copilot", []), [])).toBe(false);
    expect(isEligibleExperimentJudgeAgent(agent("codex", ["gpt-5.5"]), [])).toBe(true);
  });

  it("restores a valid saved judge configuration", () => {
    const result = resolveExperimentJudgeConfig([agent("claude", ["sonnet", "opus"])], {
      agentKind: "claude",
      model: "opus",
      effort: "low",
      fast: false,
      mode: "changes",
    });

    expect(result).toEqual({
      agentKind: "claude",
      model: "opus",
      effort: "low",
      fast: false,
      mode: "changes",
    });
  });

  it("falls back to the first available judge when the saved provider is unavailable", () => {
    const result = resolveExperimentJudgeConfig([agent("codex", ["gpt-5.6"])], {
      agentKind: "claude",
      model: "opus",
      effort: "low",
      fast: true,
    });

    expect(result).toEqual({
      agentKind: "codex",
      model: "gpt-5.6",
      effort: "high",
      fast: false,
      mode: "changes",
    });
  });
});

describe("ExperimentJudgeDialog", () => {
  it("renders the shared model, effort, and Fast controls before judging", () => {
    const onConfirm = vi.fn<() => void>();
    const onChange = vi.fn<(config: ExperimentJudgeConfig) => void>();
    render(
      <ExperimentJudgeDialog
        agents={[agent("claude", ["sonnet", "opus"])]}
        config={{
          agentKind: "claude",
          model: "sonnet",
          effort: "high",
          fast: false,
          mode: "changes",
        }}
        onChange={onChange}
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );

    const controls = composerSpy.mock.lastCall?.[0] ?? [];
    expect(controls.some((control) => control.kind === "provider-model")).toBe(true);
    expect(controls.some((control) => control.kind === "effort-context")).toBe(true);
    expect(controls.some((control) => control.kind === "toggle" && control.label === "Fast")).toBe(
      true,
    );
    expect(
      screen.getByText(/compares snapshots of each candidate's changes under anonymous labels/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Chat" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "responses" }));

    fireEvent.click(screen.getByRole("button", { name: "Crown with AI" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
