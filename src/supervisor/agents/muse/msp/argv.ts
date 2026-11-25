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
 *
 * `untrusted` is the CLI's name for `promptUnmatched`: ask only for actions no
 * permission rule covers. Muse's built-in workspace filesystem authority
 * covers project-root reads and writes (and `--trust-workspace` loads the
 * project's rules), so this mode still performs ordinary workspace edits
 * without a prompt. It does not mean "every write requires approval"; only
 * actions outside the resolved authority prompt, and the sandbox stays on.
 */
export function toMspApprovalMode(policy: string | undefined): MspApprovalMode {
  switch (policy) {
    case "read-only":
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
 * Poracode's `read-only` policy is enforced per session through Muse's native
 * permission profile, because host write/shell flags cannot express safe
 * read-only shell commands and cannot transition after launch.
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
