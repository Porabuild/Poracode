import type { TerminalExitStatus } from "@agentclientprotocol/sdk";

export type AcpTerminalRecord = {
  kill: () => void;
  dispose: () => void;
  commandLine: string;
  output: string;
  outputByteLimit: number | undefined;
  truncated: boolean;
  exitStatus: TerminalExitStatus | undefined;
  waiters: Array<(status: TerminalExitStatus) => void>;
};

// Cap concurrent command processes per ACP session. Legitimate use rarely exceeds a
// handful; the cap is a defensive bound against a misbehaving agent that
// creates terminals without releasing them and leaks file descriptors.
export const MAX_ACP_TERMINALS_PER_SESSION = 32;

export function truncateTerminalOutput(
  output: string,
  limit: number | undefined,
): { output: string; truncated: boolean } {
  if (limit === undefined || limit < 0 || Buffer.byteLength(output, "utf8") <= limit) {
    return { output, truncated: false };
  }
  let low = 0;
  let high = output.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (Buffer.byteLength(output.slice(mid), "utf8") <= limit) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return { output: output.slice(low), truncated: true };
}

export function appendTerminalOutput(record: AcpTerminalRecord, chunk: string): void {
  const next = truncateTerminalOutput(record.output + chunk, record.outputByteLimit);
  record.output = next.output;
  record.truncated = record.truncated || next.truncated;
}
