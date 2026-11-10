import { homedir } from "node:os";
import { join, resolve, win32 } from "node:path";

/** Shared CLI storage is separate from profiles and removable service installs. */
export function defaultCliStorageRoot({
  env = process.env,
  platform = process.platform,
  home = homedir(),
} = {}) {
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim() || win32.join(home, "AppData", "Local");
    return win32.join(localAppData, "Poracode");
  }
  return join(home, ".local", "share", "poracode");
}

export function defaultCliInstallPrefix(input = {}) {
  const env = input.env ?? process.env;
  const override = env.PORACODE_INSTALL_DIR?.trim();
  if (override) return resolve(override);
  const root = defaultCliStorageRoot(input);
  return (input.platform ?? process.platform) === "win32"
    ? win32.join(root, "server")
    : join(root, "server");
}

export function defaultCliBinDirectory({
  env = process.env,
  platform = process.platform,
  home = homedir(),
} = {}) {
  const override = env.PORACODE_BIN_DIR?.trim();
  if (override) return override;
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim() || win32.join(home, "AppData", "Local");
    return win32.join(localAppData, "Poracode", "bin");
  }
  return join(home, ".local", "bin");
}
