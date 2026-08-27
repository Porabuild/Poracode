import { quotePosixShellArg, type CommandSpec } from "./agents/base";

/**
 * Sentinel echoed as the first thing our one-shot script runs, so login-shell
 * noise emitted *before* it can be discarded when the output is parsed.
 */
export const ONE_SHOT_OUTPUT_MARKER = "__PORACODE_ONESHOT_OUTPUT__";

/**
 * One-shot generation (titles, commit messages, PR summaries, context
 * extraction) runs the agent CLI through a login+interactive shell — `bash -l
 * -i -c` inside WSL, `$SHELL -l [-i] -c` on POSIX — so rc files (nvm/fnm/asdf,
 * PATH overrides) are sourced. Those startup files also print banners: a WSL
 * distro that was powered off emits Ubuntu's full MOTD ("Welcome to Ubuntu
 * 24.04.1 LTS (GNU/Linux …)") on the first shell after boot, which lands on
 * stdout ahead of the CLI's answer and gets parsed as the result — e.g. a new
 * thread titled "Welcome to Ubuntu 24.04.1 LTS".
 *
 * Printing a sentinel as the script's first statement separates shell startup
 * noise from the command's real output; {@link stripOneShotBanner} drops
 * everything up to it. No-op for specs that aren't shell-script invocations
 * (native Windows/PowerShell, or a direct absolute-path exec).
 */
export function markOneShotOutput(spec: CommandSpec): CommandSpec {
  const scriptIndex = spec.args.length - 1;
  if (scriptIndex < 1 || spec.args[scriptIndex - 1] !== "-c") return spec;
  const script = spec.args[scriptIndex];
  if (typeof script !== "string") return spec;

  const args = [...spec.args];
  const marker = quotePosixShellArg(ONE_SHOT_OUTPUT_MARKER);
  args[scriptIndex] = `printf '%s\n' ${marker}; ${script}`;
  return { ...spec, args };
}

/**
 * Drop shell-startup banner output that precedes the sentinel from
 * {@link markOneShotOutput}. Returns the text unchanged when no sentinel is
 * present (unmarked spec, or the shell died before running the script).
 */
export function stripOneShotBanner(output: string): string {
  const index = output.lastIndexOf(ONE_SHOT_OUTPUT_MARKER);
  if (index < 0) return output;
  return output.slice(index + ONE_SHOT_OUTPUT_MARKER.length).replace(/^\r?\n/, "");
}
