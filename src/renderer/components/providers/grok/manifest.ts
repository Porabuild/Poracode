import { msg } from "@lingui/core/macro";
import { resolveGrokSessionDir } from "@/shared/grokSessionMedia";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "grok",
  label: msg`Grok Build`,
  order: 40,
  resolveMarkdownImageRoots: ({ sessionId, projectLocation, homeDir, isRemote }) => {
    if (isRemote || !sessionId || !homeDir) return undefined;
    const sessionDir = resolveGrokSessionDir({ projectLocation, sessionId, homeDir });
    return sessionDir ? [sessionDir] : undefined;
  },
} satisfies RendererProviderManifest;
