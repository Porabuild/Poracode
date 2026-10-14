import { execFile } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";

export type ChromiumSecretReader = (identity: string) => Promise<string>;
export interface ChromiumKeyringIdentity {
  application: string;
  walletFolder: string;
  walletKey: string;
}
export type ChromiumKeyringReader = (identity: ChromiumKeyringIdentity) => Promise<string>;

/** Called only after the user starts an import; profile discovery never opens Keychain. */
export const readChromiumKeychainPassword: ChromiumSecretReader = (service) =>
  readSecret("/usr/bin/security", ["find-generic-password", "-w", "-s", service]);

export const readChromiumKeyringPassword: ChromiumKeyringReader = async (identity) => {
  try {
    return await readSecret("secret-tool", ["lookup", "application", identity.application]);
  } catch {
    // KDE's native wallet need not expose Secret Service. The query reads only
    // existing wallets and entries, never creating or writing a key.
    for (const version of ["6", "5", ""]) {
      try {
        const wallet = (
          await readSecret(
            "dbus-send",
            [
              "--session",
              "--print-reply=literal",
              `--dest=org.kde.kwalletd${version}`,
              `/modules/kwalletd${version}`,
              "org.kde.KWallet.networkWallet",
            ],
            5000,
          )
        ).trim();
        if (wallet)
          return await readSecret("kwallet-query", [
            "--read-password",
            identity.walletKey,
            "--folder",
            identity.walletFolder,
            wallet,
          ]);
      } catch {
        /* Try the other installed KWallet generation. */
      }
    }
    throw new Error("Browser safe-storage key is unavailable.");
  }
};

function readSecret(command: string, args: string[], timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error || !stdout) reject(new Error("Browser safe-storage key is unavailable."));
        else resolve(stdout.replace(/\r?\n$/u, ""));
      },
    );
  });
}

/** Chromium's macOS v10 and Linux v10/v11 formats use AES-128-CBC. */
export function deriveChromiumCbcKey(password: string, platform: NodeJS.Platform): Buffer {
  return pbkdf2Sync(password, "saltysalt", platform === "darwin" ? 1003 : 1, 16, "sha1");
}

export function decryptChromiumCbc(payload: Buffer, key: Buffer): Buffer {
  if (payload.length === 0 || payload.length % 16 !== 0)
    throw new Error("Invalid Chromium CBC payload");
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

/** Chromium's Linux fallback for data written before a keyring was available. */
export function decryptChromiumLinuxCbc(payload: Buffer, key: Buffer | null): Buffer {
  try {
    if (!key) throw new Error("No keyring key");
    return decryptChromiumCbc(payload, key);
  } catch {
    return decryptChromiumCbc(payload, deriveChromiumCbcKey("", "linux"));
  }
}

export function decryptChromiumGcm(payload: Buffer, key: Buffer): Buffer {
  if (payload.length < 12 + 16) throw new Error("Invalid Chromium AES-GCM payload");
  const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(payload.length - 16));
  return Buffer.concat([
    decipher.update(payload.subarray(12, payload.length - 16)),
    decipher.final(),
  ]);
}
