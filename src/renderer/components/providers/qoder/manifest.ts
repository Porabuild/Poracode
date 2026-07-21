import { msg } from "@lingui/core/macro";
import type { RendererProviderManifest } from "../providerManifest";

export default {
  kind: "qoder",
  label: msg`Qoder CLI`,
  order: 37,
} satisfies RendererProviderManifest;
