export const COMPUTER_USE_OVERLAY_TITLE = "Poracode Computer Use Overlay";
export const COMPUTER_USE_BADGE_BACKGROUND = "#10131a";

/**
 * The badge's exit link navigates to this URL in a new window so the main
 * process can intercept it in `setWindowOpenHandler` — the page itself stays a
 * sandboxed data: URL with no preload and no privileged API.
 */
export const OVERLAY_EXIT_URL = "poracode-computer-use-overlay://exit";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Both background and takeover overlays share the same chip window, sized and
 * positioned by the main process to hug this pill so every pixel is visible
 * and mouse events only hit the chip itself.
 */
function createOverlayChipUrl(label: string): string {
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
        border: 1px solid rgba(211, 215, 222, 0.12);
        border-radius: 12px;
        background: ${COMPUTER_USE_BADGE_BACKGROUND};
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
      .exit:hover { background: rgba(211, 215, 222, 0.16); color: #f7f9fc; }
    </style>
  </head>
  <body>
    <div class="badge">
      <span class="label">${escapeHtml(label)}</span>
      <a class="exit" href="${OVERLAY_EXIT_URL}" target="_blank" title="Exit computer use" aria-label="Exit computer use">&#10005;</a>
    </div>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export const TAKEOVER_OVERLAY_URL = createOverlayChipUrl(
  "Poracode using your computer | Esc to Exit",
);

export function createBadgeOverlayUrl(target?: string): string {
  const label = target
    ? `Poracode is controlling ${target} in the background`
    : "Poracode is controlling an app in the background";
  return createOverlayChipUrl(label);
}
