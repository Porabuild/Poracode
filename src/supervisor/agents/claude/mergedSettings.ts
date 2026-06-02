import { promises as fs } from "node:fs";
import { dirname, join, posix as posixPath } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";

const MERGED_SETTINGS_FILENAME = "settings-lightcode.json";

/**
 * Generate a sibling `settings-lightcode.json` next to the hook plugin's
 * `settings.json`, with the given session flags (e.g. `{ ultracode: true }` or
 * `{ fastMode: true }`) merged into the top level.
 *
 * Why we can't just append a second `--settings` flag: Claude's CLI takes the
 * first `--settings` value and silently drops the rest, so passing the inline
 * flags alongside the plugin's path either disables hooks or disables the flags
 * depending on order. The CLI is happy with a single file that carries both —
 * that's what this helper produces.
 *
 * Returns the path the CLI should be told to read (native path on Windows /
 * posix, Linux-side path on WSL), or `undefined` if the source can't be read
 * (we fall back to the plugin's regular settings file in that case).
 */
export async function prepareClaudeMergedSettingsFile(
  pluginSettingsPath: string,
  projectLocation: ProjectLocation,
  flags: Record<string, unknown>,
): Promise<string | undefined> {
  if (!pluginSettingsPath) return undefined;

  if (projectLocation.kind === "wsl") {
    const distro = projectLocation.distro;
    const linuxSource = pluginSettingsPath;
    const linuxDir = posixPath.dirname(linuxSource);
    const linuxOut = `${linuxDir}/${MERGED_SETTINGS_FILENAME}`;
    const uncSource = toWslUncPath(distro, linuxSource);
    const uncOut = toWslUncPath(distro, linuxOut);
    try {
      const content = await fs.readFile(uncSource, "utf8");
      const merged = mergeFlags(content, flags);
      await fs.writeFile(uncOut, merged, "utf8");
      return linuxOut;
    } catch {
      return undefined;
    }
  }

  try {
    const content = await fs.readFile(pluginSettingsPath, "utf8");
    const merged = mergeFlags(content, flags);
    const outPath = join(dirname(pluginSettingsPath), MERGED_SETTINGS_FILENAME);
    await fs.writeFile(outPath, merged, "utf8");
    return outPath;
  } catch {
    return undefined;
  }
}

function mergeFlags(content: string, flags: Record<string, unknown>): string {
  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(content);
    parsed = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  return JSON.stringify({ ...parsed, ...flags });
}
