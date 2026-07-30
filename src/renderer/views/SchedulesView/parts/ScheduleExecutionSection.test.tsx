// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { newScheduleDraft, type ScheduleDraft } from "../scheduleDraft";
import { ScheduleExecutionSection } from "./ScheduleExecutionSection";

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: HOME_PROJECT_ID,
    title: "Release preparation",
    agentKind: "claude:home",
    config: { model: "claude-fable-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
    ...overrides,
  };
}

function draft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return {
    ...newScheduleDraft(undefined),
    agentKind: "claude:home",
    ...overrides,
  };
}

describe("ScheduleExecutionSection", () => {
  it("shows common single-pass guardrails without heartbeat-only completion controls", () => {
    render(
      <ScheduleExecutionSection draft={draft()} threads={[thread()]} onChange={() => undefined} />,
    );

    expect(screen.getByLabelText("Execution mode")).toBeInTheDocument();
    expect(screen.getByLabelText("Time limit in minutes")).toBeInTheDocument();
    expect(screen.getByLabelText("Missed runs")).toBeInTheDocument();
    expect(screen.getByLabelText("Retry policy")).toBeInTheDocument();
    expect(screen.queryByLabelText("Conversation")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Maximum iterations")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop on error")).toBeInTheDocument();
    expect(screen.queryByLabelText("AI stop condition")).not.toBeInTheDocument();
  });

  it("shows the scoped conversation and every configured heartbeat policy", () => {
    render(
      <ScheduleExecutionSection
        draft={draft({
          automationMode: "heartbeat",
          heartbeatTargetThreadId: "thread-1",
          retryKind: "exponential",
          completionKind: "ai-evaluated",
          stopWhen: "The release is ready.",
        })}
        threads={[
          thread(),
          thread({ id: "terminal", title: "Terminal thread", presentationMode: "terminal" }),
          thread({ id: "other-project", title: "Other project", projectId: "project-2" }),
          thread({ id: "other-agent", title: "Other agent", agentKind: "codex" }),
        ]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Conversation")).toHaveTextContent("Release preparation");
    expect(screen.getByLabelText("Maximum attempts")).toBeInTheDocument();
    expect(screen.getByLabelText("Initial retry delay in seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum retry delay in seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum iterations")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop on error")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop when")).toHaveValue("The release is ready.");
    expect(screen.getByLabelText("Confidence percent")).toBeInTheDocument();
  });

  it("selects the newest eligible conversation when heartbeat is enabled", async () => {
    const onChange = vi.fn<(patch: Partial<ScheduleDraft>) => void>();
    render(
      <ScheduleExecutionSection
        draft={draft({ heartbeatTargetThreadId: "stale-thread" })}
        threads={[
          thread({ id: "older", title: "Older", updatedAt: "2026-07-10T09:00:00.000Z" }),
          thread({ id: "newer", title: "Newer", updatedAt: "2026-07-10T10:00:00.000Z" }),
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Execution mode"));
    fireEvent.click(await screen.findByRole("option", { name: "Heartbeat" }));

    expect(onChange).toHaveBeenCalledWith({
      automationMode: "heartbeat",
      heartbeatTargetThreadId: "newer",
    });
  });

  it("explains when no compatible conversation exists", () => {
    render(
      <ScheduleExecutionSection
        draft={draft({ automationMode: "heartbeat" })}
        threads={[thread({ presentationMode: "terminal" })]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("No eligible conversations in this project.")).toBeInTheDocument();
  });
});
