import { shell, systemPreferences, type WebContents, type Session } from "electron";

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

const SESSIONS_WITH_WEBAUTHN_ACCOUNT_HANDLER = new WeakSet<Session>();

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

// Granting Chromium's "media" permission is not enough on macOS: microphone
// capture is also gated by the OS-level TCC grant, which is a separate layer.
// Without it getUserMedia resolves but yields a silent (all-zero) audio track
// and no system prompt appears. Drive the OS prompt from the main process so
// recording works regardless of how the Electron/Chromium getUserMedia path
// happens to handle TCC. macOS-only; other platforms have no such gate.
async function ensureMacMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== "darwin") {
    return true;
  }
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") {
    return true;
  }
  // "denied"/"restricted" won't re-open the system alert — the user must change
  // it in System Settings (or it's blocked by MDM/policy) — so report the
  // denial rather than silently hanging.
  if (status === "denied" || status === "restricted") {
    console.error(
      `[lightcode][mic] OS microphone access is "${status}"; not prompting (change in System Settings › Privacy & Security › Microphone)`,
    );
    return false;
  }
  try {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    console.error(`[lightcode][mic] OS prompt result: ${granted ? "granted" : "denied"}`);
    return granted;
  } catch (error) {
    console.error("[lightcode][mic] askForMediaAccess(microphone) failed", error);
    return false;
  }
}

// Deep-link to the OS microphone privacy pane so a user who previously denied
// access can re-enable it. macOS won't re-prompt once denied, and the
// Microphone pane has no "add app" affordance, so deep-linking is the only
// recovery path. No universal scheme exists on Linux.
const MICROPHONE_SETTINGS_URL: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  win32: "ms-settings:privacy-microphone",
};

export async function openMicrophoneSettings(): Promise<void> {
  const url = MICROPHONE_SETTINGS_URL[process.platform];
  if (!url) {
    return;
  }
  await shell.openExternal(url);
}

export function installSessionPermissions(session: Session): void {
  installWebAuthnAccountHandler(session);
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!isPermissionAllowed(webContents, permission)) {
      callback(false);
      return;
    }
    if (permission === "media") {
      void ensureMacMicrophoneAccess().then(callback);
      return;
    }
    callback(true);
  });
  session.setPermissionCheckHandler((webContents, permission) =>
    isPermissionAllowed(webContents, permission),
  );
}

function installWebAuthnAccountHandler(session: Session): void {
  if (SESSIONS_WITH_WEBAUTHN_ACCOUNT_HANDLER.has(session)) {
    return;
  }
  SESSIONS_WITH_WEBAUTHN_ACCOUNT_HANDLER.add(session);
  session.on("select-webauthn-account", (_event, details, callback) => {
    callback(details.accounts[0]?.credentialId ?? null);
  });
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
