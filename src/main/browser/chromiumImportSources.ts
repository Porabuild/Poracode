import { join } from "node:path";

/** Native profile roots and key-store identities belong to the source browser. */
export const CHROMIUM_IMPORT_BROWSERS = [
  {
    id: "chrome",
    label: "Google Chrome",
    windowsPath: join("Google", "Chrome", "User Data"),
    macPath: join("Google", "Chrome"),
    linuxPath: "google-chrome",
    flatpakId: "com.google.Chrome",
    keychainService: "Chrome Safe Storage",
    keyringApplication: "chrome",
    walletFolder: "Chrome Keys",
    walletKey: "Chrome Safe Storage",
  },
  {
    id: "edge",
    label: "Microsoft Edge",
    windowsPath: join("Microsoft", "Edge", "User Data"),
    macPath: "Microsoft Edge",
    linuxPath: "microsoft-edge",
    flatpakId: "com.microsoft.Edge",
    keychainService: "Microsoft Edge Safe Storage",
    keyringApplication: "chromium",
    walletFolder: "Chromium Keys",
    walletKey: "Chromium Safe Storage",
  },
  {
    id: "brave",
    label: "Brave",
    windowsPath: join("BraveSoftware", "Brave-Browser", "User Data"),
    macPath: join("BraveSoftware", "Brave-Browser"),
    linuxPath: join("BraveSoftware", "Brave-Browser"),
    flatpakId: "com.brave.Browser",
    keychainService: "Brave Safe Storage",
    keyringApplication: "brave",
    walletFolder: "Brave Keys",
    walletKey: "Brave Safe Storage",
  },
  {
    id: "chromium",
    label: "Chromium",
    windowsPath: join("Chromium", "User Data"),
    macPath: "Chromium",
    linuxPath: "chromium",
    flatpakId: "org.chromium.Chromium",
    keychainService: "Chromium Safe Storage",
    keyringApplication: "chromium",
    walletFolder: "Chromium Keys",
    walletKey: "Chromium Safe Storage",
  },
] as const;

export type ChromiumImportBrowser = (typeof CHROMIUM_IMPORT_BROWSERS)[number];

export function chromiumProfileRoots(
  browser: ChromiumImportBrowser,
  platform: NodeJS.Platform,
  homeDirectory: string,
  localAppData: string | undefined,
  configDirectory: string,
): string[] {
  if (platform === "win32") return localAppData ? [join(localAppData, browser.windowsPath)] : [];
  if (platform === "darwin")
    return [join(homeDirectory, "Library", "Application Support", browser.macPath)];
  if (platform === "linux")
    return [
      join(configDirectory, browser.linuxPath),
      join(homeDirectory, ".var", "app", browser.flatpakId, "config", browser.linuxPath),
      ...(browser.id === "chromium"
        ? [join(homeDirectory, "snap", "chromium", "common", "chromium")]
        : []),
    ];
  return [];
}
