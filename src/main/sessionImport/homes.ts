import type { SharedSettings } from "@/shared/settings";
import type { ImportHome } from "@/shared/sessionImport/provider";
import { SESSION_IMPORT_PROVIDERS } from "./providers";
export type { ImportHome } from "@/shared/sessionImport/provider";
/** Import only enumerates homes on the host running the desktop app. */
export function resolveImportHomes(settings: SharedSettings): ImportHome[] {
  return SESSION_IMPORT_PROVIDERS.flatMap((provider) => provider.homes(settings));
}
