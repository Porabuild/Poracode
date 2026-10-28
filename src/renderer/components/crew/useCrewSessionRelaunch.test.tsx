import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability, Thread, ThreadConfig } from "@/shared/contracts";
import type { ThreadCrewBinding } from "@/shared/crew";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";

const unload = vi.hoisted(() =>
  vi.fn<(threadId: string, options: { keepSidePanels: true }) => Promise<void>>(),
);
vi.mock("@/renderer/actions/threadActions", () => ({ unloadStoredThread: unload }));

import { useCrewSessionRelaunch } from "./useCrewSessionRelaunch";

const binding: ThreadCrewBinding = {
  version: 1,
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "claude", model: "opus-5.5" },
    },
  ],
};
const thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "codex",
  title: "Crew smoke",
  config: { model: "gpt-5.5", crew: binding },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-10-01T00:00:00.000Z" },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as unknown as Thread;
const capabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  mcpScope: { gui: "launch", terminal: "none" },
  settingDefs: [],
} as unknown as AgentCapability;
const launchConfig: ThreadConfig = { model: "gpt-5.5" };

describe("useCrewSessionRelaunch", () => {
  afterEach(() => unload.mockClear());

  it("unloads once per thread and Crew fingerprint only when all safety gates are clear", async () => {
    const { rerender } = renderHook((input) => useCrewSessionRelaunch(input), {
      initialProps: {
        thread,
        capabilities,
        runtimeLaunchConfig: launchConfig,
        pendingSteer: null,
        queuedFollowUp: null,
        openRuntimeRequest: false,
        activeSubAgent: false,
      },
      wrapper: I18nTestWrapper,
    });
    await waitFor(() => expect(unload).toHaveBeenCalledWith("thread-1", { keepSidePanels: true }));
    rerender({
      thread,
      capabilities,
      runtimeLaunchConfig: launchConfig,
      pendingSteer: null,
      queuedFollowUp: null,
      openRuntimeRequest: false,
      activeSubAgent: false,
    });
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it("shows the new-session note only when the relaunch condition otherwise holds", () => {
    const noSession = { ...thread, sessionRef: undefined } as unknown as Thread;
    const { result } = renderHook(
      () =>
        useCrewSessionRelaunch({
          thread: noSession,
          capabilities,
          runtimeLaunchConfig: launchConfig,
          pendingSteer: null,
          queuedFollowUp: null,
          openRuntimeRequest: false,
          activeSubAgent: false,
        }),
      { wrapper: I18nTestWrapper },
    );
    expect(result.current).toBe("Helpers join when this chat restarts.");
    expect(unload).not.toHaveBeenCalled();
  });

  it("does not show the note when the live config already has Crossagents", () => {
    const noSession = { ...thread, sessionRef: undefined } as unknown as Thread;
    const { result } = renderHook(
      () =>
        useCrewSessionRelaunch({
          thread: noSession,
          capabilities,
          runtimeLaunchConfig: { ...launchConfig, crossagentMcp: true },
          pendingSteer: null,
          queuedFollowUp: null,
          openRuntimeRequest: false,
          activeSubAgent: false,
        }),
      { wrapper: I18nTestWrapper },
    );
    expect(result.current).toBeUndefined();
    expect(unload).not.toHaveBeenCalled();
  });
});
