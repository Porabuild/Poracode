/**
 * Claude Code launched through the Agent SDK (`CLAUDE_CODE_ENTRYPOINT=sdk-ts`)
 * switches off some defaults that the interactive CLI keeps on. This restores
 * the ones a chat thread should share with a terminal thread.
 *
 * - `CLAUDE_CODE_ARTIFACT`: the CLI withholds the Artifact tools and the
 *   artifact slash commands (`/slides`, `/whiteboard`, ...) from SDK sessions
 *   (`sdk_default_off`) unless this is set. Without them a claude.ai
 *   `/artifact/` link can only be reached through the Docs connector, which
 *   refuses every artifact type other than Docs.
 *
 * These are defaults: an explicit value from the user's shell, profile, or
 * settings wins. The CLI's own `CLAUDE_CODE_DISABLE_ARTIFACT` and its org
 * policy checks take precedence over this opt-in.
 */
export const CLAUDE_SDK_CLI_PARITY_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CODE_ARTIFACT: "1",
};

/**
 * The parity defaults that `shellEnv` does not already set. Use this where the
 * launch env is layered over a captured shell env at spawn time (the WSL
 * distro's login shell, the Windows project shell), so a value that shell sets
 * still wins over the default.
 */
export function claudeSdkCliParityDefaults(
  shellEnv: Readonly<Record<string, string | undefined>> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(CLAUDE_SDK_CLI_PARITY_ENV).filter(([key]) => shellEnv?.[key] === undefined),
  );
}
