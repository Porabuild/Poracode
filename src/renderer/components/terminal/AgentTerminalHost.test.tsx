import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";

vi.mock("@/renderer/components/thread/TerminalPane", () => ({
  TerminalPane: (props: { threadId: string; hidden?: boolean }) => (
    <div data-hosted-terminal={props.threadId} data-hidden={props.hidden ? "true" : "false"} />
  ),
}));

vi.mock("@/renderer/components/thread/useRemoteTerminalTransport", () => ({
  useRemoteTerminalTransport: () => undefined,
}));

import { AgentTerminalHost } from "./AgentTerminalHost";

describe("AgentTerminalHost", () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
      keepAlivePaneIds: [],
    }));
  });

  it("mounts hidden keep-alive terminals on Home and drops them when visible", () => {
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/repo" });
    const thread = useAppStore.getState().createThread({
      projectId: project.id,
      agentKind: "codex",
      config: { model: "m" },
      prompt: "hi",
    });
    useAppStore.getState().openHome();

    const { container, rerender } = render(<AgentTerminalHost />);
    expect(container.querySelector(`[data-hosted-terminal='${thread.id}']`)).not.toBeNull();
    expect(container.querySelector("[data-hidden='true']")).not.toBeNull();

    useAppStore.getState().openThread(thread.id);
    rerender(<AgentTerminalHost />);
    expect(container.querySelector(`[data-hosted-terminal='${thread.id}']`)).toBeNull();
  });
});
