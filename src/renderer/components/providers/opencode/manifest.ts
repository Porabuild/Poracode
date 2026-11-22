import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "opencode",
  label: msg`OpenCode`,
  order: 70,
  usageProviderId: "opencode",
} satisfies RendererProviderManifest;
