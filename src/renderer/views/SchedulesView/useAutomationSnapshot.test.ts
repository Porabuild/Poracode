// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AutomationsSnapshot,
  ScheduleRunInboxQuery,
  ScheduledTaskRun,
} from "@/shared/contracts";
import { useAutomationSnapshot } from "./useAutomationSnapshot";

const empty: AutomationsSnapshot = { schedules: [], runs: [], unreadCount: 0 };
const run: ScheduledTaskRun = {
  id: "run",
  scheduleId: "schedule",
  threadId: "thread",
  startedAt: "2026-10-13T12:00:00.000Z",
  completedAt: null,
  status: "running",
  summary: null,
  error: null,
};

describe("automation snapshot ownership", () => {
  it.each([{ filter: "archived" as const }, { filter: "unread" as const, search: "new" }])(
    "clears old-query rows when the next query fails: %s",
    async (nextQuery) => {
      const load = vi
        .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
        .mockResolvedValueOnce({ ...empty, runs: [run], unreadCount: 1 })
        .mockRejectedValue(new Error("offline"));
      const h = renderHook(({ query }) => useAutomationSnapshot("host", query, load), {
        initialProps: { query: { filter: "unread" } as ScheduleRunInboxQuery },
      });
      await waitFor(() => expect(h.result.current.runs).toHaveLength(1));
      h.rerender({ query: nextQuery });
      await waitFor(() => expect(h.result.current.loadError).toBe("offline"));
      expect(h.result.current.runs).toEqual([]);
      expect(h.result.current.unreadCount).toBe(1);
      h.unmount();
    },
  );

  it("retains same-query rows on a transient read failure", async () => {
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockResolvedValueOnce({ ...empty, runs: [run] })
      .mockRejectedValue(new Error("offline"));
    const h = renderHook(() => useAutomationSnapshot("host", { filter: "unread" }, load));
    await waitFor(() => expect(h.result.current.runs).toHaveLength(1));
    await act(async () => {
      await expect(h.result.current.refresh()).rejects.toThrow("offline");
    });
    expect(h.result.current.runs).toEqual([run]);
    h.unmount();
  });

  it("loads older pages through the narrow inbox read", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...run, id: `run-${index}` }));
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockResolvedValue({ ...empty, runs: firstPage, unreadCount: 51 });
    const inbox = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<ScheduledTaskRun[]>>()
      .mockResolvedValue([{ ...run, id: "older" }]);
    const h = renderHook(() => useAutomationSnapshot("host", { filter: "all" }, load, inbox));
    await waitFor(() => expect(h.result.current.runs).toHaveLength(50));
    act(() => h.result.current.loadMore());
    await waitFor(() => expect(h.result.current.runs).toHaveLength(51));
    expect(load).toHaveBeenCalledTimes(2);
    expect(inbox).toHaveBeenCalledWith({
      filter: "all",
      limit: 50,
      cursor: `${run.startedAt}|run-49`,
    });
    expect(h.result.current.unreadCount).toBe(51);
    h.unmount();
  });
  it("ignores an older host response after switching hosts", async () => {
    const old = Promise.withResolvers<AutomationsSnapshot>();
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ ...empty, unreadCount: 7 });
    const h = renderHook(
      ({ machine }) => useAutomationSnapshot(machine, { filter: "unread" }, load),
      { initialProps: { machine: "first" } },
    );
    h.rerender({ machine: "second" });
    await waitFor(() => expect(h.result.current.unreadCount).toBe(7));
    await act(async () => {
      old.resolve({ ...empty, unreadCount: 99 });
      await old.promise;
    });
    expect(h.result.current.unreadCount).toBe(7);
    h.unmount();
  });

  it("clears a previous load error after an authoritative successful refresh", async () => {
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(empty);
    const h = renderHook(() => useAutomationSnapshot("host", { filter: "unread" }, load));
    await waitFor(() => expect(h.result.current.loadError).toBe("offline"));
    await act(async () => {
      await h.result.current.refresh();
    });
    expect(h.result.current.loadError).toBe("");
    expect(h.result.current.loading).toBe(false);
    h.unmount();
  });

  it("uses the current query even when a mutation retained an older refresh callback", async () => {
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockResolvedValue(empty);
    const h = renderHook(
      ({ search }) => useAutomationSnapshot("host", { filter: "all", search }, load),
      { initialProps: { search: "old" } },
    );
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const refreshAfterMutation = h.result.current.refresh;
    h.rerender({ search: "new" });
    await act(async () => {
      await refreshAfterMutation();
    });
    expect(load).toHaveBeenLastCalledWith({ filter: "all", search: "new", limit: 50 });
    expect(h.result.current.loading).toBe(false);
    h.unmount();
  });

  it("does not let a pre-mutation response restore stale schedules or counts", async () => {
    const pending = Promise.withResolvers<AutomationsSnapshot>();
    const load = vi
      .fn<(query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>>()
      .mockReturnValue(pending.promise);
    const h = renderHook(() => useAutomationSnapshot("host", { filter: "unread" }, load));
    act(() => {
      h.result.current.setTasks([]);
    });
    await act(async () => {
      pending.resolve({ ...empty, unreadCount: 42 });
      await pending.promise;
    });
    expect(h.result.current.unreadCount).toBe(0);
    h.unmount();
  });
});
