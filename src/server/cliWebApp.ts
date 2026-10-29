import { spawn } from "node:child_process";
import { win32 } from "node:path";
import type { RemoteAccessServer, RemoteAccessServerInfo } from "@/host/remote/RemoteAccessServer";

const BROWSER_ENVIRONMENT = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "SYSTEMDRIVE",
  "COMSPEC",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "HOME",
  "TEMP",
  "TMP",
  "TMPDIR",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "XDG_RUNTIME_DIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_DATA_DIRS",
  "XDG_CURRENT_DESKTOP",
  "DESKTOP_SESSION",
  "DBUS_SESSION_BUS_ADDRESS",
  "LANG",
  "LC_ALL",
]);

async function openBrowser(
  url: string,
  signal: AbortSignal,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const browserEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => BROWSER_ENVIRONMENT.has(key.toUpperCase())),
  );
  let command: string;
  let args: string[];
  if (platform === "win32") {
    const systemRoot = Object.entries(browserEnv).find(
      ([key]) => key.toUpperCase() === "SYSTEMROOT",
    )?.[1];
    if (!systemRoot) throw new Error("Windows system directory is unavailable.");
    command = win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    // Only base64 data enters the fixed script; URL characters never become PowerShell syntax.
    const script =
      "$ErrorActionPreference='Stop'; Start-Process -FilePath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
      Buffer.from(url).toString("base64") +
      "')))";
    args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ];
  } else if (platform === "darwin") {
    command = "/usr/bin/open";
    args = [url];
  } else if (platform === "linux") {
    command = "xdg-open";
    args = [url];
  } else {
    throw new Error("No browser launcher is available on this platform.");
  }
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: browserEnv, stdio: "ignore", windowsHide: true });
    let failed = false;
    const cancel = () => {
      failed = true;
      child.kill();
    };
    const timer = setTimeout(cancel, 10_000);
    timer.unref();
    signal.addEventListener("abort", cancel, { once: true });
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      // Wait for the opener to close, including after cancellation. Never
      // return child errors: they can contain the private pairing URL.
      if (failed || code !== 0) reject(new Error("The browser launcher did not confirm success."));
      else resolve();
    });
    if (signal.aborted) cancel();
  });
}

export async function openServerWebApp(input: {
  readonly server: Pick<
    RemoteAccessServer,
    "issueIndependentPairingGrant" | "revokePairingCredentialById"
  >;
  readonly info: Pick<RemoteAccessServerInfo, "localHttpBaseUrl" | "loopbackHttpBaseUrl">;
  readonly signal: AbortSignal;
  readonly explicit: boolean;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly open?: (url: string, signal: AbortSignal) => Promise<void>;
}): Promise<string | undefined> {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  if (
    !input.explicit &&
    (env.SSH_CONNECTION ||
      env.SSH_CLIENT ||
      env.SSH_TTY ||
      (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY))
  ) {
    return "Browser opening skipped in this headless session. Use pair --json with the same --base-dir and a secured reachable endpoint or SSH tunnel.";
  }
  input.signal.throwIfAborted();
  let grant: ReturnType<typeof input.server.issueIndependentPairingGrant> | undefined;
  try {
    grant = input.server.issueIndependentPairingGrant({
      preset: "operator",
      label: "Local web app",
      ttlMs: 60_000,
    });
    // Open the bundled client on the actual local listener, even when pairing
    // links normally target a hosted app or an advertised/relay endpoint.
    const url = new URL(input.info.loopbackHttpBaseUrl ?? input.info.localHttpBaseUrl);
    const pairing = new URL(grant.pairingUrl);
    url.hash = pairing.hash;
    await (input.open ?? ((value, signal) => openBrowser(value, signal, platform, env)))(
      url.toString(),
      input.signal,
    );
    input.signal.throwIfAborted();
    return undefined;
  } catch {
    let cleanupUnconfirmed = false;
    try {
      if (grant) input.server.revokePairingCredentialById(grant.id);
    } catch {
      cleanupUnconfirmed = true;
    }
    input.signal.throwIfAborted();
    return (
      "Could not open the web app automatically; the server is still running. Use pair --json with the same --base-dir for a fresh one-time link." +
      (cleanupUnconfirmed
        ? " Revocation of the unused one-minute browser grant was not confirmed; inspect pairings list."
        : "")
    );
  }
}
