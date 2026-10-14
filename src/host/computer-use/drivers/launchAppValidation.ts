export function validateWindowsLaunchAppInput(app: string): void {
  if (app.trim().length === 0 || app.includes("\0")) throw new Error("app is required");
  if (/^\\\\/.test(app)) throw new Error("UNC paths are not allowed for launch_app.");
  const isShellAppsFolder = /^shell:AppsFolder\\/i.test(app);
  const isDrivePath = /^[A-Za-z]:[\\/]/.test(app);
  if (!isShellAppsFolder && !isDrivePath && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(app)) {
    throw new Error("URL schemes are not allowed for launch_app.");
  }
  if (!isShellAppsFolder && !isDrivePath && /[\\/]/.test(app)) {
    throw new Error("Relative paths are not allowed for launch_app.");
  }
}
