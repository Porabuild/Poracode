import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "./wsl/bridge/client";

/** Media metadata must retain the bridge's followed-symlink containment gate. */
export async function statWslPreviewMtimeMs(
  client: WslBridgeClient,
  location: Extract<ProjectLocation, { kind: "wsl" }>,
  path: string,
  requireRegularFile: boolean,
): Promise<number> {
  const { stats } = await client.stat(location, [path], { follow: requireRegularFile });
  const entry = stats[0];
  if (requireRegularFile && (!entry?.exists || !entry.isFile)) {
    throw Object.assign(new Error("Only contained regular files can be previewed."), {
      code: entry?.code ?? "ENOENT",
    });
  }
  return entry?.mtimeMs ?? 0;
}
