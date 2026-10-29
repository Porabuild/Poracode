import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layout.compact,
}));

import { dynamicActivate } from "@/renderer/i18n/i18n";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { msg } from "@/shared/messages";
import { SubAgentToolCall } from "./SubAgentToolCall";

beforeEach(() => {
  layout.compact = false;
});

afterEach(async () => dynamicActivate("en"));

it("updates a saved host interruption disclosure when the client's locale changes", async () => {
  const source = msg("runtime.delegatedAgentInterrupted");
  const result = { error: source };
  renderWithI18n(
    <SubAgentToolCall
      threadId="saved-interruption"
      item={{
        id: "native",
        type: "tool_call",
        state: "completed",
        streams: {},
        payload: { name: "Agent", isSubAgent: true, status: "error", result },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Subagent Result" }));
  expect(screen.getByText(source)).toBeInTheDocument();
  await act(async () => dynamicActivate("ru"));
  const translated = msg("runtime.delegatedAgentInterrupted");
  expect(translated).not.toBe(source);
  expect(screen.getByText(translated)).toBeInTheDocument();
  expect(screen.queryByText(source)).not.toBeInTheDocument();
  expect(result.error).toBe(source);
});

it("shows compact Crossagent tasks and role metadata on separate truncating lines", () => {
  layout.compact = true;
  const { container } = renderWithI18n(
    <SubAgentToolCall
      threadId="compact-crew"
      item={{
        id: "run-1",
        type: "tool_call",
        state: "started",
        streams: {},
        payload: {
          name: "Codex · GPT-5.5 · High",
          title: "Implement authentication",
          status: "running",
          isCrossagent: true,
          subAgentType: "Builder",
          progress: { stepCount: 3 },
        },
      }}
    />,
  );
  const button = screen.getByRole("button", { name: /Open Crossagent: Implement authentication/ });
  const lineOne = button.querySelector(".truncate");
  expect(lineOne).toHaveTextContent("Implement authentication");
  expect(lineOne).toHaveClass("truncate");
  const lineTwo = container.querySelector(".text-\\[11px\\]");
  expect(lineTwo).toHaveTextContent("Builder · Codex · GPT-5.5");
  expect(lineTwo).toHaveClass("truncate");
  expect(container.querySelector(".pl-4")?.children).toHaveLength(2);
});
