// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, Thread } from "@/shared/contracts";
import { registerComposerConfigBehavior } from "@/renderer/components/providers/providerComposer";
import { buildControls } from "./buildModelPickerControls";

const RELOADING_KIND = "context-reload-test-provider";
const PLAIN_KIND = "context-plain-test-provider";
registerComposerConfigBehavior(RELOADING_KIND, { contextSizeChangeReloadsSession: true });

const capabilities = {
  models: [{ id: "a", label: "A" }],
  efforts: [],
  modelContextSizes: { a: ["128k", "256k"] },
  contextSizes: [
    { id: "128k", label: "128k" },
    { id: "256k", label: "256k" },
  ],
  defaultContextSize: "128k",
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "direct",
  presentationMode: "gui",
} as unknown as AgentCapability;

function effortContextControl(kind: string, started: boolean) {
  const agent = {
    kind,
    label: "Test",
    installed: true,
    authState: "authenticated",
    capabilities,
  } as AgentStatus;
  const thread = {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: kind,
    config: { model: "a", contextSize: "128k" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...(started ? { sessionRef: { providerSessionId: "provider-session" } } : {}),
  } as Thread;
  const control = buildControls(thread, agent, undefined, vi.fn()).find(
    (candidate) => candidate.kind === "effort-context",
  );
  return control?.kind === "effort-context" ? control : undefined;
}

describe("buildControls context-size reload confirmation", () => {
  it("confirms a context change on a started session when the provider declares it", () => {
    expect(effortContextControl(RELOADING_KIND, true)?.confirmContextChange).toBe(true);
  });

  it("applies silently before the session starts", () => {
    expect(effortContextControl(RELOADING_KIND, false)?.confirmContextChange).toBeUndefined();
  });

  it("applies silently for providers that do not declare the behavior", () => {
    expect(effortContextControl(PLAIN_KIND, true)?.confirmContextChange).toBeUndefined();
  });
});
