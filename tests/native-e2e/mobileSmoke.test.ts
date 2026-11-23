import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BACKGROUND_TASK_STAGES } from "./harness/backgroundTaskLab.ts";
import {
  CHECKPOINT_FIXTURE_IDS,
  FAULT_FIXTURE_IDS,
  FRAME_FIXTURE_IDS,
} from "./harness/controlFixtures.ts";
import {
  buildPlatformPairingUrls,
  startMobileSmokeSession,
  type MobileSmokeSession,
} from "./mobileSmoke/session.ts";
import { getMobileSmokeStage, MOBILE_SMOKE_STAGES } from "./mobileSmoke/stages.ts";

describe("mobile manual smoke harness (PWA source -> iOS & Android)", () => {
  let session: MobileSmokeSession;

  beforeAll(async () => {
    session = await startMobileSmokeSession({ pwaPort: 3101 });
  });

  afterAll(async () => {
    await session.stop();
  });

  it("declares only valid allowlisted checkpoints, frames, faults, and background task stages across all stages", () => {
    const validCheckpoints = new Set<string>(CHECKPOINT_FIXTURE_IDS);
    const validFrames = new Set<string>(FRAME_FIXTURE_IDS);
    const validFaults = new Set<string>(FAULT_FIXTURE_IDS);
    const validBgStages = new Set<string>(BACKGROUND_TASK_STAGES);
    const seenIds = new Set<string>();

    expect(MOBILE_SMOKE_STAGES.length).toBeGreaterThanOrEqual(30);
    expect(getMobileSmokeStage("base")).toBeDefined();

    for (const stage of MOBILE_SMOKE_STAGES) {
      expect(seenIds.has(stage.id)).toBe(false);
      seenIds.add(stage.id);
      for (const checkpoint of stage.checkpoints ?? []) {
        expect(validCheckpoints.has(checkpoint)).toBe(true);
      }
      for (const frame of stage.frames ?? []) {
        expect(validFrames.has(frame)).toBe(true);
      }
      for (const fault of stage.faults ?? []) {
        expect(validFaults.has(fault)).toBe(true);
      }
    }
    const bgStages = MOBILE_SMOKE_STAGES.flatMap((stage) =>
      stage.backgroundTaskStage ? [stage.backgroundTaskStage] : [],
    );
    expect(bgStages.length).toBeGreaterThan(0);
    for (const bgStage of bgStages) {
      expect(validBgStages.has(bgStage)).toBe(true);
    }
  });

  it("supports loopback PWA CORS preflight and environment discovery", async () => {
    const pwaOrigin = "http://127.0.0.1:3101";
    const preflight = await fetch(`${session.httpBaseUrl}oauth/token`, {
      method: "OPTIONS",
      headers: {
        Origin: pwaOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(pwaOrigin);
    expect(preflight.headers.get("access-control-expose-headers")).toContain(
      "x-poracode-environment-auth-authority",
    );

    const envRes = await fetch(`${session.httpBaseUrl}.well-known/poracode/environment`, {
      headers: { Origin: pwaOrigin },
    });
    expect(envRes.status).toBe(200);
    expect(envRes.headers.get("access-control-allow-origin")).toBe(pwaOrigin);
    const envJson = (await envRes.json()) as { label?: string; desktopId?: string };
    expect(envJson.desktopId).toBe("mobile-smoke-host");
  });

  it("mints three concurrent one-time pairing URLs for PWA, iOS, and Android that all exchange cleanly", async () => {
    const urls = session.mintPairingUrls("primary");
    expect(urls.pwaUrl).toContain("http://127.0.0.1:3101/?host=");
    expect(urls.iosUrl).toContain("poracode://pair?host=");
    expect(urls.androidUrl).toContain("poracode://pair?host=");

    const extractToken = (rawUrl: string): string => {
      const hash = new URL(rawUrl).hash.slice(1);
      const token = new URLSearchParams(hash).get("token");
      expect(token).toBeTruthy();
      return token!;
    };

    const tokens = [
      extractToken(urls.pwaUrl),
      extractToken(urls.iosUrl),
      extractToken(urls.androidUrl),
    ];
    expect(new Set(tokens).size).toBe(3);

    for (const credential of tokens) {
      const response = await fetch(`${session.httpBaseUrl}oauth/token`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3101",
        },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential,
          client: { label: "mobile-smoke-test", deviceType: "mobile" },
        }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { accessToken?: string };
      expect(payload.accessToken).toBeTruthy();
    }
  });

  it("applies every mobile smoke stage cleanly against the live WireLab host", async () => {
    for (const stage of MOBILE_SMOKE_STAGES) {
      const applied = await session.applyStage(stage.id);
      expect(applied.id).toBe(stage.id);
      expect(session.currentStage()).toBe(stage.id);
    }
    expect(session.status().hosts).toContain("collision-b");
    expect(session.status().activeFaults).toEqual([]);

    const resetStage = await session.resetToBase();
    expect(resetStage.id).toBe("base");
  });

  it("builds deterministic platform pairing URLs", () => {
    const built = buildPlatformPairingUrls({
      hostBaseUrl: "http://127.0.0.1:49152/",
      pwaPort: 3101,
      pwaToken: "tok-pwa",
      iosToken: "tok-ios",
      androidToken: "tok-android",
      expiresAt: "2026-11-23T00:00:00.000Z",
    });
    expect(built.pwaUrl).toBe(
      "http://127.0.0.1:3101/?host=http%3A%2F%2F127.0.0.1%3A49152%2F#token=tok-pwa",
    );
    expect(built.iosUrl).toBe(
      "poracode://pair?host=http%3A%2F%2F127.0.0.1%3A49152%2F#token=tok-ios",
    );
    expect(built.androidUrl).toBe(
      "poracode://pair?host=http%3A%2F%2F127.0.0.1%3A49152%2F#token=tok-android",
    );
  });
});
