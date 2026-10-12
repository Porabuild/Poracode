import { expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { carryActiveTurnTiming } from "./activeTurnTiming";

const resident: Thread = {
  id: "thread",
  projectId: "project",
  title: "Startup",
  agentKind: "test-agent",
  config: { model: "auto" },
  status: "working",
  attention: "working",
  presentationMode: "gui",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-10-12T08:00:00Z",
  updatedAt: "2026-10-12T08:00:00Z",
  activeTurnStartedAt: "2026-10-12T08:00:00Z",
};

it("keeps one timer through host admission and provider initialization", () => {
  const admitted = carryActiveTurnTiming(resident, {
    ...resident,
    status: "launching",
    activeTurnStartedAt: "2026-10-12T08:00:07Z",
  });
  expect(admitted.status).toBe("launching");
  expect(admitted.activeTurnStartedAt).toBe(resident.activeTurnStartedAt);
  const initialized = carryActiveTurnTiming(admitted, {
    ...admitted,
    status: "working",
    activeTurnStartedAt: "2026-10-12T08:00:07Z",
    sessionRef: { providerSessionId: "session", discoveredAt: "2026-10-12T08:00:17Z" },
  });
  expect(initialized.activeTurnStartedAt).toBe(resident.activeTurnStartedAt);
});

it("accepts authoritative completion, a later turn, provider change and session replacement", () => {
  const live = {
    ...resident,
    sessionRef: { providerSessionId: "session", discoveredAt: resident.createdAt },
  };
  for (const override of [
    { status: "idle" as const },
    { lastTurnEndedAt: "2026-10-12T08:00:04Z" },
    { agentKind: "other-agent" },
    { sessionRef: { providerSessionId: "replacement", discoveredAt: resident.createdAt } },
  ]) {
    const incoming = { ...live, activeTurnStartedAt: "2026-10-12T08:00:07Z", ...override };
    expect(carryActiveTurnTiming(live, incoming)).toBe(incoming);
  }
});
