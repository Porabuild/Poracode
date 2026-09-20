/**
 * Mock-QA launch enforcement for provider agent processes.
 *
 * The mock smoke profile sandboxes HOME and Poracode's own keychain, but a
 * spawned provider CLI resolves credentials outside that sandbox (login-shell
 * PATH, OS keychain, inherited env) — so a mock-mode thread launch used to
 * execute the real CLI and run a real model turn (2026-09-08 QA incident).
 * This module is the supervisor-side backstop: when both a dev session and
 * the explicit `PORACODE_MOCK_AGENTS=1` flag are present, every provider
 * process-creation funnel refuses to spawn and reports why.
 *
 * The check is provider-agnostic by design — it never matches binary names or
 * agent kinds; it only gates the process-creation funnels themselves. It is
 * inert unless the flag is set, so real-mode launches are untouched. Detection
 * probes that never run a turn (login-shell `command -v`, `--version`, config
 * file checks) are deliberately out of scope; see the mock-provider-isolation
 * QA report for the boundary inventory.
 */

export const MOCK_AGENTS_ENV = "PORACODE_MOCK_AGENTS";

/** Which process-creation funnel refused the launch; for diagnostics only. */
export type AgentLaunchLane =
  | "thread-pty"
  | "thread-structured"
  | "one-shot"
  | "one-shot-subagent"
  | "session-probe"
  | "session-auth"
  | "session-host";

export interface AgentLaunchGuardOptions {
  /** Effective value of {@link MOCK_AGENTS_ENV}. Defaults to the process env. */
  requested?: string | undefined;
  /** Whether this is a dev session. Defaults to the supervisor dev signals. */
  isDevSession?: boolean | undefined;
}

/**
 * The same dev signals `src/supervisor/index.ts` computes at boot, read here at
 * call time so tests (and the packaged supervisor, which receives
 * `PORACODE_IS_DEV` from the main process) evaluate the session the launch
 * actually runs in.
 */
function supervisorDevSession(): boolean {
  return process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);
}

/**
 * True when the session must refuse provider agent launches: the mock flag is
 * set AND this is a dev session. Requiring both mirrors
 * `src/main/mockKeychain.ts` — the flag alone must never alter a packaged app,
 * and a dev session alone must never refuse launches.
 */
export function isMockAgentLaunchEnforced(options: AgentLaunchGuardOptions = {}): boolean {
  const requested = options.requested ?? process.env[MOCK_AGENTS_ENV];
  if (requested !== "1") return false;
  return options.isDevSession ?? supervisorDevSession();
}

/** Thrown instead of spawning a provider process in an enforced mock session. */
export class MockAgentLaunchBlockedError extends Error {
  readonly lane: AgentLaunchLane;

  constructor(lane: AgentLaunchLane) {
    super(
      `Agent launch refused: this is a mock QA session (${MOCK_AGENTS_ENV}=1), so Poracode will not ` +
        `start provider sessions or run model turns. Refused at the ${lane} boundary. ` +
        `Launch without the mock smoke profile (or use --mode real) to run agents.`,
    );
    this.name = "MockAgentLaunchBlockedError";
    this.lane = lane;
  }
}

/**
 * Refuse provider process creation in an enforced mock session. Call this at
 * every funnel that would spawn a provider agent process, immediately before
 * the spawn; a `MockAgentLaunchBlockedError` must reach the funnel's existing
 * failure path (thread launch error, rejected one-shot, failed probe) rather
 * than being swallowed.
 */
export function assertAgentLaunchAllowed(lane: AgentLaunchLane): void {
  if (!isMockAgentLaunchEnforced()) return;
  throw new MockAgentLaunchBlockedError(lane);
}
