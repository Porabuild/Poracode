import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  backgroundTaskOutputSchema,
  type BackgroundTask,
  type BackgroundTaskOutput,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";

const OUTPUT_POLL_INTERVAL_MS = 2_000;
const IDLE_OUTPUT_STATE: ThreadBackgroundTaskOutputState = { status: "idle" };

export type ThreadBackgroundTaskOutputState =
  | { status: "idle" }
  | { status: "loading" }
  | ({ status: "ready"; refreshing: boolean } & BackgroundTaskOutput)
  | { status: "error"; message: string };

/**
 * Opaque provider action payloads have no shared keys. Sort by key so a
 * provider re-encoding the same map with different insertion order does not
 * restart a read, and fence on the whole payload rather than any vendor field.
 */
export function backgroundTaskActionKey(action: {
  id: string;
  payload: Readonly<Record<string, string>>;
}): string {
  const entries = Object.keys(action.payload)
    .sort()
    .map((key) => [key, action.payload[key]]);
  return JSON.stringify([action.id, entries]);
}

type OutputStateBox = {
  identity: string;
  value: ThreadBackgroundTaskOutputState;
};

type PendingOutputRead = {
  baseIdentity: string;
  promise: Promise<unknown>;
};

function updateOutputState(
  setBox: Dispatch<SetStateAction<OutputStateBox>>,
  identity: string,
  next:
    | ThreadBackgroundTaskOutputState
    | ((previous: ThreadBackgroundTaskOutputState) => ThreadBackgroundTaskOutputState),
): void {
  setBox((current) => ({
    identity,
    value:
      typeof next === "function"
        ? next(current.identity === identity ? current.value : IDLE_OUTPUT_STATE)
        : next,
  }));
}

function documentIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(documentIsVisible);
  useEffect(() => {
    const update = () => setVisible(documentIsVisible());
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * Polls one task's bounded output tail only while its details are open and the
 * document is visible. Reads are serialized per base task/action identity: a
 * collapse or hidden document never starts a second transport read while the
 * first is unresolved. Every response is fenced against the current base
 * identity, and a read failure stops the loop until the user retries or the
 * run changes. The action is read-only; it never starts a turn.
 */
export function useThreadBackgroundTaskOutput(
  threadId: string,
  task: BackgroundTask,
  expanded: boolean,
): { state: ThreadBackgroundTaskOutputState; retry: () => void } {
  const { t } = useLingui();
  const visible = useDocumentVisible();
  const [retryVersion, setRetryVersion] = useState(0);
  const action = task.outputAction;
  const actionId = action?.id;
  const actionKey = action ? backgroundTaskActionKey(action) : "";
  const actionPayload = action?.payload;
  const baseIdentity = JSON.stringify([threadId, task.taskId, actionKey]);
  const payloadRef = useRef(actionPayload);
  const pendingReadRef = useRef<PendingOutputRead | undefined>(undefined);
  const failedAttemptRef = useRef<{ baseIdentity: string; retryVersion: number } | undefined>(
    undefined,
  );
  useEffect(() => {
    payloadRef.current = actionPayload;
  }, [actionPayload]);
  const [stateBox, setStateBox] = useState<OutputStateBox>({
    identity: baseIdentity,
    value: IDLE_OUTPUT_STATE,
  });
  const state = stateBox.identity === baseIdentity ? stateBox.value : IDLE_OUTPUT_STATE;

  useEffect(() => {
    if (!expanded || !visible || !actionId || !actionKey) return;
    const failed = failedAttemptRef.current;
    if (failed?.baseIdentity === baseIdentity && failed.retryVersion === retryVersion) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const payload = payloadRef.current;
    if (!payload) return;

    const read = async () => {
      if (cancelled) return;
      updateOutputState(setStateBox, baseIdentity, (previous) =>
        previous.status === "ready" ? { ...previous, refreshing: true } : { status: "loading" },
      );
      try {
        let pending = pendingReadRef.current;
        if (!pending || pending.baseIdentity !== baseIdentity) {
          const entry: PendingOutputRead = {
            baseIdentity,
            promise: readBridge().invokeThreadSessionAction({
              threadId,
              actionId,
              payload,
            }),
          };
          pendingReadRef.current = entry;
          void entry.promise.then(
            () => {
              if (pendingReadRef.current === entry) pendingReadRef.current = undefined;
            },
            () => {
              if (pendingReadRef.current === entry) pendingReadRef.current = undefined;
            },
          );
          pending = entry;
        }
        const result = await pending.promise;
        if (cancelled) return;
        const parsed = backgroundTaskOutputSchema.safeParse(result);
        if (!parsed.success) {
          failedAttemptRef.current = { baseIdentity, retryVersion };
          updateOutputState(setStateBox, baseIdentity, {
            status: "error",
            message: t`Background task output could not be read.`,
          });
          return;
        }
        failedAttemptRef.current = undefined;
        updateOutputState(setStateBox, baseIdentity, {
          status: "ready",
          refreshing: false,
          output: parsed.data.output,
          totalBytes: parsed.data.totalBytes,
          truncated: parsed.data.truncated,
        });
        timer = setTimeout(() => {
          void read();
        }, OUTPUT_POLL_INTERVAL_MS);
      } catch (failure) {
        if (cancelled) return;
        failedAttemptRef.current = { baseIdentity, retryVersion };
        updateOutputState(setStateBox, baseIdentity, {
          status: "error",
          message: friendlyError(failure),
        });
      }
    };

    void read();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [actionId, actionKey, baseIdentity, expanded, retryVersion, t, threadId, visible]);

  return {
    state,
    retry: () => setRetryVersion((version) => version + 1),
  };
}
