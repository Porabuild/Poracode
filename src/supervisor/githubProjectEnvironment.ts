import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function loadProjectDirenv(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv | undefined> {
  if (/^(1|true)$/i.test(baseEnv.DIRENV_DISABLE ?? "")) return undefined;

  // Let direnv undo any inherited project environment and enforce approval
  // before loading the target project. Read the whole env so unsets survive.
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("direnv", ["exec", ".", "/usr/bin/env", "-0"], {
      cwd,
      env: baseEnv,
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    // eslint-disable-next-line preserve-caught-error -- The environment dump can contain credentials.
    throw new Error(
      "Could not load the project's direnv environment. Check direnv status in the project directory.",
    );
  }

  const entries: [string, string][] = [];
  for (const entry of stdout.split("\0")) {
    if (!entry) continue;
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error("Could not read the project's direnv environment.");
    entries.push([entry.slice(0, separator), entry.slice(separator + 1)]);
  }
  return Object.fromEntries(entries);
}
