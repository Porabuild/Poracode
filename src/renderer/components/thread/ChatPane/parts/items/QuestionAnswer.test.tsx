import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { QuestionAnswer } from "./QuestionAnswer";

describe("QuestionAnswer", () => {
  it("renders selected options, descriptions, custom answers, and checkpoint controls", async () => {
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
        checkpointRevert={{ itemId: "qa-1", onRequestRevert: () => {} }}
      />,
    );

    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Allow this command?")).toBeInTheDocument();
    expect(screen.getByText("Allow once")).toBeInTheDocument();
    expect(screen.getByText("Only for this run")).toBeInTheDocument();
    expect(await screen.findByText("Use README.md instead.")).toBeInTheDocument();
    const revertButton = screen.getByRole("button", { name: "Revert to this checkpoint" });
    expect(revertButton).toBeInTheDocument();
    expect(revertButton.closest(".poracode-message-action-strip")).not.toBeNull();
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
