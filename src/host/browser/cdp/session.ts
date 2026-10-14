/**
 * Transport-agnostic view of a CDP target. The browser tool library
 * (`./tools.ts`, `../cursorOverlay.ts`, `../mcp/tools/page.ts`) is written
 * against this interface only — it never reaches for a concrete `WebContents`.
 * `CdpClient` (desktop embedded browser, `@/main/browser/cdp/cdpClient.ts`)
 * implements it over an Electron `webContents.debugger`; `ExternalCdpClient`
 * (see `../external/ExternalChromeConnection.ts`) implements the same surface
 * over the companion extension's `chrome.debugger`, so every CDP-based tool
 * works unchanged against the user's real Chrome.
 */
export type CdpEventHandler = (params: unknown) => void;

export interface CdpSession {
  attach(): Promise<void>;
  isAttached(): boolean;
  send<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>;
  on(method: string, handler: CdpEventHandler): () => void;
}
