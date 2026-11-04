import type { LockedComputerUseErrorCode } from "@/shared/contracts/lockedComputerUse";

export type LockedUseInstallerVerb = "install" | "uninstall";

/** POSIX single-quote quoting: safe for any byte string except NUL. */
export function quoteShellArgument(value: string): string {
  if (value.includes("\0")) throw new Error("Shell arguments cannot contain NUL bytes.");
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Escapes text for an AppleScript double-quoted string literal. */
export function quoteAppleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** The shell command the administrator prompt runs. */
export function buildInstallerShellCommand(
  installerPath: string,
  verb: LockedUseInstallerVerb,
  uid: number,
): string {
  const quoted = quoteShellArgument(installerPath);
  if (verb === "uninstall") return `${quoted} uninstall`;
  if (!Number.isSafeInteger(uid) || uid < 0) throw new Error(`Invalid user id: ${uid}`);
  return `${quoted} install --user ${uid}`;
}

/**
 * `osascript` arguments for one administrator prompt. The installer path is
 * shell-quoted first, then the whole command is embedded as an AppleScript
 * string, so neither quoting layer can be broken out of by the path.
 */
export function buildAdminPromptArgs(
  installerPath: string,
  verb: LockedUseInstallerVerb,
  uid: number,
): string[] {
  const command = buildInstallerShellCommand(installerPath, verb, uid);
  return ["-e", `do shell script ${quoteAppleScriptString(command)} with administrator privileges`];
}

/** AppleScript's "User canceled." error number for a dismissed prompt. */
const APPLESCRIPT_USER_CANCELED = -128;

/**
 * `do shell script` reports a failing command as
 * `execution error: <stderr> (<exit status>)`, and a dismissed administrator
 * prompt as `User canceled. (-128)`. The trailing number is the only stable
 * part, so map from it.
 */
export function readAdminPromptExitCode(stderr: string): number | null {
  const matches = [...stderr.matchAll(/\((-?\d+)\)/gu)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? null : Number(last);
}

export function mapInstallerFailure(
  verb: LockedUseInstallerVerb,
  stderr: string,
): LockedComputerUseErrorCode | null {
  const code = readAdminPromptExitCode(stderr);
  switch (code) {
    case APPLESCRIPT_USER_CANCELED:
      return "cancelled";
    case 2:
      return "usage";
    case 3:
      return "unsupported_rule";
    case 4:
      return "verification_failed";
    case 5:
      return "not_root";
    // Uninstalling something that is not installed already has the result
    // the user asked for.
    case 6:
      return verb === "uninstall" ? null : "failed";
    default:
      return "failed";
  }
}
