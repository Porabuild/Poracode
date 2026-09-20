import { BrowserWindow } from "electron";
import { PROMOTION_PROGRESS_THRESHOLD_BYTES } from "@/backend/ownership/hostImportFiles";
import { msg } from "@/shared/messages";

export { PROMOTION_PROGRESS_THRESHOLD_BYTES };

export interface DesktopPromotionProgressWindow {
  update(copiedBytes: number, totalBytes: number): void;
  close(): void;
}

function formatMib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * V6 C.4: a small progress window shown only when a desktop promotion copy
 * exceeds {@link PROMOTION_PROGRESS_THRESHOLD_BYTES}. Admission runs after
 * `app.whenReady`; failures to open a window never block the copy.
 *
 * The strings are cataloged in `src/shared/messages.ts` + the 12 renderer
 * catalogs; like `showUserNotificationFallback` (G2.4), main does not load the
 * renderer i18n catalogs, so this window renders the source (English) strings.
 */
export function openDesktopPromotionProgress(
  totalBytes: number,
): DesktopPromotionProgressWindow | undefined {
  if (totalBytes < PROMOTION_PROGRESS_THRESHOLD_BYTES) return undefined;
  let window: BrowserWindow;
  let ready: Promise<boolean>;
  try {
    window = new BrowserWindow({
      width: 420,
      height: 132,
      show: true,
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: msg("desktop.promotion.progress.title"),
    });
    ready = window
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><body style="font:13px sans-serif;margin:20px;color:#111">
<p>${msg("desktop.promotion.progress.body")}</p>
<p id="status">0 / ${formatMib(totalBytes)}</p>
<progress id="bar" max="${totalBytes}" value="0" style="width:100%"></progress>
</body></html>`)}`,
      )
      .then(
        () => true,
        () => false,
      );
  } catch {
    return undefined;
  }
  return {
    update(copiedBytes: number, total: number): void {
      if (window.isDestroyed()) return;
      void ready.then(async (loaded) => {
        if (!loaded || window.isDestroyed()) return;
        try {
          await window.webContents.executeJavaScript(
            `document.getElementById("bar").value=${copiedBytes};` +
              `document.getElementById("status").textContent=${JSON.stringify(
                `${formatMib(copiedBytes)} / ${formatMib(total)}`,
              )};`,
          );
        } catch {
          // The optional window may be closed while an update is in flight.
        }
      });
    },
    close(): void {
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
