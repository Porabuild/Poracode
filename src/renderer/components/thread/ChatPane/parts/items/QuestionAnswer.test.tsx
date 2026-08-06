import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
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

    const { container } = render(
      <QuestionAnswer
        item={item}
        checkpointRevert={{ itemId: "qa-1", onRequestRevert: () => {} }}
      />,
    );

    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Allow this command?")).toBeInTheDocument();
    expect(screen.getByText("Allow once")).toBeInTheDocument();
    expect(screen.getByText("Only for this run")).toBeInTheDocument();
    expect(container).toHaveTextContent("Use README.md instead.");
    const revertButton = screen.getByRole("button", { name: "Revert to this checkpoint" });
    expect(revertButton).toBeInTheDocument();
    expect(revertButton.closest(".poracode-message-action-strip")).not.toBeNull();
  });

  it("renders the question only once when the header repeats it (Kimi ACP shape)", () => {
    const item: RuntimeChatItem = {
      id: "qa-1",
      type: "question_answer",
      state: "completed",
      payload: {
        questions: [
          {
            header: "Which scope should be implemented?",
            question: "Which scope should be implemented?",
            selected: [{ label: "Focused" }],
          },
        ],
      },
      streams: {},
    };

    render(<QuestionAnswer item={item} checkpointRevert={null} />);

    expect(screen.getAllByText("Which scope should be implemented?")).toHaveLength(1);
  });

  it("renders nothing when the payload has no questions", () => {
    const item: RuntimeChatItem = {
      id: "qa-1",
      type: "question_answer",
      state: "completed",
      payload: { questions: [] },
      streams: {},
    };

    const { container } = render(<QuestionAnswer item={item} checkpointRevert={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
