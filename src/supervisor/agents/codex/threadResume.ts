import { CodexRpcResponseError } from "./appServerRpc";
import type { CodexClientRequestMap } from "./protocol";

type ResumeParams = CodexClientRequestMap["thread/resume"]["params"];
type ResumeResponse = CodexClientRequestMap["thread/resume"]["result"];

export interface CodexThreadResumeHost {
  request(
    method: "thread/resume",
    params: ResumeParams,
    timeoutMs?: number,
  ): Promise<ResumeResponse>;
}

// Cold resumes may restore substantial model context and initialize MCP servers.
// Keep this allowance specific to resume; ordinary RPCs retain their 30s limit.
const CODEX_THREAD_RESUME_TIMEOUT_MS = 120_000;

/** Resume the same provider thread without rebuilding its full UI transcript. */
export async function resumeCodexThread(
  host: CodexThreadResumeHost,
  params: ResumeParams,
): Promise<ResumeResponse> {
  try {
    // Poracode already persists the transcript and reads live status separately.
    // Omitting turns avoids reconstructing and transferring the entire history.
    return await host.request(
      "thread/resume",
      { ...params, excludeTurns: true },
      CODEX_THREAD_RESUME_TIMEOUT_MS,
    );
  } catch (error) {
    if (
      !(error instanceof CodexRpcResponseError) ||
      error.code !== -32602 ||
      !/unknown (?:field|parameter) [`'"]?excludeTurns\b/iu.test(error.message)
    ) {
      throw error;
    }
    // Older servers may reject the optional field. Preserve their resume path,
    // but never retry timeouts or replace the existing provider conversation.
    const { excludeTurns: _excludeTurns, ...legacyParams } = params;
    return host.request("thread/resume", legacyParams, CODEX_THREAD_RESUME_TIMEOUT_MS);
  }
}
