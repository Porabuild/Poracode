import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";
import { normalizeCommandCodeModelConfig } from "./config";

export default {
  kind: "commandcode",
  label: msg`Command Code`,
  order: 60,
  normalizeModelConfig: normalizeCommandCodeModelConfig,
} satisfies RendererProviderManifest;
