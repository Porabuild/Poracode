import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentDraftTargets, type ExperimentDraftCandidate } from "./ExperimentDraftTargets";

const candidates: ExperimentDraftCandidate[] = [
  {
    id: "candidate-1",
    agentKind: "claude",
    agentLabel: "Claude Code",
    config: { model: "claude-fable-5", effort: "low" },
    presentationMode: "gui",
    modelLabel: "Fable 5",
  },
  {
    id: "candidate-2",
    agentKind: "factory-droid",
    agentLabel: "Factory Droid",
    config: { model: "glm-5.2-fast", effort: "high", fast: true },
    presentationMode: "gui",
    modelLabel: "GLM-5.2 Fast (Droid Core)",
  },
];

describe("ExperimentDraftTargets", () => {
  it("renders picker labels in the composer dock and exposes compact header actions", () => {
    const onRemove = vi.fn<(id: string) => void>();
    const onCancel = vi.fn<() => void>();
    const onAdd = vi.fn<() => void>();

    const view = render(
      <AppProvider>
        <ExperimentDraftTargets
          candidates={candidates}
          isSubmitting={false}
          isAddDisabled={false}
          onRemove={onRemove}
          onCancel={onCancel}
          onAdd={onAdd}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("region", { name: "Experiment" })).toHaveAttribute(
      "data-placement",
      "composer",
    );
    expect(screen.getByText("Fable 5 · Low")).toBeInTheDocument();
    expect(screen.getByText("Claude Code · Chat")).toBeInTheDocument();
    expect(screen.getByText("GLM-5.2 Fast (Droid Core) · High · Fast")).toBeInTheDocument();
    expect(screen.getByText("Factory Droid · Chat")).toBeInTheDocument();
    expect(screen.queryByText(/claude-fable-5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/glm-5\.2-fast/)).not.toBeInTheDocument();
    expect(view.container.querySelectorAll(".poracode-subagent-dock-row")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Add candidate" }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove candidate 1" }));
    expect(onRemove).toHaveBeenCalledWith("candidate-1");
  });

  it("keeps the empty experiment header compact", () => {
    render(
      <AppProvider>
        <ExperimentDraftTargets
          candidates={[]}
          isSubmitting={false}
          isAddDisabled={false}
          onRemove={() => undefined}
          onCancel={() => undefined}
          onAdd={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("region", { name: "Experiment" }).querySelector("ul")).toBeNull();
  });
});
