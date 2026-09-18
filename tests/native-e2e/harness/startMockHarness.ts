import { CoverageLedger } from "./coverageLedger.ts";
import { ControlServer, createMockControlPlane, type ControlPlane } from "./controlServer.ts";
import { LOOPBACK_HOST } from "./constants.ts";
import { ProcessCleanup } from "./processCleanup.ts";
import type { ControlServerOptions, WireLabOptions } from "./types.ts";
import { WireLab } from "./wireLab.ts";
import { NativeScenarioController } from "./nativeScenario.ts";
import { NativeParityController } from "./parityController.ts";

export interface StartedMockHarness {
  readonly lab: WireLab;
  readonly collisionLab: WireLab | null;
  readonly control: ControlServer;
  readonly plane: ControlPlane;
  readonly scenario: NativeScenarioController;
  readonly parity: NativeParityController;
  readonly cleanup: ProcessCleanup;
  readonly hostPort: number;
  readonly controlPort: number;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly controlUrl: string;
  stop(): Promise<void>;
}

export async function startMockHarness(input?: {
  readonly lab?: WireLabOptions;
  readonly control?: Omit<ControlServerOptions, "capability"> & { readonly capability?: string };
  readonly capability?: string;
  readonly cleanup?: ProcessCleanup;
}): Promise<StartedMockHarness> {
  const capability = input?.capability ?? input?.control?.capability;
  if (!capability) {
    throw new Error("startMockHarness requires a control capability.");
  }
  const cleanup = input?.cleanup ?? new ProcessCleanup();
  const ledger = new CoverageLedger();
  const requestedPort = input?.lab?.port;
  const lab = new WireLab(
    {
      ...(input?.lab ?? {}),
      hostId: "primary",
      port: requestedPort ?? 0,
      allowEphemeralPort: requestedPort === undefined || requestedPort === 0,
      ...(input?.lab?.secretsDir ? { secretsDir: input.lab.secretsDir } : {}),
      ...(input?.lab?.journalPath ? { journalPath: input.lab.journalPath } : {}),
    },
    ledger,
  );
  await lab.start();
  let collisionLab: WireLab | null = null;
  const scenario = new NativeScenarioController(lab, {
    ...(input?.lab?.desktopId ? { primaryDesktopId: input.lab.desktopId } : {}),
    createCollisionHost: async () => {
      const {
        port: _port,
        secretsDir: _secretsDir,
        journalPath: _journalPath,
        desktopId: _desktopId,
        ...sharedOptions
      } = input?.lab ?? {};
      const collision = new WireLab(
        {
          ...sharedOptions,
          port: 0,
          allowEphemeralPort: true,
          hostId: "collision-b",
          desktopId: "native-e2e-collision-b",
          label: "Native E2E Collision Host B",
        },
        new CoverageLedger(),
      );
      await collision.start();
      collisionLab = collision;
      return collision;
    },
  });
  const parity = new NativeParityController(() => [
    { hostId: "primary", lab },
    ...(collisionLab && scenario.state().hosts.some((host) => host.hostId === "collision-b")
      ? [{ hostId: "collision-b" as const, lab: collisionLab }]
      : []),
  ]);
  const plane = createMockControlPlane(lab, scenario, parity);
  const control = new ControlServer(plane, {
    host: input?.control?.host ?? LOOPBACK_HOST,
    port: input?.control?.port ?? 0,
    capability,
  });
  await control.start();
  cleanup.add(() => control.stop());
  cleanup.add(() => lab.stop());
  cleanup.add(() => scenario.stop());
  cleanup.add(() => parity.stop());

  return {
    lab,
    get collisionLab() {
      return collisionLab;
    },
    control,
    plane,
    scenario,
    parity,
    cleanup,
    hostPort: lab.port,
    controlPort: control.port,
    httpBaseUrl: lab.httpBaseUrl,
    wsBaseUrl: lab.wsBaseUrl,
    controlUrl: `http://${LOOPBACK_HOST}:${control.port}`,
    stop: () => cleanup.shutdown("stop"),
  };
}
