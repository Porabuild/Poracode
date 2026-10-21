import { HostControlServer, type HostControlAuthority } from "./ownership/HostControlServer";
import { readHostOwnerRecord } from "./ownership/hostOwnerLease";
import type { createHostAdministration } from "@/server/hostAdministration";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import type { SupervisorEvent } from "@/shared/ipc";

/** Local administration uses the backend's existing settings, supervisor and live listener. */
export class DesktopHostAdministration {
  private administration: ReturnType<typeof createHostAdministration> | null = null;
  private loading: Promise<ReturnType<typeof createHostAdministration> | null> | null = null;
  private stopped = false;
  private readonly control: HostControlServer;

  constructor(
    private readonly options: Omit<Parameters<typeof createHostAdministration>[0], "server"> & {
      authority: HostControlAuthority;
      server(): Parameters<typeof createHostAdministration>[0]["server"];
      capabilities: HostServiceCapabilities;
    },
  ) {
    this.control = new HostControlServer({
      lease: options.authority,
      describe: () => ({
        state:
          readHostOwnerRecord(options.authority.paths)?.phase === "ready" ? "ready" : "starting",
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        // Desktop attach remains refused. Independent admin pairings use the
        // existing backend listener; this is not an attach advertisement.
        endpoint: null,
        capabilities: options.capabilities,
      }),
      issuePairing: () =>
        Promise.reject(new Error("The desktop owner does not mint attach pairings.")),
      administer: async (input, context) => {
        context.assertActive();
        const administration = await this.load();
        context.assertActive();
        if (!administration || this.stopped) throw new Error("Desktop administration is stopping.");
        return administration.administer(input, context);
      },
    });
  }

  start(): Promise<void> {
    return this.control.start();
  }
  observe(event: SupervisorEvent): void {
    this.administration?.observe(event);
  }
  reset(): void {
    this.administration?.reset();
  }
  dispose(): Promise<void> {
    this.stopped = true;
    return joinRuntimeShutdown([
      () => this.control.dispose(),
      () => this.loading?.then((administration) => administration?.dispose()),
    ]);
  }

  private load(): Promise<ReturnType<typeof createHostAdministration> | null> {
    // Ordinary desktop startup/describe does not load the CLI administration
    // graph. The control request and disposal both retain this same import join.
    this.loading ??= import("@/server/hostAdministration").then(
      ({ createHostAdministration: create }) => {
        if (this.stopped) return null;
        const server = this.options.server;
        // LAN/TLS reconfiguration can replace the remote listener. Resolve its
        // current grant/session inventory for every operation.
        this.administration = create({
          ...this.options,
          server: {
            issueIndependentPairingGrant: (...args) =>
              server().issueIndependentPairingGrant(...args),
            listAccessSessions: () => server().listAccessSessions(),
            listPairingCredentials: () => server().listPairingCredentials(),
            publishCatalogChanged: () => server().publishCatalogChanged(),
            revokeAccessSession: (...args) => server().revokeAccessSession(...args),
            revokePairingCredentialById: (...args) => server().revokePairingCredentialById(...args),
          },
        });
        return this.administration;
      },
    );
    return this.loading;
  }
}
