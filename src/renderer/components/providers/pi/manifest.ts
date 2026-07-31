import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "pi",
  label: msg`Pi`,
  order: 75,
} satisfies RendererProviderManifest;
