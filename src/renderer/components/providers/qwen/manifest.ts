import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "qwen",
  label: msg`Qwen Code`,
  order: 35,
} satisfies RendererProviderManifest;
