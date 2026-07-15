import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "factory",
  label: msg`Factory Droid`,
  order: 100,
} satisfies RendererProviderManifest;
