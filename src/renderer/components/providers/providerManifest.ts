import type { MessageDescriptor } from "@lingui/core";
import { baseAgentKind, type ProjectLocation } from "@/shared/contracts";

export interface ProviderMarkdownImageRootsInput {
  sessionId?: string;
  projectLocation: ProjectLocation;
  homeDir?: string;
  isRemote?: boolean;
}

export interface RendererProviderManifest {
  kind: string;
  label: MessageDescriptor;
  /** Shared discovery/model-picker order. */
  order: number;
  /** Optional override for automatic utility tasks; otherwise `order` applies. */
  utilityOrder?: number;
  /** Provider-owned roots for relative image paths emitted in transcript markdown. */
  resolveMarkdownImageRoots?: (
    input: ProviderMarkdownImageRootsInput,
  ) => readonly string[] | undefined;
}

const manifestModules = import.meta.glob<RendererProviderManifest>("./*/manifest.ts", {
  eager: true,
  import: "default",
});

function assertRank(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${name} provider rank: ${String(value)}`);
  }
}

function loadProviderManifests(): RendererProviderManifest[] {
  const manifests = Object.entries(manifestModules).map(([path, manifest]) => {
    const directory = /^\.\/([^/]+)\/manifest\.ts$/u.exec(path)?.[1];
    if (!directory || directory !== manifest.kind) {
      throw new Error(
        `Provider manifest kind ${manifest.kind} does not match its directory ${directory ?? path}`,
      );
    }
    assertRank("default", manifest.order);
    if (manifest.utilityOrder !== undefined) assertRank("utility", manifest.utilityOrder);
    return Object.freeze({ ...manifest });
  });

  const kinds = new Set<string>();
  const defaultRanks = new Set<number>();
  const utilityRanks = new Set<number>();
  for (const manifest of manifests) {
    if (kinds.has(manifest.kind)) throw new Error(`Duplicate provider kind: ${manifest.kind}`);
    if (defaultRanks.has(manifest.order)) {
      throw new Error(`Duplicate provider default rank: ${manifest.order}`);
    }
    const utilityRank = manifest.utilityOrder ?? manifest.order;
    if (utilityRanks.has(utilityRank)) {
      throw new Error(`Duplicate provider utility rank: ${utilityRank}`);
    }
    kinds.add(manifest.kind);
    defaultRanks.add(manifest.order);
    utilityRanks.add(utilityRank);
  }
  return manifests;
}

const manifests = loadProviderManifests();
const manifestByKind = new Map(manifests.map((manifest) => [manifest.kind, manifest]));
const UNKNOWN_PROVIDER_RANK = Number.MAX_SAFE_INTEGER;

export function getProviderManifest(kind: string): RendererProviderManifest | undefined {
  return manifestByKind.get(baseAgentKind(kind));
}

export function getProviderManifests(): RendererProviderManifest[] {
  return manifests.toSorted((left, right) => left.order - right.order);
}

export function getProviderModelPickerRank(kind: string): number {
  return getProviderManifest(kind)?.order ?? UNKNOWN_PROVIDER_RANK;
}

export function getProviderUtilityRank(kind: string): number {
  const manifest = getProviderManifest(kind);
  return manifest ? (manifest.utilityOrder ?? manifest.order) : UNKNOWN_PROVIDER_RANK;
}
