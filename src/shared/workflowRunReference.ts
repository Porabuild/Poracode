import type { ToolCallWorkflow } from "./contracts/runtimeEvent";

export interface WorkflowRunReference {
  readonly runId: string;
  readonly transcriptDir: string;
  readonly manifestPath: string;
}

/** Transport reference from normalized workflow metadata, never script/result parsing. */
export function workflowRunReference(
  metadata: Pick<ToolCallWorkflow, "runId" | "transcriptDir"> | undefined,
): WorkflowRunReference | undefined {
  const runId = metadata?.runId?.trim();
  const transcriptDir = metadata?.transcriptDir?.trim().replace(/[\\/]+$/u, "");
  if (
    !runId ||
    !transcriptDir ||
    /[\\/\0]/u.test(runId) ||
    runId === "." ||
    runId === ".." ||
    transcriptDir.includes("\0")
  ) {
    return undefined;
  }
  // The application workflow runtime owns this layout on POSIX and Windows.
  // Check the final identity instead of resolving another run's manifest.
  const match = /^(.*?)([\\/])subagents[\\/]workflows[\\/]([^\\/]+)$/u.exec(transcriptDir);
  if (!match?.[1] || !match[2] || match[3] !== runId) return undefined;
  return {
    runId,
    transcriptDir,
    manifestPath: `${match[1]}${match[2]}workflows${match[2]}${runId}.json`,
  };
}
