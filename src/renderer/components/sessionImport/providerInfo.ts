import { i18n } from "@lingui/core";
import { baseAgentKind } from "@/shared/contracts";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";

export function getSessionImportInfo(kind: string) {
  return getProviderManifest(baseAgentKind(kind))?.sessionImport;
}

export function sessionImportProviderLabel(kind: string): string {
  const info = getSessionImportInfo(kind);
  return info ? i18n._(info.label) : kind;
}
