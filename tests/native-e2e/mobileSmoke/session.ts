import { randomBytes } from "node:crypto";
import { DEFAULT_SCOPES, LOOPBACK_HOST } from "../harness/constants.ts";
import { FIXTURE_THREAD_ID } from "../harness/labFixtures.ts";
import { startMockHarness, type StartedMockHarness } from "../harness/startMockHarness.ts";
import { getMobileSmokeStage, type MobileSmokeStage } from "./stages.ts";

export interface MobileSmokePairingUrls {
  readonly hostBaseUrl: string;
  readonly pwaUrl: string;
  readonly iosUrl: string;
  readonly androidUrl: string;
  readonly expiresAt: string;
}

export interface MobileSmokeSessionOptions {
  readonly hostPort?: number;
  readonly controlPort?: number;
  readonly pwaPort?: number;
  readonly extraBrowserOrigins?: readonly string[];
  readonly label?: string;
}

export interface MobileSmokeSession {
  readonly harness: StartedMockHarness;
  readonly pwaPort: number;
  readonly hostPort: number;
  readonly controlPort: number;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  currentStage(): string;
  mintPairingUrls(hostId?: "primary" | "collision-b"): MobileSmokePairingUrls;
  applyStage(stageId: string): Promise<MobileSmokeStage>;
  resetToBase(): Promise<MobileSmokeStage>;
  status(): {
    readonly stage: string;
    readonly httpBaseUrl: string;
    readonly wsBaseUrl: string;
    readonly connections: number;
    readonly hosts: readonly string[];
    readonly activeFaults: readonly string[];
  };
  stop(): Promise<void>;
}

function buildBrowserOrigins(pwaPort: number, extra: readonly string[] = []): string[] {
  const origins = new Set<string>([
    `http://127.0.0.1:${pwaPort}`,
    `http://localhost:${pwaPort}`,
    `http://[::1]:${pwaPort}`,
  ]);
  for (const origin of extra) {
    if (origin.trim()) origins.add(origin.trim());
  }
  return [...origins];
}

export function buildPlatformPairingUrls(input: {
  readonly hostBaseUrl: string;
  readonly pwaPort: number;
  readonly pwaToken: string;
  readonly iosToken: string;
  readonly androidToken: string;
  readonly expiresAt: string;
}): MobileSmokePairingUrls {
  const encodedHost = encodeURIComponent(input.hostBaseUrl);
  return {
    hostBaseUrl: input.hostBaseUrl,
    pwaUrl: `http://127.0.0.1:${input.pwaPort}/?host=${encodedHost}#token=${encodeURIComponent(input.pwaToken)}`,
    iosUrl: `poracode://pair?host=${encodedHost}#token=${encodeURIComponent(input.iosToken)}`,
    androidUrl: `poracode://pair?host=${encodedHost}#token=${encodeURIComponent(input.androidToken)}`,
    expiresAt: input.expiresAt,
  };
}

export async function startMobileSmokeSession(
  options: MobileSmokeSessionOptions = {},
): Promise<MobileSmokeSession> {
  const pwaPort = options.pwaPort ?? 3101;
  const capability = randomBytes(24).toString("base64url");
  const browserOrigins = buildBrowserOrigins(pwaPort, options.extraBrowserOrigins);

  const harness = await startMockHarness({
    lab: {
      host: LOOPBACK_HOST,
      port: options.hostPort ?? 0,
      allowEphemeralPort: options.hostPort === undefined || options.hostPort === 0,
      browserOrigins,
      label: options.label ?? "Poracode Mobile Smoke Host",
      desktopId: "mobile-smoke-host",
    },
    control: {
      host: LOOPBACK_HOST,
      port: options.controlPort ?? 0,
      capability,
    },
    capability,
  });

  let activeStageId = "init";

  const applyStage = async (stageId: string): Promise<MobileSmokeStage> => {
    const stage = getMobileSmokeStage(stageId);
    if (!stage) {
      throw new Error(`Unknown mobile smoke stage "${stageId}".`);
    }
    if (stage.resetFirst) {
      harness.lab.reset();
    }
    if (stage.clearFaults) {
      harness.lab.clearFault();
    }
    if (stage.seedMultihost) {
      await harness.scenario.execute({ type: "seed-multihost-collision" });
    }
    if (stage.backgroundTaskStage) {
      await harness.scenario.execute({
        type: "background-task-stage",
        stage: stage.backgroundTaskStage,
      });
    }
    for (const checkpoint of stage.checkpoints ?? []) {
      harness.lab.applyCheckpoint(checkpoint, { persist: false });
    }
    for (const fault of stage.faults ?? []) {
      harness.lab.activateFaultFixture(fault, { persist: false });
    }
    for (const frame of stage.frames ?? []) {
      harness.lab.emitFrameFixture(frame);
    }
    if (stage.notifyThreadChanged) {
      harness.lab.publishEvent({
        type: "remote-threads-changed",
        threadIds: [FIXTURE_THREAD_ID],
      });
    }
    activeStageId = stage.id;
    return stage;
  };

  await applyStage("base");

  return {
    harness,
    pwaPort,
    hostPort: harness.hostPort,
    controlPort: harness.controlPort,
    httpBaseUrl: harness.httpBaseUrl,
    wsBaseUrl: harness.wsBaseUrl,
    currentStage: () => activeStageId,
    mintPairingUrls(hostId = "primary"): MobileSmokePairingUrls {
      const targetLab =
        hostId === "collision-b" && harness.collisionLab ? harness.collisionLab : harness.lab;
      // Mint three independent one-time tokens directly on LabAuthStore so PWA,
      // iOS, and Android can pair in any order without revoking each other.
      const pwa = targetLab.auth.issuePairingCredential({ scopes: [...DEFAULT_SCOPES] });
      const ios = targetLab.auth.issuePairingCredential({ scopes: [...DEFAULT_SCOPES] });
      const android = targetLab.auth.issuePairingCredential({ scopes: [...DEFAULT_SCOPES] });
      return buildPlatformPairingUrls({
        hostBaseUrl: targetLab.httpBaseUrl,
        pwaPort,
        pwaToken: pwa.credential,
        iosToken: ios.credential,
        androidToken: android.credential,
        expiresAt: pwa.expiresAt,
      });
    },
    applyStage,
    async resetToBase(): Promise<MobileSmokeStage> {
      harness.lab.reset();
      return await applyStage("base");
    },
    status() {
      const state = harness.scenario.state();
      return {
        stage: activeStageId,
        httpBaseUrl: harness.httpBaseUrl,
        wsBaseUrl: harness.wsBaseUrl,
        connections: harness.lab.connectionCount,
        hosts: state.hosts.map((host) => host.hostId),
        activeFaults: [...state.faults],
      };
    },
    stop: () => harness.stop(),
  };
}
