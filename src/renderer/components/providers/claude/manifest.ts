import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "claude",
  label: msg`Claude Code`,
  sessionImport: { label: msg`Claude Code`, fallbackModel: "claude-opus-5" },
  order: 10,
  utilityOrder: 20,
} satisfies RendererProviderManifest;
