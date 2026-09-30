import type { ImportedSessionProvider } from "@/shared/contracts/sessionImport";
import type { SessionImportProvider } from "@/shared/sessionImport/provider";
import { codexSessionImport } from "@/supervisor/agents/codex/sessionImport";
import { claudeSessionImport } from "@/supervisor/agents/claude/sessionImport";
export const SESSION_IMPORT_PROVIDERS: readonly SessionImportProvider[] = [
  codexSessionImport,
  claudeSessionImport,
];
export function getSessionImportProvider(kind: ImportedSessionProvider): SessionImportProvider {
  const provider = SESSION_IMPORT_PROVIDERS.find((entry) => entry.kind === kind);
  if (!provider) throw new Error(`Unsupported session import provider: ${kind}`);
  return provider;
}
