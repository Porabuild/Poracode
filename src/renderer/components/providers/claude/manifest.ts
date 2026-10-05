import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "claude",
  label: msg`Claude Code`,
  order: 10,
  utilityOrder: 20,
} satisfies RendererProviderManifest;
