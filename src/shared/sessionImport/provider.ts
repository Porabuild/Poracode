import type { ImportedSessionProvider } from "../contracts/sessionImport";
import type { SharedSettings } from "../settings";
import type { ImportedTranscript } from "./transcript";
export interface ImportHome {
  provider: ImportedSessionProvider;
  agentKind: string;
  dir: string;
  accountId?: string;
}
export interface SessionHead {
  providerSessionId: string;
  cwd?: string;
  startedAt?: string;
  accountId?: string;
  model?: string;
  /** Internal/utility sessions should not be offered as user conversations. */
  excluded?: boolean;
}
/** Provider-owned native transcript discovery, normalization and replay input. */
export interface SessionImportProvider {
  kind: ImportedSessionProvider;
  transcriptRoot: string;
  acceptFile(name: string): boolean;
  homes(settings: SharedSettings): ImportHome[];
  readHead(prefix: string, path: string): SessionHead | undefined;
  userText(entry: Record<string, unknown>): string | undefined;
  cleanUserText(text: string): string;
  /** True only when a title changes with the transcript's own mtime/size. */
  titleFromTranscript: boolean;
  createTitleReader(homeDir: string): (path: string, sessionId: string) => string | undefined;
  parseTranscript(path: string): ImportedTranscript;
}
