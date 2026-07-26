export function parseGitHubActionsRunId(rawUrl: string): number | null {
  try {
    const match = new URL(rawUrl).pathname.match(/\/actions\/runs\/(\d+)(?:\/|$)/);
    if (!match?.[1]) return null;
    const runId = Number(match[1]);
    return Number.isSafeInteger(runId) && runId > 0 ? runId : null;
  } catch {
    return null;
  }
}
