// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScheduledTaskRun } from "@/shared/contracts";
import { useScheduleRunDetails } from "./useScheduleRunDetails";

const running: ScheduledTaskRun = {
  id: "run",
  scheduleId: "schedule",
  threadId: "thread",
  startedAt: "2026-10-13T12:00:00.000Z",
  completedAt: null,
  status: "running",
  summary: null,
  error: null,
};
const cancelled: ScheduledTaskRun = {
  ...running,
  status: "cancelled",
  completedAt: "2026-10-13T12:01:00.000Z",
};

describe("selected schedule run ownership", () => {
  it("updates cancelled details after the run disappears from the inbox", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<(id: string) => Promise<ScheduledTaskRun[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValue([cancelled]);
      const h = renderHook(({ inbox }) => useScheduleRunDetails("host", running, inbox, fetch), {
        initialProps: { inbox: running as ScheduledTaskRun | undefined },
      });
      await act(async () => {});
      h.rerender({ inbox: undefined });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(h.result.current.run?.status).toBe("cancelled");
      expect(vi.getTimerCount()).toBe(0);
      h.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["host", "run"])("ignores a late response after changing %s", async (change) => {
    const old = Promise.withResolvers<ScheduledTaskRun[]>();
    const next = {
      ...cancelled,
      id: change === "run" ? "new-run" : running.id,
      summary: "New host result",
    };
    const fetch = vi
      .fn<(id: string) => Promise<ScheduledTaskRun[]>>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue([next]);
    const h = renderHook(
      ({ machine, selected }) => useScheduleRunDetails(machine, selected, undefined, fetch),
      { initialProps: { machine: "first", selected: running } },
    );
    h.rerender({ machine: change === "host" ? "second" : "first", selected: next });
    await waitFor(() => expect(h.result.current.run?.summary).toBe("New host result"));
    await act(async () => {
      old.resolve([{ ...cancelled, summary: "Old host result" }]);
      await old.promise;
    });
    expect(h.result.current.run?.summary).toBe("New host result");
    h.unmount();
  });

  it("shows a detail read failure and clears it after successful polling", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi
        .fn<(id: string) => Promise<ScheduledTaskRun[]>>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue([cancelled]);
      const h = renderHook(() => useScheduleRunDetails("host", running, undefined, fetch));
      await act(async () => {});
      expect(h.result.current.loadError).toBe("offline");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(h.result.current.loadError).toBe("");
      expect(h.result.current.run?.status).toBe("cancelled");
      h.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
