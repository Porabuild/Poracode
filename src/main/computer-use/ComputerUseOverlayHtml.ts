export const COMPUTER_USE_OVERLAY_TITLE = "Poracode Computer Use Overlay";

/**
 * The badge's exit link navigates to this URL in a new window so the main
 * process can intercept it in `setWindowOpenHandler` — the page itself stays a
 * sandboxed data: URL with no preload and no privileged API.
 */
export const OVERLAY_EXIT_URL = "poracode-computer-use-overlay://exit";

const TAKEOVER_OVERLAY_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="dark">
    <title>${COMPUTER_USE_OVERLAY_TITLE}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        background: rgba(8, 12, 20, 0.03);
        box-shadow:
          inset 0 0 0 2px rgba(92, 167, 255, 0.6),
          inset 0 0 48px rgba(92, 167, 255, 0.08);
      }
      .badge {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 14px;
        border: 1px solid rgba(92, 167, 255, 0.7);
        border-top: 0;
        border-radius: 0 0 12px 12px;
        background: rgba(8, 12, 20, 0.92);
        color: #f7f9fc;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div class="badge">Poracode using your computer | Esc to Exit</div>
  </body>
</html>`;

export const TAKEOVER_OVERLAY_URL = `data:text/html;charset=utf-8,${encodeURIComponent(TAKEOVER_OVERLAY_HTML)}`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The badge window is sized and positioned by the main process to hug this
 * chip, so the chip fills the window: every pixel of it is visible, and the
 * window can take mouse events without swallowing clicks on invisible space.
 */
export function createBadgeOverlayUrl(target?: string): string {
  const label = target
    ? `Poracode is controlling ${escapeHtml(target)} in the background`
    : "Poracode is controlling an app in the background";
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="dark">
    <title>${COMPUTER_USE_OVERLAY_TITLE}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      .badge {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 100%;
        padding: 0 8px 0 14px;
        border: 1px solid rgba(92, 167, 255, 0.65);
        border-radius: 10px;
        background: rgba(8, 12, 20, 0.9);
        color: #f7f9fc;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        font: 600 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: default;
        user-select: none;
      }
      .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .exit {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        color: rgba(247, 249, 252, 0.6);
        font: 400 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
      .exit:hover { background: rgba(92, 167, 255, 0.25); color: #f7f9fc; }
    </style>
  </head>
  <body>
    <div class="badge">
      <span class="label">${label}</span>
      <a class="exit" href="${OVERLAY_EXIT_URL}" target="_blank" title="Exit computer use" aria-label="Exit computer use">&#10005;</a>
    </div>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
