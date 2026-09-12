import { useEffect, useRef, useState, type RefObject } from "react";
import type { AgentCapability } from "@/shared/contracts";
import { liveVoice, useLiveVoice } from "@/renderer/speech/liveVoice";

interface DraftLiveVoiceStartOptions {
  capability: NonNullable<AgentCapability["liveVoice"]>;
  /** Return false when the draft changed while microphone permission was pending. */
  canPrepare?: () => boolean;
  prepare: (threadId: string) => Promise<void> | void;
}

/** Owns the draft-to-thread voice session until the draft hands off to a thread. */
export function useDraftLiveVoice(submittedRef: RefObject<boolean>, scopeId: string) {
  const threadIdRef = useRef<string | null>(null);
  const pendingOperationsRef = useRef(0);
  const mountedRef = useRef(true);
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const liveVoiceActive = useLiveVoice(
    (state) => state.scopeId === scopeId && state.phase !== "idle",
  );

  function setPendingOperationCountIfMounted(count: number) {
    if (mountedRef.current) setPendingOperationCount(count);
  }

  function trackOperation<T>(operation: () => Promise<T>): Promise<T> {
    const nextCount = pendingOperationsRef.current + 1;
    pendingOperationsRef.current = nextCount;
    setPendingOperationCountIfMounted(nextCount);

    let result: Promise<T>;
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      pendingOperationsRef.current -= 1;
      setPendingOperationCountIfMounted(pendingOperationsRef.current);
      return Promise.reject(error);
    }
    return result.finally(() => {
      const remaining = Math.max(0, pendingOperationsRef.current - 1);
      pendingOperationsRef.current = remaining;
      setPendingOperationCountIfMounted(remaining);
    });
  }

  function hasPendingOperations() {
    return pendingOperationsRef.current > 0;
  }

  function cancel() {
    if (submittedRef.current) return;
    const threadId = threadIdRef.current;
    if (!threadId) return;
    threadIdRef.current = null;
    liveVoice.stopThread(threadId, scopeId);
  }

  useEffect(() => {
    mountedRef.current = true;
    const submittedState = submittedRef;
    const threadState = threadIdRef;
    return () => {
      mountedRef.current = false;
      // A successful voice launch keeps the same session alive as the draft
      // pane is replaced by the new thread. Failed or abandoned drafts still
      // release their pending microphone request here.
      if (submittedState.current) return;
      const threadId = threadState.current;
      if (!threadId) return;
      threadState.current = null;
      liveVoice.stopThread(threadId, scopeId);
    };
  }, [scopeId, submittedRef]);

  function canPrepare(options: DraftLiveVoiceStartOptions) {
    return !hasPendingOperations() && (options.canPrepare?.() ?? true);
  }

  function start(options: DraftLiveVoiceStartOptions) {
    cancel();
    if (!canPrepare(options)) return;
    const threadId = crypto.randomUUID();
    threadIdRef.current = threadId;
    void liveVoice.start({
      threadId,
      scopeId,
      capability: options.capability,
      prepare: async () => {
        if (threadIdRef.current !== threadId) return;
        if (!canPrepare(options)) {
          cancel();
          return;
        }
        await options.prepare(threadId);
      },
    });
  }

  return {
    liveVoiceActive,
    pendingOperationCount,
    hasPendingOperations,
    trackOperation,
    start,
    cancel,
  };
}
