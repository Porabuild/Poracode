import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentJudgeRunDialog } from "./ExperimentJudgeRunDialog";

describe("ExperimentJudgeRunDialog", () => {
  it("reports response capture progress without file statistics", () => {
    render(
      <ExperimentJudgeRunDialog
        run={{
          stage: "running",
          transcript: [
            { id: 1, kind: "capturing", mode: "responses" },
            {
              id: 2,
              kind: "captured-response",
              label: "Candidate A",
              details: "Codex",
              characters: 1200,
            },
          ],
        }}
        onCancel={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("Reading each candidate's chat response…")).toBeInTheDocument();
    expect(screen.getByText("1,200 characters")).toBeInTheDocument();
  });

  it("warns when some change files are listed without their contents", () => {
    render(
      <ExperimentJudgeRunDialog
        run={{
          stage: "running",
          transcript: [
            { id: 1, kind: "capturing", mode: "changes" },
            {
              id: 2,
              kind: "captured",
              label: "Candidate A",
              details: "Codex",
              files: 283,
              insertions: 400,
              deletions: 20,
              omittedFiles: 83,
            },
          ],
        }}
        onCancel={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(document.querySelector(".text-warning")).toHaveTextContent(
      "83 files listed without contents",
    );
  });

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
