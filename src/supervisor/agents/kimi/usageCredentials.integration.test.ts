import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpClient } from "@poracode/agents-usage";
import { refreshRejectedKimiToken, resolveKimiToken } from "./usageCredentials";

const fixture = vi.hoisted(() => ({
  files: new Map<string, string>(),
  request: vi.fn<HttpClient["request"]>(),
  lock: vi.fn<(path: string, options: unknown) => Promise<() => Promise<void>>>(),
  write: vi.fn<(path: string, content: string, options: unknown) => void>(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn<(path: string) => Promise<string>>(async (path) => {
    const content = fixture.files.get(path);
    if (content === undefined)
      throw Object.assign(new Error("missing fixture"), { code: "ENOENT" });
    return content;
  }),
  mkdir: vi.fn<() => Promise<void>>(async () => undefined),
  writeFile: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock("proper-lockfile", () => ({ default: { lock: fixture.lock } }));
vi.mock("@/shared/atomicFile", () => ({ writeFileAtomic: fixture.write }));
vi.mock("../../runtime/usageHttpClient", () => ({
  createNodeHttpClient: () => ({ request: fixture.request }),
}));

const HOME = join("fixture", "kimi-home");
const NOW = 1_800_000_000_000;
const KEY = "kimi-code-env-0123456789abcdef";
const credentialPath = (key = KEY) => join(HOME, "credentials", key + ".json");
const credential = (access = "fresh-access", expiresAt = NOW + 3_600_000) =>
  JSON.stringify({
    access_token: access,
    refresh_token: "fixture-refresh",
    expires_at: expiresAt / 1000,
    expires_in: 3600,
    token_type: "Bearer",
    scope: "coding",
  });

function configure(region: "global" | "mainland-cn" = "global", key = KEY) {
  const suffix = region === "global" ? "ai" : "com";
  fixture.files.set(
    join(HOME, "config.toml"),
    [
      '[providers."managed:kimi-code"]',
      'type = "kimi"',
      'api_key = "oauth-managed"',
      'base_url = "https://api.kimi.' + suffix + '/coding/v1"',
      '[providers."managed:kimi-code".oauth]',
      'storage = "file"',
      'key = "oauth/' + key + '"',
      'oauth_host = "https://auth.kimi.' + suffix + '"',
    ].join("\n"),
  );
  fixture.files.set(credentialPath(key), credential());
  fixture.files.set(join(HOME, "device_id"), "fixture-device");
}

beforeEach(() => {
  fixture.files.clear();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("KIMI_CODE_HOME", HOME);
  vi.stubEnv("KIMI_CODE_API_KEY", "");
  vi.stubEnv("KIMI_CODE_BASE_URL", "");
  fixture.lock.mockResolvedValue(async () => undefined);
  fixture.write.mockImplementation((path: string, content: string) => {
    fixture.files.set(path, content);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Kimi CLI usage credentials", () => {
  it.each(["global", "mainland-cn"] as const)(
    "uses the configured %s identity instead of an unrelated legacy login",
    async (region) => {
      configure(region);
      fixture.files.set(credentialPath("kimi-code"), credential("wrong-account"));
      const token = await resolveKimiToken();
      expect(token?.accessToken).toBe("fresh-access");
      expect(token?.raw?.baseUrl).toBe(
        "https://api.kimi." + (region === "global" ? "ai" : "com") + "/coding/v1",
      );
      expect(fixture.request).not.toHaveBeenCalled();
      expect(fixture.write).not.toHaveBeenCalled();
    },
  );

  it("retains compatibility with the legacy credential and region marker", async () => {
    fixture.files.set(credentialPath("kimi-code"), credential("legacy-access"));
    fixture.files.set(join(HOME, "region"), "global\n");
    const token = await resolveKimiToken();
    expect(token?.accessToken).toBe("legacy-access");
    expect(token?.raw?.baseUrl).toBe("https://api.kimi.ai/coding/v1");
  });

  it("refreshes an expired global login without asking the user to sign in", async () => {
    configure();
    fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
    fixture.request.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: "renewed-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    });
    const token = await resolveKimiToken();
    expect(token?.accessToken).toBe("renewed-access");
    expect(fixture.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://auth.kimi.ai/api/oauth/token",
        redirect: "manual",
      }),
    );
    const persisted = JSON.parse(fixture.files.get(credentialPath())!);
    expect(persisted.refresh_token).toBe("rotated-refresh");
    expect(persisted.expires_at).toBe(NOW / 1000 + 3600);
    expect(persisted.scope).toBe("coding");
  });

  it("does not treat a temporary refresh outage as logout or rewrite credentials", async () => {
    configure();
    const original = credential("expired-access", NOW - 1);
    fixture.files.set(credentialPath(), original);
    fixture.request.mockResolvedValue({ status: 503, headers: {}, body: "{}" });
    await expect(resolveKimiToken()).rejects.toThrow("HTTP 503");
    expect(fixture.files.get(credentialPath())).toBe(original);
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("never revives a login removed while a refresh request is in flight", async () => {
    configure();
    fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
    fixture.request.mockImplementation(async () => {
      fixture.files.delete(credentialPath());
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ access_token: "late-access", expires_in: 3600 }),
      };
    });
    expect(await resolveKimiToken()).toBeUndefined();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("does not fall back to a different login when the configured identity is missing", async () => {
    configure();
    fixture.files.delete(credentialPath());
    fixture.files.set(credentialPath("kimi-code"), credential("different-account"));
    expect(await resolveKimiToken()).toBeUndefined();
  });

  it.each([
    ['key = "oauth/' + KEY + '"', 'key = "oauth/../../outside"'],
    ['storage = "file"', 'storage = "keyring"'],
    ["https://api.kimi.ai/coding/v1", "https://untrusted.example/coding/v1"],
    ["https://auth.kimi.ai", "https://auth.kimi.com"],
  ])("refuses unsupported or unsafe identity configuration (%s)", async (before, after) => {
    configure();
    const path = join(HOME, "config.toml");
    fixture.files.set(path, fixture.files.get(path)!.replace(before, after));
    fixture.files.set(credentialPath("kimi-code"), credential("unrelated-legacy-account"));
    expect(await resolveKimiToken()).toBeUndefined();
    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("keeps explicit API-key overrides independent from CLI OAuth", async () => {
    configure();
    vi.stubEnv("KIMI_CODE_API_KEY", "explicit-key");
    vi.stubEnv("KIMI_CODE_BASE_URL", "https://proxy.test");
    expect(await resolveKimiToken()).toEqual({
      accessToken: "explicit-key",
      raw: { baseUrl: "https://proxy.test" },
    });
    expect(await refreshRejectedKimiToken({ accessToken: "explicit-key" })).toBeUndefined();
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("does not send CLI credentials to an endpoint supplied only by the environment", async () => {
    configure();
    vi.stubEnv("KIMI_CODE_BASE_URL", "https://proxy.test");
    expect(await resolveKimiToken()).toBeUndefined();
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("coalesces concurrent renewals and preserves an omitted refresh token", async () => {
    configure();
    fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
    fixture.request.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ access_token: "renewed-access", expires_in: 3600 }),
    });
    const tokens = await Promise.all([resolveKimiToken(), resolveKimiToken(), resolveKimiToken()]);
    expect(tokens.map((token) => token?.accessToken)).toEqual([
      "renewed-access",
      "renewed-access",
      "renewed-access",
    ]);
    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fixture.files.get(credentialPath())!).refresh_token).toBe("fixture-refresh");
  });

  it("uses a CLI refresh completed while waiting for its lock", async () => {
    configure();
    fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
    fixture.lock.mockImplementation(async () => {
      fixture.files.set(credentialPath(), credential("cli-winner"));
      return async () => undefined;
    });
    expect((await resolveKimiToken())?.accessToken).toBe("cli-winner");
    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it.each([200, 401, 503])(
    "preserves a newer CLI login after an HTTP %s refresh",
    async (status) => {
      configure();
      fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
      fixture.request.mockImplementation(async () => {
        fixture.files.set(credentialPath(), credential("new-login"));
        return {
          status,
          headers: {},
          body: JSON.stringify({ access_token: "late-access", expires_in: 3600 }),
        };
      });
      expect((await resolveKimiToken())?.accessToken).toBe("new-login");
      expect(fixture.write).not.toHaveBeenCalled();
    },
  );

  it("does not publish a refresh for an identity the user switched away from", async () => {
    configure();
    fixture.files.set(credentialPath(), credential("expired-access", NOW - 1));
    fixture.request.mockImplementation(async () => {
      configure("mainland-cn", "new-identity");
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ access_token: "late-access", expires_in: 3600 }),
      };
    });
    expect(await resolveKimiToken()).toBeUndefined();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("adopts a peer's fresh token after an API rejection without exchanging it again", async () => {
    configure();
    expect((await refreshRejectedKimiToken({ accessToken: "older-access" }))?.accessToken).toBe(
      "fresh-access",
    );
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("does not discard saved credentials when renewal is revoked", async () => {
    configure();
    const original = credential("expired-access", NOW - 1);
    fixture.files.set(credentialPath(), original);
    fixture.request.mockResolvedValue({
      status: 400,
      headers: {},
      body: JSON.stringify({ error: "invalid_grant" }),
    });
    expect(await resolveKimiToken()).toBeUndefined();
    expect(fixture.files.get(credentialPath())).toBe(original);
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it.each([{ access_token: "partial" }, { access_token: "overflow", expires_in: 1e308 }])(
    "does not publish an invalid token response (%j)",
    async (response) => {
      configure();
      const original = credential("expired-access", NOW - 1);
      fixture.files.set(credentialPath(), original);
      fixture.request.mockResolvedValue({
        status: 200,
        headers: {},
        body: JSON.stringify(response),
      });
      await expect(resolveKimiToken()).rejects.toThrow("invalid response");
      expect(fixture.files.get(credentialPath())).toBe(original);
    },
  );
});
