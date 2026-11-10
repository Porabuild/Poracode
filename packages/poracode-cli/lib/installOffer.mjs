import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { createInterface } from "node:readline/promises";
import { defaultCliBinDirectory } from "./installPaths.mjs";

/** Offer only on a bare interactive npm invocation with no command entry yet. */
export async function offerCommandInstall({
  env,
  platform = process.platform,
  home = homedir(),
  interactive,
  prompt,
  install,
}) {
  if (!interactive) return false;
  const bin = defaultCliBinDirectory({ env, platform, home });
  const command = platform === "win32" ? win32.join(bin, "poracode.cmd") : join(bin, "poracode");
  try {
    lstatSync(command);
    return false;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const ask =
    prompt ??
    (async () => {
      const reader = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await reader.question("Install the poracode command for future use? [y/N] ");
      } finally {
        reader.close();
      }
    });
  const answer = (await ask()).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") return false;
  await install();
  return true;
}
