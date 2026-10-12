import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockExecFileCommand } from "./macKeychain.testFixtures";
import {
  readMacKeychainFingerprint,
  readMacKeychainPassword,
  resetMacKeychainStateForTests,
  writeMacKeychainPassword,
  withMacKeychainAuthorizationRetry,
} from "./macKeychain";

const security = vi.hoisted(() =>
  vi.fn<
    (file: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string }>
  >(),
);
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: (...args: Parameters<typeof security>) =>
      mockExecFileCommand(security(...args)),
  }),
}));

const ITEM = { service: "test-credentials", account: "test-user" };
const ATTRIBUTES = [
  'keychain: "/test/login.keychain-db"',
  '    "cdat"<timedate>=0x32303236 "20260901000000Z"',
  '    "mdat"<timedate>=0x32303236 "20260901000001Z"',
].join("\n");
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;

beforeEach(() => {
  resetMacKeychainStateForTests();
  security.mockReset();
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(process, "platform", platformDescriptor);
});

describe("macOS Keychain authorization", () => {
  it("lets a password answer after five seconds finish before the client is killed", async () => {
    vi.useFakeTimers();
    security.mockImplementation(
      (_file, _args, options) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Object.assign(new Error("Timed out"), { killed: true })),
            options.timeout,
          );
          setTimeout(() => {
            clearTimeout(timeout);
            resolve({ stdout: "granted-password\n" });
          }, 12_000);
        }),
    );
    const result = readMacKeychainPassword(ITEM).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await result).toEqual({ value: "granted-password" });
  });

  it("shares overlapping authorizations and reads rotated passwords fresh on later polls", async () => {
    const grant = Promise.withResolvers<{ stdout: string }>();
    security.mockReturnValueOnce(grant.promise).mockResolvedValue({ stdout: "rotated-password" });
    const first = readMacKeychainPassword(ITEM);
    const second = readMacKeychainPassword({ ...ITEM });
    expect(security).toHaveBeenCalledOnce();
    grant.resolve({ stdout: "original-password\n" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      "original-password",
      "original-password",
    ]);
    await expect(readMacKeychainPassword(ITEM)).resolves.toBe("rotated-password");
    expect(security).toHaveBeenCalledTimes(2);
  });

  it.each([
    Object.assign(new Error("User canceled"), { code: 128 }),
    Object.assign(new Error("Authorization denied"), { code: 51 }),
    Object.assign(new Error("Keychain locked"), { code: 36 }),
    Object.assign(new Error("Timed out"), { killed: true, signal: "SIGTERM" }),
  ])(
    "stops polling the denied item after $message without blocking other accounts",
    async (error) => {
      vi.useFakeTimers();
      security.mockRejectedValueOnce(error).mockResolvedValue({ stdout: "other-password" });
      await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
      await expect(readMacKeychainFingerprint(ITEM)).resolves.toBeUndefined();
      await expect(writeMacKeychainPassword(ITEM, "replacement")).rejects.toThrow("unavailable");
      expect(security).toHaveBeenCalledOnce();
      await expect(readMacKeychainPassword({ ...ITEM, account: "another-user" })).resolves.toBe(
        "other-password",
      );
      await expect(readMacKeychainPassword({ ...ITEM, service: "another-service" })).resolves.toBe(
        "other-password",
      );
      expect(security).toHaveBeenCalledTimes(3);
      resetMacKeychainStateForTests();
      await expect(readMacKeychainPassword(ITEM)).resolves.toBe("other-password");
      expect(security).toHaveBeenCalledTimes(4);
    },
  );

  it("discovers a later sign-in when a Keychain item was missing", async () => {
    security
      .mockRejectedValueOnce(Object.assign(new Error("Item missing"), { code: 44 }))
      .mockResolvedValueOnce({ stdout: "new-login-password" });
    await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    await expect(readMacKeychainPassword(ITEM)).resolves.toBe("new-login-password");
    expect(security).toHaveBeenCalledTimes(2);
  });

  it("permits one explicit retry while repeated background polls remain quiet", async () => {
    security.mockRejectedValue(Object.assign(new Error("User canceled"), { code: 128 }));
    await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    await withMacKeychainAuthorizationRetry(async () => {
      await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
      await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    });
    await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    expect(security).toHaveBeenCalledTimes(2);
    security.mockResolvedValue({ stdout: "new-login-password" });
    await expect(
      withMacKeychainAuthorizationRetry(() => readMacKeychainPassword(ITEM)),
    ).resolves.toBe("new-login-password");
    await expect(readMacKeychainPassword(ITEM)).resolves.toBe("new-login-password");
  });

  it("waits for a pending background dialog before an explicit retry", async () => {
    const pending = Promise.withResolvers<{ stdout: string }>();
    security.mockReturnValueOnce(pending.promise).mockResolvedValue({ stdout: "retried-password" });
    const background = readMacKeychainPassword(ITEM);
    await vi.waitFor(() => expect(security).toHaveBeenCalledOnce());
    const forced = withMacKeychainAuthorizationRetry(() =>
      Promise.all([readMacKeychainPassword(ITEM), readMacKeychainPassword(ITEM)]),
    );
    pending.reject(Object.assign(new Error("User canceled"), { code: 128 }));
    await expect(background).resolves.toBeUndefined();
    await expect(forced).resolves.toEqual(["retried-password", "retried-password"]);
    expect(security).toHaveBeenCalledTimes(2);
  });

  it("keeps the OS reader identity unchanged on restart or app update", async () => {
    security.mockResolvedValue({ stdout: "saved-password" });
    await expect(readMacKeychainPassword(ITEM)).resolves.toBe("saved-password");
    vi.resetModules();
    const updated = await import("./macKeychain");
    await expect(updated.readMacKeychainPassword(ITEM)).resolves.toBe("saved-password");
    expect(security).toHaveBeenCalledTimes(2);
    for (const call of security.mock.calls) {
      expect(call).toEqual([
        "/usr/bin/security",
        ["find-generic-password", "-a", ITEM.account, "-w", "-s", ITEM.service],
        { timeout: 120_000, encoding: "utf8" },
      ]);
    }
  });

  it.each(["linux", "win32"])("does not spawn macOS tools on %s", async (platform) => {
    Object.defineProperty(process, "platform", { value: platform });
    await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    await expect(readMacKeychainFingerprint(ITEM)).resolves.toBeUndefined();
    await writeMacKeychainPassword(ITEM, "password");
    expect(security).not.toHaveBeenCalled();
  });
});

describe("macOS Keychain credential compatibility", () => {
  it("preserves the pre-upgrade fingerprint used by encrypted grants", async () => {
    security.mockResolvedValue({ stdout: ATTRIBUTES });
    await expect(readMacKeychainFingerprint(ITEM)).resolves.toBe(
      "9a40de0aa1550a51cb130c002db62c234b6651a484ce111a9a655a69de03ea45",
    );
    expect(security).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-a", ITEM.account, "-s", ITEM.service],
      { timeout: 5_000, encoding: "utf8" },
    );
    security.mockResolvedValue({ stdout: ATTRIBUTES.replace("000001Z", "000002Z") });
    await expect(readMacKeychainFingerprint(ITEM)).resolves.not.toBe(
      "9a40de0aa1550a51cb130c002db62c234b6651a484ce111a9a655a69de03ea45",
    );
  });

  it("updates password data through the same OS tool without passing ACL changes", async () => {
    security.mockResolvedValue({ stdout: "" });
    await writeMacKeychainPassword(ITEM, "rotated-password");
    expect(security).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/security",
      [
        "add-generic-password",
        "-U",
        "-a",
        ITEM.account,
        "-s",
        ITEM.service,
        "-w",
        "rotated-password",
      ],
      { timeout: 120_000, encoding: "utf8" },
    );
  });

  it("does not leak a password from execFile errors or retry a denied update", async () => {
    security.mockRejectedValue(
      Object.assign(new Error("security -w secret-password"), { code: 51 }),
    );
    await expect(writeMacKeychainPassword(ITEM, "secret-password")).rejects.toThrow(
      /^Unable to update the Keychain password\.$/,
    );
    await expect(writeMacKeychainPassword(ITEM, "replacement")).rejects.toThrow("unavailable");
    await expect(readMacKeychainPassword(ITEM)).resolves.toBeUndefined();
    expect(security).toHaveBeenCalledOnce();
  });
});
