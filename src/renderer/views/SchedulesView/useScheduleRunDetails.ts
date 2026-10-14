import { useEffect, useRef, useState } from "react";
import type { ScheduledTaskRun } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";

function isActive(run: ScheduledTaskRun | null): boolean {
  return Boolean(
    run &&
    (run.status === "running" ||
      run.status === "waiting-for-approval" ||
      run.result?.stopReason === "retry-pending"),
  );
}

/** Detail reads remain live when cancellation or triage removes a run from the inbox. */
export function useScheduleRunDetails(
  machine: string,
  selected: ScheduledTaskRun | null,
  inboxRun: ScheduledTaskRun | undefined,
  fetchRuns: (scheduleId: string) => Promise<ScheduledTaskRun[]>,
) {
  const key = JSON.stringify([machine, selected?.id]);
  const [detail, setDetail] = useState<{
    key: string;
    run: ScheduledTaskRun;
    error: string;
  } | null>(null);
  const saved = detail?.key === key ? detail : null;
  const run =
    inboxRun && !isActive(inboxRun)
      ? inboxRun
      : saved && !isActive(saved.run)
        ? saved.run
        : (inboxRun ?? saved?.run ?? selected);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  }, [run]);
  const scheduleId = selected?.scheduleId;
  const runId = selected?.id;
  useEffect(() => {
    if (!scheduleId || !runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const rows = await fetchRuns(scheduleId);
        const next = rows.find((row) => row.id === runId);
        if (cancelled) return;
        if (next) {
          latest.current = next;
          setDetail({ key, run: next, error: "" });
        }
      } catch (error) {
        if (!cancelled && latest.current)
          setDetail({ key, run: latest.current, error: toErrorMessage(error) });
      }
      if (!cancelled && isActive(latest.current)) timer = setTimeout(() => void load(), 2_000);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, scheduleId, runId, fetchRuns]);
  return { run, loadError: saved?.error ?? "" };
}
