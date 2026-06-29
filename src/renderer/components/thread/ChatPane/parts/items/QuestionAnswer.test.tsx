import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { QuestionAnswer } from "./QuestionAnswer";

describe("QuestionAnswer", () => {
  it("renders selected options, descriptions, custom answers, and checkpoint controls", () => {
    const item: RuntimeChatItem = {
      id: "qa-1",
      type: "question_answer",
      state: "completed",
      payload: {
        questions: [
          {
            header: "Access",
            question: "Allow this command?",
            selected: [{ label: "Allow once", description: "Only for this run" }],
            customAnswer: "Use README.md instead.",
          },
        ],
      },
      streams: {},
    };

    render(
      <QuestionAnswer
        item={item}
        checkpointRevertControl={<button type="button">Revert</button>}
      />,
    );

    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Allow this command?")).toBeInTheDocument();
    expect(screen.getByText("Allow once")).toBeInTheDocument();
    expect(screen.getByText("Only for this run")).toBeInTheDocument();
    expect(screen.getByText("Use README.md instead.")).toBeInTheDocument();
    const revertButton = screen.getByRole("button", { name: "Revert" });
    expect(revertButton).toBeInTheDocument();
    expect(revertButton.closest(".lightcode-message-action-strip")).not.toBeNull();
  });

  it("renders nothing when the payload has no questions", () => {
    const item: RuntimeChatItem = {
      id: "qa-1",
      type: "question_answer",
      state: "completed",
      payload: { questions: [] },
      streams: {},
    };

    const { container } = render(<QuestionAnswer item={item} checkpointRevertControl={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
