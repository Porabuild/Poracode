import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "../../../shared/contracts";

const { composerSpy } = vi.hoisted(() => ({
  composerSpy: vi.fn(),
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    controls: unknown[];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
  }) => {
    composerSpy(props);
    return (
      <div>
        <button type="button" onClick={() => props.onPromptChange("hello world")}>
          set-prompt
        </button>
        <button type="button" onClick={props.onSubmit}>
          submit
        </button>
      </div>
    );
  },
}));

import { ThreadDraftView } from "./ThreadDraftView";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: {
    kind: "windows",
    path: "C:\\repo",
  },
  createdAt: "2026-03-28T00:00:00.000Z",
};

const codexStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "gpt-5.4", label: "5.4" },
      { id: "gpt-5.4-mini", label: "5.4 Mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "on-request", label: "On Request" },
      { id: "never", label: "Full Access" },
      { id: "untrusted", label: "Untrusted" },
    ],
    sandboxModes: [
      { id: "workspace-write", label: "Workspace Write" },
      { id: "read-only", label: "Read Only" },
      { id: "danger-full-access", label: "Full Access" },
    ],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

const geminiStatus: AgentStatus = {
  kind: "gemini",
  label: "Gemini",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "auto", label: "Auto" },
      { id: "gemini-2.5-flash", label: "2.5 Flash" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Default" },
      { id: "auto_edit", label: "Auto Edit" },
      { id: "never", label: "Full Access" },
    ],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

describe("ThreadDraftView", () => {
  beforeEach(() => {
    composerSpy.mockClear();
  });

  it("switches to the first installed agent when statuses resolve after mount", async () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <ThreadDraftView project={project} agentStatuses={[]} onStart={onStart} />,
    );

    expect(screen.getByText("No supported agents detected")).toBeInTheDocument();

    rerender(
      <ThreadDraftView project={project} agentStatuses={[geminiStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as { controls: Array<{ value?: string }> };
      expect(props.controls[0]?.value).toBe("gemini");
      expect(props.controls[1]?.value).toBe("auto");
      expect(props.controls.some((control) => control.value === "default")).toBe(true);
    });
  });

  it("submits codex defaults on first launch", async () => {
    const onStart = vi.fn();

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ value?: string; label?: string; isSelected?: boolean }>;
      };
      expect(props.controls[0]?.value).toBe("codex");
      expect(props.controls[1]?.value).toBe("gpt-5.4");
      expect(props.controls[2]?.value).toBe("high");
      expect(
        props.controls.some(
          (control) => control.label === "Full Access" && control.isSelected === false,
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith({
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "high",
        mode: "agent",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
      },
      prompt: "hello world",
    });
  });
});
