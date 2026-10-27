import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { AnchoredEndSpaceConfig, LegendListRef } from "@legendapp/list/react";
import { useAppStore } from "@/renderer/state/appStore";
import type { ChatTimelineEntry } from "../chatPaneSelectors";

const PROMPT_SCROLL_DURATION_MS = 180;
const PROMPT_TOP_OFFSET_PX = 0;

export function useNewPromptScroll({
  threadId,
  entries,
  listRef,
  onNewPrompt,
  onScrollWrite,
}: {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  listRef: RefObject<LegendListRef | null>;
  onNewPrompt: (() => void) | undefined;
  onScrollWrite: ((top: number) => void) | undefined;
}) {
  const request = useAppStore((state) => state.chatScrollToPromptRequests[threadId]);
  const bottomToken = useAppStore((state) => state.chatScrollToBottomTokens[threadId] ?? 0);
  const anchorId = useAppStore((state) => state.chatPromptAnchorIds[threadId] ?? null);
  const latestPromptId = useAppStore((state) => {
    const items = state.runtimeItemsByIdByThread[threadId];
    return (
      entries.findLast(
        (entry) =>
          entry.kind === "item" &&
          items?.[entry.id]?.type === "user_message" &&
          !items[entry.id]?.parentItemId,
      )?.id ?? null
    );
  });
  const seenRequest = useRef(request);
  const seenBottomToken = useRef(bottomToken);
  const pendingRequest = useRef(request);
  const pendingAnimation = useRef<string | null>(anchorId);
  const restoringAnchor = useRef(anchorId !== null);
  const animationFrame = useRef<number | null>(null);
  const anchorIndex = entries.findIndex((entry) => entry.id === anchorId);

  const cancelAnimation = useCallback(() => {
    pendingRequest.current = undefined;
    pendingAnimation.current = null;
    restoringAnchor.current = false;
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
  }, []);

  useLayoutEffect(() => {
    if (bottomToken !== seenBottomToken.current) {
      seenBottomToken.current = bottomToken;
      pendingRequest.current = undefined;
      cancelAnimation();
    }
    if (request !== seenRequest.current) {
      seenRequest.current = request;
      cancelAnimation();
      pendingRequest.current = request;
    }
    if (
      !pendingRequest.current ||
      !latestPromptId ||
      latestPromptId === pendingRequest.current.afterItemId
    )
      return;
    pendingRequest.current = undefined;
    pendingAnimation.current = latestPromptId;
    const nextRequest =
      request && request.remaining > 1
        ? { afterItemId: latestPromptId, remaining: request.remaining - 1 }
        : undefined;
    seenRequest.current = nextRequest;
    pendingRequest.current = nextRequest;
    useAppStore.setState((state) => {
      if (state.chatScrollToPromptRequests[threadId] !== request) return {};
      const requests = { ...state.chatScrollToPromptRequests };
      if (nextRequest) requests[threadId] = nextRequest;
      else delete requests[threadId];
      return {
        chatScrollToPromptRequests: requests,
        chatPromptAnchorIds: { ...state.chatPromptAnchorIds, [threadId]: latestPromptId },
      };
    });
    onNewPrompt?.();
  }, [request, bottomToken, latestPromptId, onNewPrompt, cancelAnimation, threadId]);

  useLayoutEffect(() => cancelAnimation, [cancelAnimation]);

  useLayoutEffect(() => {
    if (anchorIndex >= 0) return;
    if (anchorId === null && animationFrame.current !== null) cancelAnimation();
    const element = listRef.current?.getScrollableNode();
    if (element) delete element.dataset.chatEndSpaceSize;
  }, [anchorId, anchorIndex, cancelAnimation, listRef]);

  const anchoredEndSpace: AnchoredEndSpaceConfig | undefined =
    anchorIndex < 0
      ? undefined
      : {
          anchorIndex,
          anchorOffset: PROMPT_TOP_OFFSET_PX,
          onSizeChanged: (size) => {
            const element = listRef.current?.getScrollableNode();
            if (element) element.dataset.chatEndSpaceSize = String(size);
          },
          onReady: ({ anchorKey, size }) => {
            if (!anchorKey || pendingAnimation.current !== anchorKey) return;
            pendingAnimation.current = null;
            if (restoringAnchor.current && size <= 0) {
              // The reply filled its space while the pane was away; show its tail.
              restoringAnchor.current = false;
              useAppStore.getState().clearChatPromptAnchor(threadId);
              return;
            }
            const element = listRef.current?.getScrollableNode();
            if (!element) return;
            onNewPrompt?.();
            const from = element.scrollTop;
            const reducedMotion =
              restoringAnchor.current ||
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            restoringAnchor.current = false;
            let startedAt: number | undefined;
            const step = (now: number) => {
              if (startedAt === undefined) onNewPrompt?.();
              startedAt ??= now;
              const progress = reducedMotion
                ? 1
                : Math.min(1, (now - startedAt) / PROMPT_SCROLL_DURATION_MS);
              const target = Math.max(
                0,
                (listRef.current?.getState().positionByKey(anchorKey) ?? 0) - PROMPT_TOP_OFFSET_PX,
              );
              const top = from + (target - from) * (1 - (1 - progress) ** 3);
              onScrollWrite?.(top);
              element.scrollTop = top;
              animationFrame.current = progress < 1 ? requestAnimationFrame(step) : null;
            };
            // The ready signal precedes the trailing-space DOM commit.
            animationFrame.current = requestAnimationFrame(step);
          },
        };

  return {
    anchoredEndSpace,
    anchorKey: anchorIndex >= 0 ? anchorId : null,
    newPromptReady:
      request !== undefined && latestPromptId !== null && latestPromptId !== request.afterItemId,
    cancelAnimation: () => {
      cancelAnimation();
      useAppStore.setState((state) => {
        if (!state.chatScrollToPromptRequests[threadId]) return state;
        const requests = { ...state.chatScrollToPromptRequests };
        delete requests[threadId];
        return { chatScrollToPromptRequests: requests };
      });
    },
  };
}
