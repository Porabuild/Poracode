import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "devin",
  label: msg`Devin`,
  order: 48,
} satisfies RendererProviderManifest;
