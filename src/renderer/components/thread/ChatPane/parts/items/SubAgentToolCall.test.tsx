import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { msg } from "@/shared/messages";
import { SubAgentToolCall } from "./SubAgentToolCall";

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
