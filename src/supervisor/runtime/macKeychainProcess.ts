import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";

const execFileAsync = promisify(execFile);
const commands = new Set<ChildProcessLifetime>();
let retiring = false;

/**
 * Keep the OS-signed reader identity independent of app versions and paths:
 * `identifier "com.apple.security" and anchor apple`. macOS owns its grants.
 */
const SECURITY_PATH = "/usr/bin/security";

export async function runMacKeychainCommand(
  args: string[],
  timeout: number,
): Promise<{
  stdout: string;
  stderr: string;
}> {
  if (retiring) throw new Error("Keychain access is stopped.");
  const request = execFileAsync(SECURITY_PATH, args, { timeout, encoding: "utf8" });
  const lifetime = new ChildProcessLifetime(request.child);
  commands.add(lifetime);
  void lifetime.closed.then(() => commands.delete(lifetime));
  return request;
}

/** Close password dialogs and join their clients before the supervisor exits. */
export async function retireMacKeychainCommands(): Promise<void> {
  retiring = true;
  await joinRuntimeShutdown(
    [...commands].map((command) => () => command.stop({ graceMs: 250, forceMs: 1_000 })),
    "Keychain command shutdown was not confirmed.",
  );
}

/** Reset only a fully retired fixture; never discard a live child's custody. */
export function resetMacKeychainProcessStateForTests(): void {
  if (commands.size > 0) throw new Error("Keychain commands are still active.");
  retiring = false;
}
