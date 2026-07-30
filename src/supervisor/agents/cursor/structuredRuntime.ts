import type { SessionRef } from "@/shared/contracts";

export const CURSOR_SDK_SESSION_PREFIX = "sdk:";

export type CursorStructuredRuntime = "acp" | "sdk";

export function configuredCursorStructuredRuntime(
  settings: Record<string, boolean | string> | undefined,
): CursorStructuredRuntime {
  switch (settings?.structuredRuntime) {
    case "sdk":
      return "sdk";
    default:
      return "acp";
  }
}

export interface ResolvedCursorStructuredRuntime {
  runtime: CursorStructuredRuntime;
  /** Provider-native id with Poracode's runtime discriminator removed. */
  providerSessionId?: string;
}

/**
 * Resume identity is authoritative over the current provider-global setting.
 * That lets users change their default without accidentally loading an ACP
 * chat through the SDK store (or the reverse). Historical unprefixed Cursor
 * session ids are ACP ids.
 */
export function resolveCursorStructuredRuntime(
  settings: Record<string, boolean | string> | undefined,
  sessionRef: SessionRef | undefined,
): ResolvedCursorStructuredRuntime {
  const id = sessionRef?.providerSessionId;
  if (id?.startsWith(CURSOR_SDK_SESSION_PREFIX)) {
    return {
      runtime: "sdk",
      providerSessionId: id.slice(CURSOR_SDK_SESSION_PREFIX.length),
    };
  }
  return {
    runtime: id ? "acp" : configuredCursorStructuredRuntime(settings),
    ...(id ? { providerSessionId: id } : {}),
  };
}

export function cursorSdkSessionId(providerSessionId: string): string {
  return providerSessionId.startsWith(CURSOR_SDK_SESSION_PREFIX)
    ? providerSessionId
    : `${CURSOR_SDK_SESSION_PREFIX}${providerSessionId}`;
}
