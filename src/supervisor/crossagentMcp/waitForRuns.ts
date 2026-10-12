import type { RunLifecycle } from "./RunLifecycle";
import type { SubagentRunStatus } from "./types";
import { MAX_WAIT_TIMEOUT_MS } from "./waitTiming";

interface WaitableRun {
  parentThreadId: string;
  status: SubagentRunStatus;
  pendingRequestIds: ReadonlySet<string>;
}

/** Join without polling; input requests wake either mode before the deadline. */
export async function waitForRuns(
  records: readonly (WaitableRun | undefined)[],
  timeoutMs: number,
  lifecycle: RunLifecycle,
  mode: "all" | "any" = "all",
): Promise<void> {
  const shouldWait = () => {
    if (records.some((record) => record && record.pendingRequestIds.size > 0)) return false;
    const running = (record: WaitableRun | undefined) => record?.status === "running";
    return records.length > 0 && (mode === "all" ? records.some(running) : records.every(running));
  };
  if (timeoutMs <= 0 || !shouldWait()) return;
  await new Promise<void>((resolve) => {
    const unsubscribers: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      clearTimeout(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      resolve();
    };
    const parents = new Set(records.flatMap((record) => (record ? [record.parentThreadId] : [])));
    for (const parent of parents) {
      unsubscribers.push(
        lifecycle.subscribe(parent, (event) => {
          if (event === "closed" || !shouldWait()) done();
        }),
      );
    }
    timer = setTimeout(done, Math.max(0, Math.min(timeoutMs, MAX_WAIT_TIMEOUT_MS)));
  });
}
