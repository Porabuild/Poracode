import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  headerValue,
  readBoundedJsonBody,
  rejectChunkedRequest,
  writeError,
  writeJson,
} from "./httpIo.ts";
import { LabHttpError } from "./labAuth.ts";
import { assertSecretFree } from "./secrets.ts";
import { parseHarnessAuthorization, timingSafeEqualString } from "./timingSafe.ts";
import {
  isCheckpointFixtureId,
  isFaultFixtureId,
  isFrameFixtureId,
  type CheckpointFixtureId,
  type FaultFixtureId,
  type FrameFixtureId,
} from "./controlFixtures.ts";
import type { ControlServerOptions, HarnessBlocker, HarnessMode, LabState } from "./types.ts";
import type { CoverageLedger } from "./coverageLedger.ts";
import type { WireLab } from "./wireLab.ts";
import { LOOPBACK_HOST } from "./constants.ts";
import { assertLoopbackHost } from "./loopback.ts";
import {
  assertScenarioActionResultSafe,
  assertScenarioDescriptorSafe,
  assertScenarioStateSafe,
  type NativeScenarioControl,
} from "./nativeScenario.ts";
import { parseScenarioAction } from "./nativeScenarioValidation.ts";
import {
  type NativeParityControl,
  parseAndValidateParityAction,
  type ParityActionResult,
} from "./parityController.ts";

export interface ControlPlane {
  readonly mode: HarnessMode;
  state(): LabState;
  activateFault(id: FaultFixtureId): void | HarnessBlocker;
  emitFrame(id: FrameFixtureId): void | HarnessBlocker;
  applyCheckpoint(id: CheckpointFixtureId): void | HarnessBlocker;
  reset(): void;
  restartReal(): void | HarnessBlocker | Promise<void | HarnessBlocker>;
  ledger(): CoverageLedger;
  readonly scenario?: NativeScenarioControl;
  readonly parity?: NativeParityControl;
}

export class ControlServer {
  private server: Server | null = null;
  private portValue = 0;

  constructor(
    private readonly plane: ControlPlane,
    private readonly options: ControlServerOptions,
  ) {}

  get port(): number {
    return this.portValue;
  }

  async start(): Promise<{ port: number; url: string }> {
    const host = assertLoopbackHost(this.options.host ?? LOOPBACK_HOST, "control server");
    const server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(this.options.port ?? 0, host, () => {
        server.off("error", onError);
        resolve();
      });
    });
    this.server = server;
    this.portValue = (server.address() as AddressInfo).port;
    return { port: this.portValue, url: `http://${host}:${this.portValue}` };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
      if (req.method === "GET" && url.pathname === "/healthz") {
        const body = { ok: true };
        assertSecretFree(body, "/healthz");
        writeJson(res, 200, body);
        return;
      }
      this.assertCapability(req);
      if (req.method === "GET" && url.pathname === "/v1/state") {
        const state = { ...this.plane.state(), controlPort: this.portValue };
        assertSecretFree(state, "/v1/state");
        writeJson(res, 200, state);
        return;
      }
      if (url.pathname === "/v1/scenario") {
        const scenario = this.requireScenario();
        if (req.method !== "GET") throw new LabHttpError("not_found", "Not found.", 404);
        const body = scenario.descriptor();
        assertScenarioDescriptorSafe(body);
        writeJson(res, 200, body);
        return;
      }
      if (url.pathname === "/v1/parity") {
        const parity = this.requireParity();
        if (req.method !== "GET") throw new LabHttpError("not_found", "Not found.", 404);
        const body = parity.descriptor();
        assertSecretFree(body, "/v1/parity");
        writeJson(res, 200, body);
        return;
      }
      if (url.pathname === "/v1/parity/state") {
        const parity = this.requireParity();
        if (req.method !== "GET") throw new LabHttpError("not_found", "Not found.", 404);
        const body = parity.state();
        assertSecretFree(body, "/v1/parity/state");
        writeJson(res, 200, body);
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/parity/actions") {
        const parity = this.requireParity();
        rejectChunkedRequest(req);
        const action = parseAndValidateParityAction(await readBoundedJsonBody(req));
        const body: ParityActionResult = await parity.execute(action);
        assertSecretFree(body, "/v1/parity/actions");
        writeJson(res, 200, body);
        return;
      }
      if (url.pathname === "/v1/scenario/state") {
        const scenario = this.requireScenario();
        if (req.method !== "GET") throw new LabHttpError("not_found", "Not found.", 404);
        const body = scenario.state();
        assertScenarioStateSafe(body);
        writeJson(res, 200, body);
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/scenario/actions") {
        const scenario = this.requireScenario();
        rejectChunkedRequest(req);
        const action = parseScenarioAction(await readBoundedJsonBody(req));
        const abort = new AbortController();
        const cancel = () => {
          if (req.aborted || !res.writableEnded) abort.abort();
        };
        req.once("aborted", cancel);
        res.once("close", cancel);
        try {
          const body = await scenario.execute(action, abort.signal);
          assertScenarioActionResultSafe(body);
          writeJson(res, 200, body);
        } finally {
          req.off("aborted", cancel);
          res.off("close", cancel);
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/reset") {
        this.plane.reset();
        const body = { ok: true };
        assertSecretFree(body, "/v1/reset");
        writeJson(res, 200, body);
        return;
      }
      const faultId = matchPrefixed(url.pathname, "/v1/faults/");
      if (req.method === "POST" && faultId) {
        if (!isFaultFixtureId(faultId)) {
          throw new LabHttpError("unknown_fixture", "Unknown fault fixture.", 404);
        }
        const result = this.plane.activateFault(faultId);
        if (isBlocker(result)) {
          writeJson(res, 409, { blocker: { code: result.code } });
          return;
        }
        const body = { ok: true, faults: this.plane.state().faults };
        assertSecretFree(body, "/v1/faults");
        writeJson(res, 200, body);
        return;
      }
      const frameId = matchPrefixed(url.pathname, "/v1/frames/");
      if (req.method === "POST" && frameId) {
        if (!isFrameFixtureId(frameId)) {
          throw new LabHttpError("unknown_fixture", "Unknown frame fixture.", 404);
        }
        const result = this.plane.emitFrame(frameId);
        if (isBlocker(result)) {
          writeJson(res, 409, { blocker: { code: result.code } });
          return;
        }
        const body = { ok: true, seq: this.plane.state().seq };
        assertSecretFree(body, "/v1/frames");
        writeJson(res, 200, body);
        return;
      }
      const checkpointId = matchPrefixed(url.pathname, "/v1/checkpoints/");
      if (req.method === "POST" && checkpointId) {
        if (!isCheckpointFixtureId(checkpointId)) {
          throw new LabHttpError("unknown_fixture", "Unknown checkpoint fixture.", 404);
        }
        const result = this.plane.applyCheckpoint(checkpointId);
        if (isBlocker(result)) {
          writeJson(res, 409, { blocker: { code: result.code } });
          return;
        }
        const body = { ok: true };
        assertSecretFree(body, "/v1/checkpoints");
        writeJson(res, 200, body);
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/real/restart") {
        const result = await this.plane.restartReal();
        if (isBlocker(result)) {
          writeJson(res, 409, { blocker: { code: result.code } });
          return;
        }
        const body = { ok: true };
        assertSecretFree(body, "/v1/real/restart");
        writeJson(res, 200, body);
        return;
      }
      throw new LabHttpError("not_found", "Not found.", 404);
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof LabHttpError)
          assertSecretFree({ error: { code: error.code } }, "control-error");
        writeError(res, error);
      } else req.socket.destroy();
    }
  }

  private assertCapability(req: IncomingMessage): void {
    const provided = parseHarnessAuthorization(headerValue(req, "authorization"));
    if (!provided || !timingSafeEqualString(provided, this.options.capability)) {
      throw new LabHttpError("invalid_capability", "Missing or invalid control capability.", 401);
    }
  }

  private requireScenario(): NativeScenarioControl {
    if (!this.plane.scenario) {
      throw new LabHttpError("scenario_unavailable", "Scenario control is unavailable.", 409);
    }
    return this.plane.scenario;
  }

  private requireParity(): NativeParityControl {
    if (!this.plane.parity) {
      throw new LabHttpError("parity_unavailable", "Parity control is unavailable.", 409);
    }
    return this.plane.parity;
  }
}

function matchPrefixed(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest.includes("/")) return null;
  return decodeURIComponent(rest);
}

function isBlocker(value: unknown): value is HarnessBlocker {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value);
}

export function createMockControlPlane(
  lab: WireLab,
  scenario?: NativeScenarioControl,
  parity?: NativeParityControl,
): ControlPlane {
  return {
    mode: "mock",
    state: () => ({
      mode: "mock",
      protocolVersion: lab.manifest.protocolVersion,
      bindHost: "127.0.0.1",
      hostPort: lab.port,
      controlPort: 0,
      seq: lab.ring.seq,
      replayCount: lab.ring.size,
      pairingOutstanding: lab.auth.pairingOutstanding,
      accessSessionCount: lab.auth.accessSessionCount,
      ticketOutstandingCount: lab.auth.ticketOutstandingCount,
      connectionCount: lab.connectionCount,
      faults: lab.faults.list(),
      blockers: [],
      ledgerProfile: "core",
    }),
    activateFault: (id) => {
      lab.activateFaultFixture(id);
    },
    emitFrame: (id) => {
      lab.emitFrameFixture(id);
    },
    applyCheckpoint: (id) => {
      lab.applyCheckpoint(id);
    },
    reset: () => {
      scenario?.reset();
      if (!scenario) lab.reset();
      parity?.resetState();
    },
    restartReal: () => ({
      code: "host-mode-unavailable",
      message: "Mock mode has no production host to restart.",
    }),
    ledger: () => lab.ledger,
    ...(scenario ? { scenario } : {}),
    ...(parity ? { parity } : {}),
  };
}
