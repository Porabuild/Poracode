import type { WebContents, Session } from "electron";

const ALLOWED_PERMISSIONS = new Set<string>([
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

const BLOCKED_NAVIGATION_PROTOCOLS = new Set<string>([
  "file:",
  "chrome:",
  "chrome-extension:",
  "chrome-devtools:",
  "devtools:",
  "javascript:",
  "view-source:",
]);

export function isNavigationUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !BLOCKED_NAVIGATION_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isPermissionAllowed(webContents: WebContents | null, permission: string): boolean {
  if (permission === "media") {
    return webContents?.getType() === "window";
  }
  return ALLOWED_PERMISSIONS.has(permission);
}

export function installSessionPermissions(session: Session): void {
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isPermissionAllowed(webContents, permission));
  });
  session.setPermissionCheckHandler((webContents, permission) =>
    isPermissionAllowed(webContents, permission),
  );
}

export function installNavigationGuards(
  webContents: WebContents,
  onPopup: (url: string) => void,
): () => void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isNavigationUrlAllowed(url)) {
      onPopup(url);
    }
    return { action: "deny" };
  });

  const onWillNavigate = (event: Electron.Event, url: string): void => {
    if (!isNavigationUrlAllowed(url)) {
      event.preventDefault();
    }
  };
  const onWillFrameNavigate = (event: Electron.Event & { url: string }): void => {
    if (!isNavigationUrlAllowed(event.url)) {
      event.preventDefault();
    }
  };
  webContents.on("will-navigate", onWillNavigate);
  webContents.on("will-frame-navigate", onWillFrameNavigate);

  return () => {
    webContents.removeListener("will-navigate", onWillNavigate);
    webContents.removeListener("will-frame-navigate", onWillFrameNavigate);
  };
}
