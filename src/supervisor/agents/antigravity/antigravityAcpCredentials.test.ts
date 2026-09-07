import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  invalidateAntigravityAcpCredentialsCache,
  parseAntigravityAcpCredentials,
  readAntigravityAcpCredsFromMacKeychain,
  resetAntigravityAcpCredentialStateForTests,
  resolveAntigravityAcpCredentials,
  resolveAntigravityAcpCredentialsCached,
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
      readNative,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(readNative).not.toHaveBeenCalled();
    expect(readWsl).not.toHaveBeenCalled();
  });

  it("falls back to the native file when the keychain has no usable item", async () => {
    const readWsl = vi.fn<() => Promise<string | undefined>>();
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => "not json",
      readNative: async () => VALID,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
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

  it("backs off after an authorization dialog ends without a grant", async () => {
    let calls = 0;
    mockSecurity((callback) => {
      calls += 1;
      // 128 = user canceled the macOS authorization dialog.
      callback(securityError("User canceled", 128), "", "");
    });
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(calls).toBe(1);

    resetAntigravityAcpCredentialStateForTests();
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("resolves undefined off-platform without spawning security", async () => {
    usePlatform("linux");
    mockSecurity((callback) => callback(null, VALID, ""));
    await expect(readAntigravityAcpCredsFromMacKeychain()).resolves.toBeUndefined();
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("resolveAntigravityAcpCredentialsCached", () => {
  beforeEach(() => {
    resetAntigravityAcpCredentialStateForTests();
  });

  it("resolves once and serves later refresh ticks from the process cache", async () => {
    const readKeychain = vi.fn<() => Promise<string | undefined>>(async () => VALID);
    const deps = {
      readKeychain,
      readNative: async () => undefined,
      readWsl: async () => undefined,
    };
    const expected = parseAntigravityAcpCredentials(VALID);
    await expect(resolveAntigravityAcpCredentialsCached(deps)).resolves.toEqual(expected);
    await expect(resolveAntigravityAcpCredentialsCached(deps)).resolves.toEqual(expected);
    expect(readKeychain).toHaveBeenCalledOnce();
  });

  it("re-reads the OS stores after an invalidation", async () => {
    const readKeychain = vi.fn<() => Promise<string | undefined>>(async () => VALID);
    const deps = {
      readKeychain,
      readNative: async () => undefined,
      readWsl: async () => undefined,
    };
    await resolveAntigravityAcpCredentialsCached(deps);
    invalidateAntigravityAcpCredentialsCache();
    await resolveAntigravityAcpCredentialsCached(deps);
    expect(readKeychain).toHaveBeenCalledTimes(2);
  });
});
