import type { ProjectLocation } from "@/shared/contracts";

/** Profile-owned values cannot redirect the source the adapter verifies. */
export function devinCredentialEnvironmentConflicts(
  environment: Readonly<Record<string, string>> | undefined,
  location: ProjectLocation,
): string[] {
  const reserved = new Set(["WINDSURF_API_KEY", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"]);
  return Object.keys(environment ?? {}).filter((key) =>
    reserved.has(location.kind === "windows" ? key.toUpperCase() : key),
  );
}

/** Windows environment names are case-insensitive, including account roots. */
export function devinDefaultRootEnvironmentConflicts(
  environment: Readonly<Record<string, string>> | undefined,
  location: ProjectLocation,
): string[] {
  const reserved = new Set(
    location.kind === "windows"
      ? ["APPDATA", "LOCALAPPDATA"]
      : ["XDG_CONFIG_HOME", "XDG_DATA_HOME"],
  );
  return Object.keys(environment ?? {}).filter((key) =>
    reserved.has(location.kind === "windows" ? key.toUpperCase() : key),
  );
}
