import { createCipheriv } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const command = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());
vi.mock("node:child_process", () => ({ execFile: command }));
import {
  decryptChromiumLinuxCbc,
  deriveChromiumCbcKey,
  readChromiumKeychainPassword,
  readChromiumKeyringPassword,
} from "./chromiumImportCrypto";

beforeEach(() => {
  command.mockReset();
});
const chrome = {
  application: "chrome",
  walletFolder: "Chrome Keys",
  walletKey: "Chrome Safe Storage",
};

describe("Chromium native secret readers", () => {
  it("reads only the selected macOS service and preserves password whitespace", async () => {
    command.mockImplementation((_cmd, _args, _options, callback) => {
      (callback as (error: Error | null, result: string) => void)(null, " fixture-secret \n");
    });
    expect(await readChromiumKeychainPassword("Brave Safe Storage")).toBe(" fixture-secret ");
    expect(command.mock.calls[0]?.slice(0, 2)).toEqual([
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", "Brave Safe Storage"],
    ]);
  });

  it("uses Secret Service without probing KWallet when it succeeds", async () => {
    command.mockImplementation((_cmd, _args, _options, callback) => {
      (callback as (error: Error | null, result: string) => void)(null, "fixture-secret\n");
    });
    expect(await readChromiumKeyringPassword(chrome)).toBe("fixture-secret");
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0]?.slice(0, 2)).toEqual([
      "secret-tool",
      ["lookup", "application", "chrome"],
    ]);
  });

  it("falls back to read-only KDE wallet queries without creating keys", async () => {
    command.mockImplementation((cmd, _args, _options, callback) => {
      const reply = callback as (error: Error | null, result: string) => void;
      if (cmd === "secret-tool") reply(new Error("Secret Service unavailable"), "");
      else reply(null, cmd === "dbus-send" ? "kdewallet\n" : "wallet-secret\n");
    });
    expect(await readChromiumKeyringPassword(chrome)).toBe("wallet-secret");
    expect(command.mock.calls.map((args) => args.slice(0, 2))).toEqual([
      ["secret-tool", ["lookup", "application", "chrome"]],
      [
        "dbus-send",
        [
          "--session",
          "--print-reply=literal",
          "--dest=org.kde.kwalletd6",
          "/modules/kwalletd6",
          "org.kde.KWallet.networkWallet",
        ],
      ],
      [
        "kwallet-query",
        ["--read-password", "Chrome Safe Storage", "--folder", "Chrome Keys", "kdewallet"],
      ],
    ]);
  });

  it("reports an unavailable key without disclosing native stderr", async () => {
    command.mockImplementation((_cmd, _args, _options, callback) => {
      (callback as (error: Error | null, result: string) => void)(
        new Error("private native details"),
        "",
      );
    });
    await expect(readChromiumKeyringPassword(chrome)).rejects.toThrow(
      "Browser safe-storage key is unavailable.",
    );
    expect(command).toHaveBeenCalledTimes(4);
  });

  it("retains Chromium's Linux empty-password compatibility key", () => {
    const key = Buffer.from("d0d0ec9c7d77d43ac54187fa4818d17f", "hex");
    expect(deriveChromiumCbcKey("", "linux")).toEqual(key);
    const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
    const encrypted = Buffer.concat([cipher.update("legacy-value", "utf8"), cipher.final()]);
    expect(
      decryptChromiumLinuxCbc(encrypted, deriveChromiumCbcKey("wrong-key", "linux")).toString(),
    ).toBe("legacy-value");
    expect(decryptChromiumLinuxCbc(encrypted, null).toString()).toBe("legacy-value");
  });
});
