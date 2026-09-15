import { buildEnvironmentDescriptor } from "./labFixtures.ts";
import { bearerToken } from "./labHttpDispatch.ts";
import type { RemoteScope } from "./constants.ts";
import type { LabRuntime } from "./labRuntime.ts";
import type { WireLab } from "./wireLab.ts";

export function createWireLabRuntime(lab: WireLab): LabRuntime {
  return {
    auth: lab.auth,
    faults: lab.faults,
    ring: lab.ring,
    observationLedger: lab.observationLedger,
    ledger: lab.ledger,
    manifest: lab.manifest,
    workspace: lab.workspace,
    lifecycle: lab.lifecycle,
    routes: lab.routes,
    connections: lab.connectionSet,
    basePath: lab.basePath,
    httpBaseUrl: lab.httpBaseUrl,
    wsBaseUrl: lab.wsBaseUrl,
    allocateConnectionIdentity: (authSessionId) => lab.allocateConnectionIdentity(authSessionId),
    environment: () =>
      buildEnvironmentDescriptor({
        httpBaseUrl: lab.httpBaseUrl,
        wsBaseUrl: lab.wsBaseUrl,
        desktopId: lab.wireDesktopId,
        label: lab.wireLabel,
        appVersion: lab.wireAppVersion,
        scopes: lab.manifest.scopes,
      }),
    publishEvent: (event) => lab.publishEvent(event),
    send: (ws, message) => lab.sendMessage(ws, message),
    requireRouteAuth: (req, url, auth, scopes) => lab.requireRouteAuth(req, url, auth, scopes),
    bearerToken,
    issuePairingCredential: (scopes?: readonly RemoteScope[]) => lab.issuePairingCredential(scopes),
    consumePairingSecretFile: () => lab.consumePairingSecretFile(),
  };
}
