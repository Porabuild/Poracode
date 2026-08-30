// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { sanitizeProductAnalyticsProperties } from "@/shared/analytics/posthogPrivacy";

const analytics = vi.hoisted(() => ({
  captureProductEvent: vi.fn<() => void>(),
}));

vi.mock("./productAnalytics", () => ({
  captureProductEvent: analytics.captureProductEvent,
  configureProductAnalytics: () => true,
  flushProductAnalytics: () => Promise.resolve(),
}));

import {
  appViewDefinition,
  captureThreadPromptSubmitted,
  captureThreadStarted,
  threadProductProperties,
} from "./posthog";
import { promptProductProperties } from "./threadAnalyticsProperties";

describe("posthog product analytics properties", () => {
  beforeEach(() => {
    analytics.captureProductEvent.mockClear();
    useAgentStatusesStore.setState({
      agentStatuses: [
        {
          kind: "codex:private-profile",
          label: "Private Codex profile",
          installed: true,
          authState: "authenticated",
          capabilities: {
            models: [{ id: "private-model-name", label: "Private model" }],
            efforts: ["low", "high"],
            modelEfforts: {},
            fastModels: ["private-model-name"],
            modes: ["agent", "plan"],
            approvalPolicies: [{ id: "on-request", label: "Ask for approval" }],
            sandboxModes: [{ id: "workspace-write", label: "Workspace write" }],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "server",
            presentationMode: "gui",
            settingDefs: [],
          },
        },
        {
          kind: "claude:work",
          label: "Claude",
          installed: true,
          authState: "authenticated",
          capabilities: {
            models: [{ id: "claude-sonnet-5", label: "Sonnet 5" }],
            efforts: [],
            modelEfforts: {},
            modes: ["agent", "plan"],
            approvalPolicies: [{ id: "default", label: "Supervised" }],
            sandboxModes: [],
            supportsResume: true,
            supportsDirectInput: true,
            liveInputMode: "server",
            presentationMode: "gui",
            settingDefs: [],
          },
        },
      ],
      wslAgentStatuses: [],
    });
  });

  it("describes privacy-safe thread configuration and prompt feature usage", () => {
    const properties = threadProductProperties(
      {
        agentKind: "codex:private-profile",
        config: {
          model: "private-model-name",
          approvalPolicy: "on-request",
          browserMcp: true,
          chromeMcp: true,
          computerUse: true,
          crossagentMcp: true,
          effort: "high",
          fast: true,
          mode: "plan",
          sandboxMode: "workspace-write",
          thinking: true,
        },
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "private-session-reference",
          discoveredAt: "2026-07-27T00:00:00.000Z",
        },
        worktreePath: "/private/worktree",
      },
      [
        { kind: "text", content: "private prompt" },
        { kind: "file", path: "/private/file.ts" },
        {
          kind: "skill",
          name: "private-skill",
          path: "/private/skill",
          invocation: "/private-skill",
          provider: "private-provider",
          scope: "global",
        },
        { kind: "mcp", id: "private-server", name: "Private server" },
      ],
    );
    expect(properties).toEqual({
      attachment_segment_count: 0,
      browser_mcp: true,
      chrome_mcp: true,
      computer_use: true,
      crossagent_mcp: true,
      effort: "high",
      fast_mode: "on",
      file_segment_count: 1,
      has_session_ref: true,
      has_worktree: true,
      mcp_segment_count: 1,
      model: "other",
      model_family: "other",
      permission_level: "ask_for_approval",
      presentation: "gui",
      provider: "codex",
      runtime_kind: "structured",
      segment_count: 4,
      skill_segment_count: 1,
      text_segment_count: 1,
      thread_segment_count: 0,
      work_mode: "plan",
    });
    expect(sanitizeProductAnalyticsProperties(properties)).toEqual(properties);
  });

  it("distinguishes new launches and privacy-safe prompt submissions", () => {
    const thread = {
      agentKind: "claude:work",
      config: { model: "claude-sonnet-5" },
      presentationMode: "gui" as const,
    };

    captureThreadStarted(thread);
    captureThreadPromptSubmitted(thread, "/review this", undefined, "command_palette");
    captureThreadStarted({
      ...thread,
      sessionRef: {
        providerSessionId: "private-session-reference",
        discoveredAt: "2026-07-27T00:00:00.000Z",
      },
    });

    expect(analytics.captureProductEvent).toHaveBeenNthCalledWith(
      1,
      "thread.started",
      expect.objectContaining({
        launch_kind: "new",
        model: "claude-sonnet-5",
        model_family: "claude",
        provider: "claude",
      }),
    );
    expect(analytics.captureProductEvent).toHaveBeenNthCalledWith(
      2,
      "thread.input_submitted",
      expect.objectContaining({
        prompt_kind: "command",
        prompt_length_bucket: "1_50",
        source: "command_palette",
      }),
    );
    expect(analytics.captureProductEvent).toHaveBeenNthCalledWith(
      3,
      "thread.started",
      expect.objectContaining({ launch_kind: "resumed" }),
    );
  });

  it("uses private entity IDs only as local view fingerprints", () => {
    const first = appViewDefinition({ kind: "thread", panes: ["thread-private-a"] });
    const second = appViewDefinition({ kind: "thread", panes: ["thread-private-b"] });
    const reordered = appViewDefinition({
      kind: "thread",
      panes: ["thread-private-b", "thread-private-a"],
    });
    const reorderedAgain = appViewDefinition({
      kind: "thread",
      panes: ["thread-private-a", "thread-private-b"],
    });

    expect(first.key).not.toBe(second.key);
    expect(reordered.key).toBe(reorderedAgain.key);
    expect(first.properties).toEqual({ pane_count: 1, view_kind: "thread" });
    expect(JSON.stringify(first.properties)).not.toContain("thread-private");
  });

  it("classifies prompts from canonical segments without counting paths", () => {
    expect(
      promptProductProperties(
        "@/private/repository/file.ts",
        [{ kind: "file", path: "/private/repository/file.ts" }],
        "follow_up",
      ),
    ).toEqual({
      prompt_kind: "file",
      prompt_length_bucket: "0",
    });
    expect(
      promptProductProperties(
        "$review-code explain this",
        [
          {
            kind: "skill",
            name: "review-code",
            path: "/private/skill",
            invocation: "$review-code",
            provider: "codex",
            scope: "global",
          },
          { kind: "text", content: " explain this" },
        ],
        "follow_up",
      ),
    ).toEqual({
      prompt_kind: "mixed",
      prompt_length_bucket: "1_50",
    });
  });
});
