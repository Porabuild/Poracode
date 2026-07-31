import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "kimi",
  label: msg`Kimi Code`,
  order: 45,
} satisfies RendererProviderManifest;
