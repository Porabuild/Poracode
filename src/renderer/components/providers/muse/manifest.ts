import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "muse",
  label: msg`Muse Code`,
  // Between kimi (45) and antigravity (50).
  order: 47,
} satisfies RendererProviderManifest;
