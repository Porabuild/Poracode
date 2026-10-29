import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "fx",
  label: msg`fx`,
  order: 110,
} satisfies RendererProviderManifest;
