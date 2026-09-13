import type { DraftContent } from "./slices/types";
import type { ComposerSeed, PendingComposerSeed } from "./slices/draftSlice";

export {
  remapProjectView,
  remapProjectGroupLayouts,
  remapThreadProjectIds,
} from "@/shared/projectReferences";

export function remapProjectRecord<T>(
  record: Record<string, T>,
  duplicateIds: ReadonlyMap<string, string>,
  merge?: (canonical: T, duplicate: T) => T,
): Record<string, T> {
  let changed = false;
  const next = { ...record };
  for (const [duplicateId, canonicalId] of duplicateIds) {
    if (!(duplicateId in next)) continue;
    changed = true;
    if (!(canonicalId in next)) {
      next[canonicalId] = next[duplicateId]!;
    } else if (merge) {
      next[canonicalId] = merge(next[canonicalId]!, next[duplicateId]!);
    }
    delete next[duplicateId];
  }
  return changed ? next : record;
}

/** Preserve unsent content when either side of a repaired duplicate has it. */
export function mergeDraftContent(canonical: DraftContent, duplicate: DraftContent): DraftContent {
  if (canonical === duplicate || JSON.stringify(canonical) === JSON.stringify(duplicate))
    return canonical;
  if (canonical.segments.length === 0 && canonical.attachments.length === 0) return duplicate;
  if (duplicate.segments.length === 0 && duplicate.attachments.length === 0) return canonical;
  const attachments = new Map(
    canonical.attachments.map((attachment) => [attachment.id, attachment]),
  );
  for (const attachment of duplicate.attachments) attachments.set(attachment.id, attachment);
  return {
    segments: [
      ...canonical.segments,
      ...(canonical.segments.length > 0 && duplicate.segments.length > 0
        ? [{ kind: "text" as const, content: "\n\n" }]
        : []),
      ...duplicate.segments,
    ],
    attachments: [...attachments.values()],
  };
}

export function composerSeedQueue(seed: PendingComposerSeed): ComposerSeed[] {
  const { queued, ...first } = seed;
  return [first, ...(queued ?? [])];
}

export function mergePendingComposerSeeds(
  canonical: PendingComposerSeed,
  duplicate: PendingComposerSeed,
): PendingComposerSeed {
  return {
    ...canonical,
    nonce: Math.max(canonical.nonce, duplicate.nonce) + 1,
    queued: [...(canonical.queued ?? []), ...composerSeedQueue(duplicate)],
  };
}

export function projectIdentityOptions(platform: NodeJS.Platform) {
  return { caseInsensitivePosix: platform === "darwin" } as const;
}

export function currentProjectIdentityOptions() {
  const platform =
    typeof window !== "undefined" && window.poracode ? window.poracode.platform : "linux";
  return projectIdentityOptions(platform);
}
