import { normalizeTurnClientContextUrl } from "@/shared/turnClientContextUrl";
import {
  TURN_CLIENT_CONTEXT_TITLE_MAX_LENGTH,
  TURN_CLIENT_CONTEXT_URL_MAX_LENGTH,
  type TurnClientBrowserTab,
  type TurnClientContext,
} from "@/shared/contracts";
import type { TurnClientContextCapture } from "@/renderer/components/composer/turnClientContext";

interface ExtensionTab {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
}

/** The slice of the extension-page `chrome` API this capture reads. */
export interface BrowserTabsApi {
  readonly windows: { getCurrent(): Promise<{ readonly id?: number }> };
  readonly tabs: {
    query(info: { active: true; windowId: number }): Promise<readonly ExtensionTab[]>;
  };
}

/** A submit never waits longer than this for the browser to answer. */
export const BROWSER_FOCUS_CAPTURE_TIMEOUT_MS = 500;

function extensionTabsApi(): BrowserTabsApi | undefined {
  const chrome = (globalThis as { chrome?: Partial<BrowserTabsApi> }).chrome;
  return typeof chrome?.windows?.getCurrent === "function" &&
    typeof chrome.tabs?.query === "function"
    ? (chrome as BrowserTabsApi)
    : undefined;
}

/**
 * Characters past the C0/C1 control ranges that can still break or reorder a
 * line: line/paragraph separators and bidi marks, embeddings, overrides and
 * isolates.
 */
const LINE_BREAKING_FORMAT_CHARS = /[\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/** Control characters (newlines included) and line-breaking marks become spaces. */
function singleLine(value: string): string {
  let line = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    line +=
      code < 0x20 || (code >= 0x7f && code <= 0x9f) || LINE_BREAKING_FORMAT_CHARS.test(char)
        ? " "
        : char;
  }
  return line;
}

function boundedTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = singleLine(value).trim();
  if (!clean) return undefined;
  return clean.length > TURN_CLIENT_CONTEXT_TITLE_MAX_LENGTH
    ? `${clean.slice(0, TURN_CLIENT_CONTEXT_TITLE_MAX_LENGTH - 1)}…`
    : clean;
}

/**
 * Web origin and path only: credentials, query and fragment (OAuth tokens,
 * signed links, reset codes) and non-web schemes such as local `file:` paths
 * never leave the browser. The agent reads the exact URL on demand through
 * the browser tools by tab id.
 */
function boundedUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const url = normalizeTurnClientContextUrl(value);
  if (!url) return undefined;
  return url.pageUrl.length > TURN_CLIENT_CONTEXT_URL_MAX_LENGTH ? url.origin : url.pageUrl;
}

async function readActiveTab(api: BrowserTabsApi): Promise<TurnClientBrowserTab | undefined> {
  // The side panel's OWN window: with several windows open, the service
  // worker's last-focused window can be a different one.
  const { id: windowId } = await api.windows.getCurrent();
  if (typeof windowId !== "number") return undefined;
  const [tab] = await api.tabs.query({ active: true, windowId });
  if (!tab || typeof tab.id !== "number" || !Number.isSafeInteger(tab.id) || tab.id < 0) {
    return undefined;
  }
  const title = boundedTitle(tab.title);
  const url = boundedUrl(tab.url);
  return { tabId: tab.id, ...(title ? { title } : {}), ...(url ? { url } : {}) };
}

/**
 * Browser-focus capture for the chat sidebar surface, which always runs in the
 * user's browser. The capture always reports browser focus; the tab is omitted
 * when the extension API is absent (the surface opened as a plain page), when
 * the browser fails, or when it does not answer within the timeout, so a send
 * is never blocked on it.
 */
export function createBrowserFocusCapture(
  api: BrowserTabsApi | undefined = extensionTabsApi(),
  timeoutMs = BROWSER_FOCUS_CAPTURE_TIMEOUT_MS,
): TurnClientContextCapture {
  if (!api) return async () => ({ browserFocus: {} });
  return async (): Promise<TurnClientContext> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    try {
      const activeTab = await Promise.race([readActiveTab(api).catch(() => undefined), timeout]);
      return { browserFocus: activeTab ? { activeTab } : {} };
    } finally {
      clearTimeout(timer);
    }
  };
}
