import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteRuntimeGapDescriptor, RemoteRuntimeHistoryNotice } from "@/shared/remote";
import {
  __resetThreadHistoryNoticeStoreForTest,
  noteThreadHistoryRecoveryNeeded,
  recordThreadHistoryGapRead,
  recordThreadHistoryNoticeRead,
} from "@/renderer/state/remote/historyNoticeStore";
import { useThreadHistoryNoticeDockStore } from "@/renderer/state/threadHistoryNoticeDockStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadHistoryNoticeDock, useVisibleThreadHistoryNotice } from "./ThreadHistoryNoticeDock";

const THREAD_ID = "thread-1";
const AUTHORITY = "connection-1";

function notice(overrides: Partial<RemoteRuntimeHistoryNotice> = {}): RemoteRuntimeHistoryNotice {
  return {
    kind: "history-incomplete",
    source: "exact",
    reason: "thread-events",
    refusedEvents: 21,
    refusedBytes: 1401655,
    acknowledgedCount: 1,
    firstAcknowledgedAt: 1,
    lastAcknowledgedAt: 2,
    ...overrides,
  };
}

function gap(): RemoteRuntimeGapDescriptor {
  return {
    token: "gap2:e11111111-1111-1111-1111-111111111111",
    source: "exact",
    reason: "thread-events",
    refusedEvents: 21,
    refusedBytes: 1401655,
    createdAt: 3,
  };
}

function DockHarness() {
  const entry = useVisibleThreadHistoryNotice(THREAD_ID);
  return entry ? <ThreadHistoryNoticeDock threadId={THREAD_ID} entry={entry} /> : null;
}

afterEach(() => {
  __resetThreadHistoryNoticeStoreForTest();
  useThreadHistoryNoticeDockStore.setState({ dismissedByThreadId: {} });
});

describe("ThreadHistoryNoticeDock", () => {
  it("dismisses an acknowledged notice until a later episode is acknowledged", () => {
    act(() => recordThreadHistoryNoticeRead(THREAD_ID, AUTHORITY, notice()));
    render(<DockHarness />);

    expect(screen.getByRole("status").textContent).toContain("At least 21 events");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss warning" }));
    expect(screen.queryByRole("status")).toBeNull();

    act(() =>
      recordThreadHistoryNoticeRead(
        THREAD_ID,
        AUTHORITY,
        notice({ acknowledgedCount: 2, lastAcknowledgedAt: 5 }),
      ),
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("keeps an open episode visible and not dismissible", () => {
    act(() => {
      recordThreadHistoryNoticeRead(THREAD_ID, AUTHORITY, notice());
      useThreadHistoryNoticeDockStore.getState().dismiss(THREAD_ID, notice());
      recordThreadHistoryGapRead(THREAD_ID, AUTHORITY, gap());
    });
    render(<DockHarness />);

    expect(screen.getByRole("button", { name: "Continue with incomplete history" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss warning" })).toBeNull();
  });

  it("offers no dismissal while recovery still needs review", () => {
    act(() => noteThreadHistoryRecoveryNeeded(THREAD_ID, AUTHORITY));
    render(<DockHarness />);

    expect(screen.getByRole("status").textContent).toContain("may be missing");
    expect(screen.queryByRole("button", { name: "Dismiss warning" })).toBeNull();
  });

  it("hides when the thread has no notice", () => {
    act(() => recordThreadHistoryNoticeRead(THREAD_ID, AUTHORITY, null));
    const { result } = renderHook(() => useVisibleThreadHistoryNotice(THREAD_ID));
    expect(result.current).toBeUndefined();
  });
});
