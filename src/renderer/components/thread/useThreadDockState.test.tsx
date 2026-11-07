import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { I18nTestWrapper } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useThreadDockState } from "./useThreadDockState";

const THREAD_ID = "thread-status-error";
const ENDED_AT = "2026-05-02T09:00:00.000Z";

function seedThread(overrides: Partial<Thread> = {}, items?: RuntimeChatItem[]) {
  const thread = {
    id: THREAD_ID,
    status: "error",
    errorMessage: "Agent process failed.",
    lastTurnEndedAt: ENDED_AT,
    ...overrides,
  } as Thread;
  const itemIds = items?.map((item) => item.id);
  const itemsById = items ? Object.fromEntries(items.map((item) => [item.id, item])) : undefined;

  useAppStore.setState((state) => ({
    ...state,
    threads: [thread],
    runtimeItemIdsByThread: itemIds ? { [THREAD_ID]: itemIds } : {},
    runtimeItemsByIdByThread: itemsById ? { [THREAD_ID]: itemsById } : {},
  }));
}

describe("useThreadDockState status error fallback", () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
    }));
  });

  it("uses the persisted runtime error reason when no error item survives", () => {
    seedThread({ errorMessage: "ACP connection closed unexpectedly." });
    const { result } = renderHook(() => useThreadDockState(THREAD_ID), {
      wrapper: I18nTestWrapper,
    });

    expect(result.current.errorDockStates).toEqual([
      {
        sourceItemId: `thread-status-error:${ENDED_AT}`,
        message: "ACP connection closed unexpectedly.",
      },
    ]);
  });

  it("uses localized generic text when the runtime error reason is absent", () => {
    seedThread({ errorMessage: undefined });
    const { result } = renderHook(() => useThreadDockState(THREAD_ID), {
      wrapper: I18nTestWrapper,
    });

    expect(result.current.errorDockStates).toEqual([
      {
        sourceItemId: `thread-status-error:${ENDED_AT}`,
        message: "The agent stopped because of an error.",
      },
    ]);
  });

  it("prefers a runtime error item after the latest user message", () => {
    seedThread({}, [
      {
        id: "user-last",
        type: "user_message",
        state: "completed",
        payload: {},
        streams: {},
      },
      {
        id: "error-after-user",
        type: "error",
        state: "completed",
        payload: { message: "Transient item error." },
        streams: {},
      },
    ]);
    const { result } = renderHook(() => useThreadDockState(THREAD_ID), {
      wrapper: I18nTestWrapper,
    });

    expect(result.current.errorDockStates).toEqual([
      { sourceItemId: "error-after-user", message: "Transient item error." },
    ]);
  });

  it("dismisses a fallback until the next turn ends", () => {
    seedThread();
    const { result } = renderHook(() => useThreadDockState(THREAD_ID), {
      wrapper: I18nTestWrapper,
    });

    act(() => result.current.onDismissError(`thread-status-error:${ENDED_AT}`));
    expect(result.current.errorDockStates).toEqual([]);

    act(() => {
      const thread = useAppStore.getState().threads[0]!;
      useAppStore.setState({
        threads: [{ ...thread, lastTurnEndedAt: "2026-05-02T10:00:00.000Z" }],
      });
    });
    expect(result.current.errorDockStates).toEqual([
      {
        sourceItemId: "thread-status-error:2026-05-02T10:00:00.000Z",
        message: "Agent process failed.",
      },
    ]);
  });

  it("does not show a status fallback while the thread is not in error", () => {
    seedThread({ status: "working" });
    const { result } = renderHook(() => useThreadDockState(THREAD_ID), {
      wrapper: I18nTestWrapper,
    });

    expect(result.current.errorDockStates).toEqual([]);
  });
});
