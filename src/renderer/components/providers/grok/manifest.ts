import { createModelVariant } from "@/shared/modelVariant";
import { msg } from "@lingui/core/macro";
import { resolveGrokSessionDir } from "@/shared/grokSessionMedia";
import type { RendererProviderManifest } from "../providerManifest";

const grokFastVariant = createModelVariant("-build-fast");

export default {
  kind: "grok",
  defaultFastEnabled: false,
  normalizeModelConfig: grokFastVariant.normalizeConfig,
  // Grok advertises Fast as `*-build-fast`. Detection folds it into the Fast
  // toggle; the live session catalog lists the sibling again.
  projectComposerCapabilities: (capabilities) => grokFastVariant.foldCapabilities(capabilities),
  label: msg`Grok Build`,
  order: 40,
  resolveMarkdownImageRoots: ({ sessionId, projectLocation, homeDir, isRemote }) => {
    if (isRemote || !sessionId || !homeDir) return undefined;
    const sessionDir = resolveGrokSessionDir({ projectLocation, sessionId, homeDir });
    return sessionDir ? [sessionDir] : undefined;
  },
} satisfies RendererProviderManifest;
