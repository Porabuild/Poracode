import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  parseAntigravityAcpCredentials,
  readAntigravityAcpCredsFromMacKeychain,
  readAntigravityAcpKeychainFingerprint,
  resetAntigravityAcpCredentialStateForTests,
  resolveAntigravityAcpCredentials,
} from "./antigravityAcpCredentials";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const { execFileMock } = vi.hoisted(() => {
  type SecurityCall = (
    file: string,
    args: string[],
    options: object,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => void;
  const fn = vi.fn<SecurityCall>(() => {});
  // The reader does `promisify(execFile)`; mirror Node's own execFile contract
  // of resolving `{ stdout, stderr }` via the custom-promisify symbol.
  Object.defineProperty(fn, Symbol.for("nodejs.util.promisify.custom"), {
    value: (file: string, args: string[], options: object) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        fn(file, args, options, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        });
      }),
    configurable: true,
  });
  return { execFileMock: fn };
});

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: execFileMock,
}));

const VALID = JSON.stringify({
  client_id: "client-id",
  client_secret: "client-secret",
  refresh_token: "refresh-token",
  token_uri: ANTIGRAVITY_GOOGLE_TOKEN_URI,
  project_id: "project-id",
});

describe("parseAntigravityAcpCredentials", () => {
  it("parses the official ACP token artifact", () => {
    expect(parseAntigravityAcpCredentials(VALID)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
  });

  it("rejects malformed credentials and non-Google token destinations", () => {
    expect(parseAntigravityAcpCredentials("not json")).toBeUndefined();
    expect(parseAntigravityAcpCredentials("null")).toBeUndefined();
    expect(parseAntigravityAcpCredentials("[]")).toBeUndefined();
    expect(
      parseAntigravityAcpCredentials(
        JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          refresh_token: "refresh-token",
          token_uri: "https://example.com/token",
        }),
      ),
    ).toBeUndefined();
  });
});

describe("resolveAntigravityAcpCredentials", () => {
  it("prefers the OS keychain item without touching the file or WSL", async () => {
    const readNative = vi.fn<() => Promise<string | undefined>>();
    const readWsl = vi.fn<() => Promise<string | undefined>>();
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => VALID,
      readKeychainFingerprint: async () => "keychain-source",
      readNative,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(credentials?.keychainFingerprint).toBe("keychain-source");
    expect(readNative).not.toHaveBeenCalled();
    expect(readWsl).not.toHaveBeenCalled();
  });

  it("falls back to the native file when the keychain has no usable item", async () => {
    const readWsl = vi.fn<() => Promise<string | undefined>>();
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => "not json",
      readKeychainFingerprint: async () => "keychain-source",
      readNative: async () => VALID,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(credentials?.keychainFingerprint).toBeUndefined();
    expect(readWsl).not.toHaveBeenCalled();
  });

  it("falls back to the gated WSL credential sweep", async () => {
    const readWsl = vi.fn<() => Promise<string | undefined>>().mockResolvedValue(VALID);
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => undefined,
      readNative: async () => undefined,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(readWsl).toHaveBeenCalledOnce();
  });

  it("continues to the file sources when a credential store throws", async () => {
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => {
        throw new Error("Credential store unavailable");
      },
      readNative: async () => VALID,
      readWsl: async () => undefined,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
  });

  it("keeps a grant process-local when its item is replaced during authorization", async () => {
    let fingerprint = "original-source";
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychainFingerprint: async () => fingerprint,
      readKeychain: async () => {
        fingerprint = "replacement-source";
        return VALID;
      },
      readNative: async () => undefined,
      readWsl: async () => undefined,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(credentials?.keychainFingerprint).toBeUndefined();
  });
});

/** Stub the `security` CLI behind the promisified execFile the reader captured. */
function mockSecurity(impl: (callback: ExecFileCallback) => void): void {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    impl(callback);
  });
}

function securityError(message: string, code: number): Error {
  return Object.assign(new Error(message), { code });
}

describe("readAntigravityAcpCredsFromMacKeychain", () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  const usePlatform = (platform: string): void => {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
  };

  beforeEach(() => {
    resetAntigravityAcpCredentialStateForTests();
    execFileMock.mockReset();
    usePlatform("darwin");
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("returns the secret blob on a granted read", async () => {
    mockSecurity((callback) => callback(null, `${VALID}\n`, ""));
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBe(VALID);
    expect(execFileMock).toHaveBeenCalledOnce();
  });

  it("keeps retrying when the item is missing — that failure never showed a dialog", async () => {
    let calls = 0;
    mockSecurity((callback) => {
      calls += 1;
      callback(securityError("The specified item could not be found", 44), "", "");
    });
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it.each([
    securityError("User canceled", 128),
    securityError("Authorization denied", 51),
    Object.assign(new Error("Command timed out"), { killed: true, signal: "SIGTERM" }),
  ])("suppresses later prompts for the launch after $message", async (error) => {
    vi.useFakeTimers();
    let calls = 0;
    mockSecurity((callback) => {
      calls += 1;
      callback(error, "", "");
    });
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    // The old one-minute backoff allowed every normal refresh to prompt again.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(calls).toBe(1);

    resetAntigravityAcpCredentialStateForTests();
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("shares a pending authorization across overlapping refreshes", async () => {
    const grant = Promise.withResolvers<ExecFileCallback>();
    mockSecurity((callback) => grant.resolve(callback));
    const first = readAntigravityAcpCredsFromMacKeychain();
    const callback = await grant.promise;
    const second = readAntigravityAcpCredsFromMacKeychain();
    expect(execFileMock).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/security",
      ["find-generic-password", "-a", "antigravity-acp", "-w", "-s", "gemini"],
      { timeout: 120_000, encoding: "utf8" },
      expect.any(Function),
    );
    callback(null, VALID, "");
    await expect(Promise.all([first, second])).resolves.toEqual([VALID, VALID]);
  });

  it("resolves undefined off-platform without spawning security", async () => {
    usePlatform("linux");
    mockSecurity((callback) => callback(null, VALID, ""));
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    await expect(readAntigravityAcpKeychainFingerprint()).resolves.toBeUndefined();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("checks source identity using attributes without requesting password data", async () => {
    const metadata = [
      'keychain: "/test/login.keychain-db"',
      '    "cdat"<timedate>=0x32303236 "20260901000000Z"',
      '    "mdat"<timedate>=0x32303236 "20260901000001Z"',
    ].join("\n");
    mockSecurity((callback) => callback(null, metadata, ""));
    const fingerprint = await readAntigravityAcpKeychainFingerprint();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(execFileMock).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/security",
      ["find-generic-password", "-a", "antigravity-acp", "-s", "gemini"],
      { timeout: 5_000, encoding: "utf8" },
      expect.any(Function),
    );
    mockSecurity((callback) => callback(null, metadata.replace("000001Z", "000002Z"), ""));
    const replacement = await readAntigravityAcpKeychainFingerprint();
    expect(replacement).not.toBe(fingerprint);
  });

  it("does not fingerprint a missing item or malformed attributes", async () => {
    mockSecurity((callback) => callback(null, "attributes unavailable", ""));
    await expect(readAntigravityAcpKeychainFingerprint()).resolves.toBeUndefined();
    mockSecurity((callback) => callback(securityError("Missing", 44), "", ""));
    await expect(readAntigravityAcpKeychainFingerprint()).resolves.toBeUndefined();
  });
});
