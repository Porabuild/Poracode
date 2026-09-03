import type { ProjectLocation } from "@/shared/contracts";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";

/**
 * Provider-supplied filesystem roots for relative transcript images. Shared
 * chat code only consumes the generic roots; providers own their path rules.
 */
export function resolveThreadMarkdownImageRoots(input: {
  agentKind: string;
  sessionId?: string | undefined;
  projectLocation: ProjectLocation;
  homeDir?: string | undefined;
  isRemote?: boolean | undefined;
}): readonly string[] | undefined {
  return getProviderManifest(input.agentKind)?.resolveMarkdownImageRoots?.({
    projectLocation: input.projectLocation,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
    ...(input.isRemote ? { isRemote: true } : {}),
  });
}
