import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowResultGroup } from "./WorkflowResultGroup";

function getTopTriggerText(): string {
  // The first `<button>` in the rendered tree is the outer disclosure trigger.
  return screen.getAllByRole("button")[0]?.textContent ?? "";
}

describe("WorkflowResultGroup", () => {
  it("groups a top-level array under a count label and labels rows by dimension", () => {
    const result = JSON.stringify({
      result: {
        dimensionSummaries: [
          { dimension: "add-input", summary: "Add flow is correct; ID collisions are real." },
          {
            dimension: "toggle-complete",
            summary: "Toggling under Active filter makes items vanish.",
          },
          { dimension: "delete", summary: "Date.now() ids can collide on rapid adds." },
        ],
      },
    });
    render(<WorkflowResultGroup resultText={result} />);

    const triggerText = getTopTriggerText();
    expect(triggerText).toContain("Workflow results");
    expect(triggerText).toContain("3 dimensions");
    expect(screen.getAllByText("add-input").length).toBeGreaterThan(0);
    expect(screen.getAllByText("toggle-complete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("delete").length).toBeGreaterThan(0);
  });

  it("falls back to label/title when no domain-specific key is present", () => {
    const result = JSON.stringify([
      { label: "verify:bug-1", summary: "Confirmed" },
      { label: "verify:bug-2", summary: "Refuted" },
    ]);
    render(<WorkflowResultGroup resultText={result} />);
    expect(getTopTriggerText()).toContain("2 labels");
    expect(screen.getAllByText("verify:bug-1").length).toBeGreaterThan(0);
  });

  it("uses generic '2 results' when no labeled fields are present", () => {
    const result = JSON.stringify([{ foo: 1 }, { foo: 2 }]);
    render(<WorkflowResultGroup resultText={result} />);
    expect(getTopTriggerText()).toContain("2 results");
  });

  it("renders plain text in a message surface without a group disclosure", () => {
    const { container } = render(
      <WorkflowResultGroup resultText="Workflow launched in background. Task ID: wikw7toud" />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Workflow launched in background/)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("rounded-3xl", "px-3", "py-2");
  });

  it("renders nothing for a tool_use_error block — error is surfaced via tooltip on the row icon", () => {
    const { container } = render(
      <WorkflowResultGroup
        resultText={
          "<tool_use_error>workflow scripts must be deterministic: Date.now()/Math.random()/new Date() are unavailable (breaks resume).</tool_use_error>"
        }
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a parsed JSON object without a list as a formatted code block", () => {
    render(<WorkflowResultGroup resultText='{"status":"running","tokens":12}' />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/"status": "running"/)).toBeInTheDocument();
  });

  it("renders nothing when given empty input", () => {
    const { container } = render(<WorkflowResultGroup resultText="   " />);
    expect(container.firstChild).toBeNull();
  });

  it("singularizes the noun when only one item is present", () => {
    const result = JSON.stringify([{ dimension: "x", summary: "y" }]);
    render(<WorkflowResultGroup resultText={result} />);
    expect(getTopTriggerText()).toContain("1 dimension");
    expect(getTopTriggerText()).not.toContain("1 dimensions");
  });

  it("picks the first qualifying object array even when other keys are scalars", () => {
    const result = JSON.stringify({
      meta: { count: 2 },
      stats: 42,
      confirmedBugs: [
        { title: "Bug A", reasoning: "Reproduced under load." },
        { title: "Bug B", reasoning: "Lives on the hot path." },
      ],
    });
    render(<WorkflowResultGroup resultText={result} />);
    expect(getTopTriggerText()).toContain("2 titles");
    expect(screen.getAllByText("Bug A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bug B").length).toBeGreaterThan(0);
  });
});
