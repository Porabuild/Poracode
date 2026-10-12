import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "devin",
  label: msg`Devin`,
  order: 48,
  // Fast doubles Devin's cost, so it stays opt-in on fresh picks.
  defaultFastEnabled: false,
} satisfies RendererProviderManifest;
