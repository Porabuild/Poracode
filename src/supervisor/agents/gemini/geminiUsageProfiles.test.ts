import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_LOAD_ENDPOINT, GEMINI_QUOTA_ENDPOINT, type HostPort } from "@poracode/agents-usage";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import {
  collectGeminiProfile,
  createGeminiUsageProfileSource,
  readGeminiUsageProfiles,
} from "./geminiUsageProfiles";

describe("geminiUsageProfiles", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "poracode-gemini-usage-profile-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(rootDir, { recursive: true, force: true });
  });

  function makeSettings(): SharedSettings {
    return {
      ...defaultSharedSettings,
      agentInstances: {
        work: {
          id: "work",
          driver: "gemini",
          displayName: "Work",
          config: { homeDir: join(rootDir, "work-home") },
        },
        disabled: {
          id: "disabled",
          driver: "gemini",
          enabled: false,
          config: { homeDir: join(rootDir, "disabled-home") },
        },
        broken: {
          id: "broken",
          driver: "gemini",
          config: {},
        },
      },
    };
  }

  it("extracts enabled valid Gemini profiles and registers deterministic cache identities", async () => {
    const settings = makeSettings();
    const geminiDir = join(rootDir, "work-home", ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "oauth_creds.json"),
      JSON.stringify({
        access_token: "expired-access-token",
        refresh_token: "refresh-token",
        expiry_date: 1000,
      }),
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const profiles = readGeminiUsageProfiles(settings);
    expect([...profiles.keys()]).toEqual(["gemini:work"]);
    expect(profiles.get("gemini:work")).toEqual({
      providerId: "gemini:work",
      homeDir: join(rootDir, "work-home"),
    });

    const source = createGeminiUsageProfileSource(settings);
    expect(source.collectors).toHaveLength(1);
    expect(source.collectors[0]?.providerId).toBe("gemini:work");
    const dummyHost: HostPort = {
      http: { request: async () => ({ status: 200, headers: {}, body: "{}" }) },
      now: () => 0,
      credentials: { getOAuthToken: async () => undefined, getSecret: async () => undefined },
    };
    const id1 = await source.collectors[0]?.cacheIdentity?.(dummyHost);
    const id2 = await source.collectors[0]?.cacheIdentity?.(dummyHost);
    expect(id1).toMatch(/^[0-9a-f]{64}$/);
    expect(id2).toBe(id1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collects usage strictly from the profile homeDir oauth_creds.json", async () => {
    const profileHome = join(rootDir, "work-home");
    const geminiDir = join(profileHome, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "oauth_creds.json"),
      JSON.stringify({
        access_token: "profile-access-token",
        refresh_token: "profile-refresh-token",
        expiry_date: Date.now() + 3_600_000,
      }),
      "utf8",
    );

    const requestMock = vi.fn<
      (input: {
        url: string;
      }) => Promise<{ status: number; headers: Record<string, string>; body: string }>
    >(async ({ url }) => {
      if (url === GEMINI_LOAD_ENDPOINT) {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            paidTier: { id: "standard-tier", name: "Standard" },
            cloudaicompanionProject: "proj-work",
          }),
        };
      }
      if (url === GEMINI_QUOTA_ENDPOINT) {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            buckets: [{ modelId: "gemini-3.5-flash", remainingFraction: 0.75 }],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const host: HostPort = {
      http: { request: requestMock },
      now: () => 1_717_000_000_000,
      credentials: {
        getOAuthToken: async () => undefined,
        getSecret: async () => undefined,
      },
    };

    const snapshot = await collectGeminiProfile(
      { providerId: "gemini:work", homeDir: profileHome },
      host,
    );
    expect(snapshot.providerId).toBe("gemini:work");
    expect(snapshot.status).toBe("ok");
    expect(snapshot.plan).toBe("Gemini Code Assist (Standard)");
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer profile-access-token" }),
      }),
    );
  });
});
