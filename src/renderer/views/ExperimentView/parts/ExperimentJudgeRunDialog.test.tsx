import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentJudgeRunDialog } from "./ExperimentJudgeRunDialog";

describe("ExperimentJudgeRunDialog", () => {
  it("shows complete scrollable winner results without reveal animations", () => {
    const { container } = render(
      <ExperimentJudgeRunDialog
        run={{
          stage: "won",
          winner: {
            label: "Candidate A",
            details: "Codex",
            solutionLabel: "Solution 1",
            rationale: "A".repeat(320),
            assessments: [],
          },
        }}
        onCancel={() => undefined}
        onClose={() => undefined}
      />,
    );

    const body = screen.getByText("We have a winner!").closest(".modal__body");
    expect(body).toHaveClass("overflow-y-auto");
    expect(body).not.toHaveClass("overflow-hidden");
    expect(screen.getByText("A".repeat(320))).toBeInTheDocument();
    expect(container.querySelector('[class*="poracode-winner-"]')).toBeNull();
  });
});
