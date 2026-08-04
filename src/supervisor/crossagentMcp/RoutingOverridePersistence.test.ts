import { describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { RoutingOverridePersistence } from "./RoutingOverridePersistence";

function makePersistence(timeoutMs = 10_000) {
  const events: SupervisorEvent[] = [];
  const invalidateSettings = vi.fn<() => void>();
  const persistence = new RoutingOverridePersistence({
    emit: (event) => events.push(event),
    invalidateSettings,
    timeoutMs,
  });
  return { events, invalidateSettings, persistence };
}

describe("RoutingOverridePersistence", () => {
  it("resolves only after main confirms persistence", async () => {
    const { events, invalidateSettings, persistence } = makePersistence();
    let settled = false;
    const pending = persistence
      .persist({
        action: "set",
        override: {
          tags: ["review"],
          agentKind: "claude",
          updatedAt: 10,
        },
      })
      .finally(() => {
        settled = true;
      });
    const event = events[0];
    expect(event?.type).toBe("crossagent-routing-override-changed");
    expect(settled).toBe(false);
    if (event?.type !== "crossagent-routing-override-changed") {
      throw new Error("Expected routing override event");
    }

    persistence.confirm({ requestId: event.requestId, ok: true });

    await expect(pending).resolves.toBeUndefined();
    expect(invalidateSettings).toHaveBeenCalledOnce();
  });

  it("rejects on timeout but still invalidates for a late confirmation", async () => {
    vi.useFakeTimers();
    try {
      const { events, invalidateSettings, persistence } = makePersistence(50);
      const pending = persistence.persist({ action: "remove", tags: ["review"] });
      const event = events[0];
      if (event?.type !== "crossagent-routing-override-changed") {
        throw new Error("Expected routing override event");
      }

      const handled = pending.catch((error: unknown) => error as Error);
      await vi.advanceTimersByTimeAsync(50);
      const result = await handled;
      expect(result).toBeInstanceOf(Error);
      if (!(result instanceof Error)) throw new Error("Expected persistence timeout");
      expect(result.message).toBe("Timed out while saving the manual routing preference");
      persistence.confirm({ requestId: event.requestId, ok: true });

      expect(invalidateSettings).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects pending changes on dispose", async () => {
    const { persistence } = makePersistence();
    const pending = persistence.persist({ action: "remove", tags: ["review"] });

    persistence.dispose();

    await expect(pending).rejects.toThrow(
      "Supervisor exited before saving the manual routing preference",
    );
  });
});
