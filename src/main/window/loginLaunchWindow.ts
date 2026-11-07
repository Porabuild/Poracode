// Windows Explorer launches login apps one at a time and waits for each to
// settle before starting the next. A start-minimized login launch therefore
// creates no renderer up front: the window is created on first use — tray,
// notification, quick composer, second instance, remote thread command,
// browser automation — or once the login rush has passed, so later opens
// stay fast and renderer-localized notifications resume.
export const LOGIN_LAUNCH_WINDOW_DELAY_MS = 60_000;

export function deferLoginLaunchWindow(
  createHiddenWindow: () => void,
  isQuitting: () => boolean,
  delayMs: number = LOGIN_LAUNCH_WINDOW_DELAY_MS,
): void {
  setTimeout(() => {
    if (!isQuitting()) createHiddenWindow();
  }, delayMs);
}
