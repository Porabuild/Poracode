import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import type { RuntimeStreamRetention } from "@/renderer/state/slices/runtimeStreamRetention";
import type { ChatReaderFollowSignal } from "../../chatReaderFollow";
import {
  inspectPlainStream,
  MAX_RICH_TEXT_CHARS,
  type PlainStreamInspection,
} from "./longPlainText";
import {
  earlierAssistantTextPage,
  isCurrentAssistantTextPage,
  latestAssistantTextWindow,
  type DetachedAssistantTextPage,
} from "./assistantTextWindow";

/** Detach a bounded reader page while the owning canonical stream keeps advancing. */
export function useWindowedAssistantText(
  text: string,
  isStreaming: boolean,
  retention?: RuntimeStreamRetention,
  readerFollow?: ChatReaderFollowSignal | null,
) {
  const [plain, setPlain] = useState(
    () => text.length < MAX_RICH_TEXT_CHARS && inspectPlainStream(text, null, isStreaming).plain,
  );
  const previousRef = useRef<PlainStreamInspection | null>(null);
  const [page, setPage] = useState<DetachedAssistantTextPage | null>(null);
  const [readerPage, setReaderPage] = useState<DetachedAssistantTextPage | null>(null);

  useEffect(() => {
    // Large output is already windowed regardless of formatting. Avoid retaining
    // inspection substrings backed by an old multi-megabyte projected string.
    const next =
      text.length < MAX_RICH_TEXT_CHARS
        ? inspectPlainStream(text, previousRef.current, isStreaming)
        : null;
    previousRef.current = next;
    setPlain(next?.plain ?? false);
  }, [text, isStreaming]);

  // Reset during render so a replacement cannot paint the old page for a frame.
  const currentPage = page && isCurrentAssistantTextPage(page, text, retention) ? page : null;
  if (page && !currentPage) setPage(null);
  const currentReaderPage =
    readerPage && isCurrentAssistantTextPage(readerPage, text, retention) ? readerPage : null;
  if (readerPage && !currentReaderPage) setReaderPage(null);

  // Later formatting must not replace an already selected page with live Markdown.
  const isWindowed =
    currentPage !== null ||
    currentReaderPage !== null ||
    plain ||
    text.length >= MAX_RICH_TEXT_CHARS;
  const window = isWindowed
    ? (currentPage ?? currentReaderPage ?? latestAssistantTextWindow(text, retention))
    : null;
  const onFollowingChange = useEffectEvent((following: boolean) => {
    if (following) {
      // Explicit Earlier navigation has its own Back to latest action.
      setReaderPage(null);
    } else if (isStreaming && window && !currentPage) {
      // Effect Events read the last committed body, even if a canonical append
      // is already queued for the next render. Freeze this page, not the prior one.
      setReaderPage(earlierAssistantTextPage(text, window.end, retention));
    }
  });
  useLayoutEffect(() => readerFollow?.subscribe(onFollowingChange), [readerFollow]);
  const canDetachCurrentPage =
    isStreaming && window !== null && currentPage === null && currentReaderPage === null;
  useLayoutEffect(() => {
    // A row can enter windowing or mount from a new source after the original
    // pause. Preserve its first committed current page, never an old source page.
    // A valid selection consumes eligibility, so ordinary appends make no copies.
    if (canDetachCurrentPage && readerFollow?.isFollowing() === false) {
      // eslint-disable-next-line react/set-state-in-effect -- reconcile one newly committed eligible window with the external pane follow signal.
      onFollowingChange(false);
    }
  }, [readerFollow, canDetachCurrentPage]);
  return {
    window,
    isBrowsingEarlier: currentPage !== null,
    showEarlier: () => {
      if (window) {
        setPage(earlierAssistantTextPage(text, window.start, retention));
        setReaderPage(null);
      }
    },
    showLatest: () => {
      setPage(null);
      setReaderPage(null);
    },
  };
}
