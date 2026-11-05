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

it("shows compact crew tasks and role metadata on separate truncating lines", () => {
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
  const button = screen.getByRole("button", { name: /Open Crew run: Implement authentication/ });
  const lineOne = button.querySelector(".truncate");
  expect(lineOne).toHaveTextContent("Implement authentication");
  expect(lineOne).toHaveClass("truncate");
  const lineTwo = container.querySelector(".text-\\[11px\\]");
  expect(lineTwo).toHaveTextContent("Builder · Codex · GPT-5.5");
  expect(lineTwo).toHaveClass("truncate");
  expect(container.querySelector(".pl-4")?.children).toHaveLength(2);
});

it("marks a resumed compact Crossagent as a follow-up", () => {
  layout.compact = true;
  const { container } = renderWithI18n(
    <SubAgentToolCall
      threadId="compact-crew"
      item={{
        id: "run-2",
        type: "tool_call",
        state: "started",
        streams: {},
        payload: {
          name: "OpenCode 2 · DeepSeek V4.1 Flash · Max",
          title: "Fence stale shell pages",
          status: "running",
          isCrossagent: true,
          isSubAgentResume: true,
          subAgentType: "Sidekick",
          progress: { stepCount: 3 },
        },
      }}
    />,
  );
  const lineTwo = container.querySelector(".text-\\[11px\\]");
  expect(lineTwo).toHaveTextContent("Sidekick · follow-up · OpenCode 2 · DeepSeek V4.1 Flash");
});

it("drops the Crossagent Follow-up prefix from a compact task without a title", () => {
  layout.compact = true;
  renderWithI18n(
    <SubAgentToolCall
      threadId="compact-crew"
      item={{
        id: "run-3",
        type: "tool_call",
        state: "started",
        streams: {},
        payload: {
          name: "OpenCode 2 · DeepSeek V4.1 Flash · Max",
          status: "running",
          isCrossagent: true,
          isSubAgentResume: true,
        },
      }}
    />,
  );
  const button = screen.getByRole("button", {
    name: /Open Crossagent: OpenCode 2/,
  });
  expect(button).toHaveTextContent("OpenCode 2 · DeepSeek V4.1 Flash · Max");
  expect(button.textContent).not.toContain("Crossagent");
});

it("labels a crew run's completed result as a Crew Result", () => {
  renderWithI18n(
    <SubAgentToolCall
      threadId="crew-result"
      item={{
        id: "run-4",
        type: "tool_call",
        state: "completed",
        streams: {},
        payload: {
          name: "OpenCode 2 · DeepSeek V4.1 Flash · Max",
          status: "success",
          isCrossagent: true,
          subAgentType: "Sidekick",
          result: "Crew finished.",
        },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Crew Result" })).toBeInTheDocument();
});

it("keeps a non-crew Crossagent result labeled Crossagent Result", () => {
  renderWithI18n(
    <SubAgentToolCall
      threadId="crossagent-result"
      item={{
        id: "run-5",
        type: "tool_call",
        state: "completed",
        streams: {},
        payload: {
          name: "Fence stale shell pages — OpenCode 2 · DeepSeek V4.1 Flash · Max",
          status: "success",
          isCrossagent: true,
          result: "Crossagent finished.",
        },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Crossagent Result" })).toBeInTheDocument();
});
