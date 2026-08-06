import { randomUUID } from "node:crypto";
import { session as electronSession } from "electron";
import { BROWSER_SESSION_PARTITION } from "@/shared/browserPartition";
import type { UsageLoginConfirmationAction, UsageLoginDeviceCode } from "@/shared/contracts";
import type { BrowserEvent, BrowserTabInfo } from "@/shared/ipc";
import type { BrowserTab } from "./BrowserTab";

const LOGIN_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingLoginConfirmation {
  timeout: ReturnType<typeof setTimeout>;
  resolve(action: UsageLoginConfirmationAction): void;
}

/**
 * The slice of `BrowserPanelManager` the login coordinator needs: it creates and
 * closes the login tab in the in-app browser, looks tabs up, emits browser
 * events to the renderer, and reports whether the host window is alive.
 */
export interface BrowserLoginHost {
  createTab(payload: { url?: string; activate?: boolean }): Promise<BrowserTabInfo>;
  closeTab(tabId: string): Promise<void>;
  findTab(tabId: string): BrowserTab | undefined;
  emit(event: BrowserEvent): void;
  hasHostWindow(): boolean;
}

/**
 * Owns the consent-gated browser-login capture flows, extracted from
 * `BrowserPanelManager` so that class stays focused on tab/picker management.
 * Captures a provider's web-session cookie (with an optional live-session gate
 * and a user confirmation prompt) or relays the GitHub device-code UI. Never
 * touches secrets — the caller seals whatever this returns.
 */
export class BrowserLoginCaptureCoordinator {
  private activeLoginCancel: (() => void) | null = null;
  private readonly pendingLoginConfirmations = new Map<string, PendingLoginConfirmation>();

  constructor(private readonly host: BrowserLoginHost) {}

  /**
   * Open a provider login in a real panel tab and capture its web session
   * cookies once the user signs in. Reuses the in-app browser (its webContents
   * session holds the cookie jar) rather than a separate OS window. Resolves with
   * the serialized `Cookie` header on success, or cancelled when the user closes
   * the tab first. The caller seals the cookie — this method never touches secrets.
   */
  async captureLoginCookies(opts: {
    loginUrl: string;
    cookieUrl: string;
    authCookiePattern: RegExp;
    timeoutMs: number;
    providerLabel?: string;
    /**
     * Optional live-session check run on the candidate `Cookie` header before
     * prompting. A name match is only a candidate; returning false here keeps
     * polling so a stale or mid-auth cookie never triggers a false prompt.
     */
    validateSession?: (cookieHeader: string) => Promise<boolean>;
  }): Promise<{ ok: boolean; cookie?: string; cancelled?: boolean; error?: string }> {
    // The caller (renderer) opens the browser-overlay drawer; we just create the
    // login tab in it and capture cookies — presentation is the renderer's call.
    let tabId: string;
    try {
      tabId = (await this.host.createTab({ url: opts.loginUrl, activate: true })).tabId;
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? "Failed to open login tab" };
    }

    return await new Promise((resolve) => {
      let settled = false;
      let confirming = false;
      let validating = false;
      let session: Electron.Session | null = null;
      const ignoredHeaders = new Set<string>();
      // Cookie values proven NOT to be a live session (stale / mid-auth). Cached
      // so a failed `validateSession` isn't re-run every poll tick — a real
      // login changes the value, which re-triggers the check.
      const invalidHeaders = new Set<string>();
      const onChanged = (): void => {
        void tryCapture();
      };
      const finish = (result: {
        ok: boolean;
        cookie?: string;
        cancelled?: boolean;
        error?: string;
      }): void => {
        if (settled) return;
        settled = true;
        this.activeLoginCancel = null;
        this.cancelLoginConfirmations();
        clearInterval(timer);
        clearTimeout(timeout);
        session?.cookies.removeListener("changed", onChanged);
        if (this.host.findTab(tabId)) void this.host.closeTab(tabId).catch(() => {});
        resolve(result);
      };
      // Let an external signal (e.g. the user closing the overlay) cancel the
      // in-flight capture instead of waiting out the timeout.
      this.activeLoginCancel = () => finish({ ok: false, cancelled: true });
      const tryCapture = async (): Promise<void> => {
        if (settled) return;
        const tab = this.host.findTab(tabId);
        if (!tab || tab.isDestroyed()) {
          finish({ ok: false, cancelled: true });
          return;
        }
        if (!tab.isAttached()) return;
        try {
          const ses = tab.webContents.session;
          if (!session) {
            session = ses;
            session.cookies.on("changed", onChanged);
          }
          const cookies = await ses.cookies.get({ url: opts.cookieUrl });
          if (!cookies.some((c) => opts.authCookiePattern.test(c.name))) return;
          const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
          if (
            !header ||
            ignoredHeaders.has(header) ||
            invalidHeaders.has(header) ||
            confirming ||
            validating
          )
            return;
          // A matching cookie name is only a candidate. Providers that can verify
          // a live session gate on it here so a stale/mid-auth cookie never
          // triggers a false "Found a signed-in session" prompt.
          if (opts.validateSession) {
            validating = true;
            try {
              const live = await opts.validateSession(header);
              validating = false;
              if (settled) return;
              if (!live) {
                invalidHeaders.add(header);
                return;
              }
            } catch {
              // Transient probe failure — don't poison this value; a later tick
              // retries (serialized by `validating`, so no request pile-up).
              validating = false;
              return;
            }
          }
          confirming = true;
          const action = await this.confirmLoginCookies(opts.providerLabel ?? "provider");
          confirming = false;
          if (action === "use") {
            finish({ ok: true, cookie: header });
            return;
          }
          if (action === "change") {
            ignoredHeaders.add(header);
            await this.clearLoginCookies(opts).catch(() => {});
            await tab.loadURL(opts.loginUrl).catch(() => {});
            return;
          }
          finish({ ok: false, cancelled: true });
        } catch {
          // webContents not ready / transient — keep polling
        }
      };
      const timer = setInterval(() => void tryCapture(), 1_000);
      const timeout = setTimeout(
        () => finish({ ok: false, error: "Login timed out" }),
        opts.timeoutMs,
      );
      void tryCapture();
    });
  }

  /**
   * Like {@link captureLoginCookies}, but for providers that store their session
   * in `localStorage` rather than a cookie (e.g. Factory/Droid keeps WorkOS
   * AuthKit tokens there and sets no session cookie). Opens the login tab, polls
   * the page's localStorage for `keys`, and prompts once `requiredKey` is
   * present and non-empty. Resolves with the captured key→value map. Reads names
   * the caller asked for only; never touches secrets beyond returning them.
   */
  async captureLoginLocalStorage(opts: {
    loginUrl: string;
    keys: string[];
    requiredKey: string;
    timeoutMs: number;
    providerLabel?: string;
  }): Promise<{
    ok: boolean;
    values?: Record<string, string>;
    cancelled?: boolean;
    error?: string;
  }> {
    let tabId: string;
    try {
      tabId = (await this.host.createTab({ url: opts.loginUrl, activate: true })).tabId;
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? "Failed to open login tab" };
    }

    return await new Promise((resolve) => {
      let settled = false;
      let confirming = false;
      const ignoredSignatures = new Set<string>();
      const finish = (result: {
        ok: boolean;
        values?: Record<string, string>;
        cancelled?: boolean;
        error?: string;
      }): void => {
        if (settled) return;
        settled = true;
        this.activeLoginCancel = null;
        this.cancelLoginConfirmations();
        clearInterval(timer);
        clearTimeout(timeout);
        if (this.host.findTab(tabId)) void this.host.closeTab(tabId).catch(() => {});
        resolve(result);
      };
      this.activeLoginCancel = () => finish({ ok: false, cancelled: true });

      const readLocalStorage = async (tab: BrowserTab): Promise<Record<string, string>> => {
        // Read only the requested keys from the page's own localStorage. JSON in,
        // JSON out so the value survives the IPC boundary unchanged.
        const code =
          `(() => { try { const out = {}; for (const k of ${JSON.stringify(opts.keys)}) {` +
          ` const v = window.localStorage.getItem(k); if (v != null) out[k] = v; }` +
          ` return JSON.stringify(out); } catch { return "{}"; } })()`;
        const raw = (await tab.webContents.executeJavaScript(code, true)) as unknown;
        if (typeof raw !== "string") return {};
        try {
          const parsed = JSON.parse(raw) as unknown;
          return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
        } catch {
          return {};
        }
      };

      const tryCapture = async (): Promise<void> => {
        if (settled || confirming) return;
        const tab = this.host.findTab(tabId);
        if (!tab || tab.isDestroyed()) {
          finish({ ok: false, cancelled: true });
          return;
        }
        if (!tab.isAttached()) return;
        try {
          const values = await readLocalStorage(tab);
          const required = values[opts.requiredKey];
          if (!required) return;
          const signature = JSON.stringify(values);
          if (ignoredSignatures.has(signature)) return;
          confirming = true;
          const action = await this.confirmLoginCookies(opts.providerLabel ?? "provider");
          confirming = false;
          if (settled) return;
          if (action === "use") {
            finish({ ok: true, values });
            return;
          }
          if (action === "change") {
            ignoredSignatures.add(signature);
            await tab.loadURL(opts.loginUrl).catch(() => {});
            return;
          }
          finish({ ok: false, cancelled: true });
        } catch {
          // page not ready / mid-navigation — keep polling
        }
      };

      const timer = setInterval(() => void tryCapture(), 1_000);
      const timeout = setTimeout(
        () => finish({ ok: false, error: "Login timed out" }),
        opts.timeoutMs,
      );
      void tryCapture();
    });
  }

  private async confirmLoginCookies(providerLabel: string): Promise<UsageLoginConfirmationAction> {
    if (!this.host.hasHostWindow()) return "cancel";
    const requestId = `usage-login-${randomUUID()}`;
    return await new Promise((resolve) => {
      const finish = (action: UsageLoginConfirmationAction): void => {
        const pending = this.pendingLoginConfirmations.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pendingLoginConfirmations.delete(requestId);
        resolve(action);
      };
      const timeout = setTimeout(() => {
        this.host.emit({ type: "usage-login-confirmation-closed", requestId });
        finish("cancel");
      }, LOGIN_CONFIRMATION_TIMEOUT_MS);
      this.pendingLoginConfirmations.set(requestId, { timeout, resolve: finish });
      this.host.emit({
        type: "usage-login-confirmation",
        request: { requestId, providerLabel },
      });
    });
  }

  resolveUsageLoginConfirmation(payload: {
    requestId: string;
    action: UsageLoginConfirmationAction;
  }): void {
    this.pendingLoginConfirmations.get(payload.requestId)?.resolve(payload.action);
  }

  showUsageLoginDeviceCode(deviceCode: UsageLoginDeviceCode): void {
    this.host.emit({ type: "usage-login-device-code", deviceCode });
  }

  clearUsageLoginDeviceCode(providerId: string): void {
    this.host.emit({ type: "usage-login-device-code-cleared", providerId });
  }

  cancelLoginConfirmations(): void {
    for (const requestId of [...this.pendingLoginConfirmations.keys()]) {
      this.host.emit({ type: "usage-login-confirmation-closed", requestId });
      this.pendingLoginConfirmations.get(requestId)?.resolve("cancel");
    }
  }

  async clearLoginCookies(opts: { cookieUrl: string; authCookiePattern: RegExp }): Promise<void> {
    const ses = electronSession.fromPartition(BROWSER_SESSION_PARTITION);
    const cookies = await ses.cookies.get({ url: opts.cookieUrl });
    await Promise.all(
      cookies
        .filter((c) => opts.authCookiePattern.test(c.name))
        .map((c) => ses.cookies.remove(opts.cookieUrl, c.name).catch(() => {})),
    );
  }

  /** Cancel an in-flight `captureLoginCookies` (e.g. user closed the overlay). */
  cancelLoginCapture(): void {
    this.activeLoginCancel?.();
  }
}
