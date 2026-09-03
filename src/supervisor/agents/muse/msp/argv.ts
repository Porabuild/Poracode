/**
 * `muse serve` argv builders. Verified against real 1.0.2 `--help`: the host
 * takes sandbox posture flags only — approval mode is selected on the wire
 * per session, and there is no `--provider` flag (ambient login decides).
 */

export type MspApprovalMode = "promptUnmatched" | "onRequest" | "allowAll";

/**
 * Thread approval policy → MSP `ApprovalMode` (closed enum; widening it is a
 * deliberate protocol change). `never` and `yolo` both fully allow; `yolo`
 * additionally disables the host sandbox via {@link buildMuseServeArgs}.
 * Unknown policies fall back to the CLI default `onRequest`.
 */
export function toMspApprovalMode(policy: string | undefined): MspApprovalMode {
  switch (policy) {
    case "untrusted":
      return "promptUnmatched";
    case "never":
    case "yolo":
    case "bypassPermissions":
      return "allowAll";
    case "on-request":
    default:
      return "onRequest";
  }
}

/**
 * Argv for the `muse serve` session host. `--trust-workspace` matches the
 * terminal launch parity (workspace skills/rules load for every session).
 * `--disable-sandbox` only for the full-bypass policy. Callers add
 * `--no-session-log` for throwaway hosts (detection probe); GUI sessions
 * must stay durable so `session/read` and resume work.
 */
export function buildMuseServeArgs(
  approvalPolicy?: string,
  options?: { noSessionLog?: boolean },
): string[] {
  const args = ["serve"];
  if (options?.noSessionLog) args.push("--no-session-log");
  args.push("--trust-workspace");
  const policy = approvalPolicy ?? "on-request";
  if (policy === "yolo" || policy === "bypassPermissions") {
    args.push("--disable-sandbox");
  }
  return args;
}
