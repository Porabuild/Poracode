import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";

/**
 * Gate 4 condition 4 (remote path): Stop/approval-class requests keep
 * reserved ingress capacity under bulk saturation — the remote counterpart of
 * `src/backend/rendererCongestionIsolation.test.ts`'s isolation composition.
 * It drives the REAL production path: a real `RemoteAccessServer` listener
 * over real HTTP, so the semaphore being saturated is the exact
 * `runIngressWork` admission the desktop and headless server cores share.
 *
 * Control-class routing mirrors the desktop path's tested admission classes:
 * `SupervisorClient` admits `interruptThread` / `resolveThreadServerRequest` /
 * `closeThread` ahead of serialized thread mutations "so a long-running
 * mutation can still be interrupted"; here the HTTP routes for those same
 * supervisor procedures keep reserved semaphore slots while bulk work is shed
 * with the same bounded 503 the flat semaphore produced before the
 * reservation existed.
 */

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

interface Deferred {
  resolve(): void;
  readonly promise: Promise<void>;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function issueAccessToken(
  info: RemoteAccessServerInfo,
  scopes: readonly string[],
): Promise<string> {
  const pairing = new URL(info.pairingUrl);
  const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Congestion test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  const token = (await response.json()) as { accessToken: string };
  return token.accessToken;
}

const sendBody = { prompt: "bulk", config: { model: "test-model" } };

interface RouteResult {
  status: number;
  code: string | null;
}

async function postThreadRoute(
  info: RemoteAccessServerInfo,
  token: string,
  suffix: string,
  body: Record<string, unknown> = {},
): Promise<RouteResult> {
  const response = await fetch(new URL(`/api/threads/thread-1${suffix}`, info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) {
    await response.arrayBuffer();
    return { status: response.status, code: null };
  }
  let code: string | null = null;
  try {
    const payload = (await response.json()) as { error?: { code?: string } };
    code = payload.error?.code ?? null;
  } catch {
    code = null;
  }
  return { status: response.status, code };
}

describe("remote ingress congestion isolation (Gate 4 / remote path)", () => {
  it("admits a Stop-class request within budget under bulk saturation, sheds bulk, and lets bulk refill", async () => {
    // Global bulk ceiling = 8 - 2 reserved; control may use the full 8.
    const hungSends: Deferred[] = [];
    const hungInterrupts: Deferred[] = [];
    let interruptsAccepted = 0;
    let resolvedSends = 0;
    // Interrupts complete instantly (a Stop is fast on the host) until the
    // control-bound segment flips this on to occupy reserved slots.
    let holdInterrupts = false;
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "congestion-test", label: "Congestion test" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 0,
      maxConcurrentIngressWork: 8,
      maxConcurrentIngressWorkPerSource: 8,
      reservedIngressControlCapacity: 2,
      reservedIngressControlCapacityPerSource: 2,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "sendThreadInput") {
          const gate = createDeferred();
          hungSends.push(gate);
          await gate.promise;
          return {} as never;
        }
        if (name === "interruptThread") {
          interruptsAccepted += 1;
          if (holdInterrupts) {
            const gate = createDeferred();
            hungInterrupts.push(gate);
            await gate.promise;
          }
          return {} as never;
        }
        return {} as never;
      }),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);

    // Saturate the bulk ceiling with six hung sends (8 global - 2 reserved).
    const sends: Array<Promise<RouteResult>> = [];
    for (let index = 0; index < 6; index += 1) {
      sends.push(
        postThreadRoute(info, token, "/send", sendBody).then((result) => {
          resolvedSends += 1;
          return result;
        }),
      );
    }
    await waitFor(() => hungSends.length >= 6);
    expect(resolvedSends).toBe(0);

    // Bulk is saturated: the next bulk request is shed with the same bounded
    // 503 the flat semaphore produced before the reservation existed.
    const shed = await postThreadRoute(info, token, "/send", sendBody);
    expect(shed.status).toBe(503);
    expect(shed.code).toBe("host_busy");
    expect(hungSends).toHaveLength(6);

    // The Stop request is admitted INTO the reserved capacity and completes
    // within budget while all six bulk sends stay hung.
    const startedAt = Date.now();
    const stop = await postThreadRoute(info, token, "/interrupt", { reason: "user" });
    const elapsedMs = Date.now() - startedAt;
    expect(stop.status).toBe(200);
    expect(elapsedMs).toBeLessThan(2_000);
    expect(interruptsAccepted).toBe(1);
    expect(hungSends).toHaveLength(6);
    expect(resolvedSends).toBe(0);

    // Control is bounded by the same absolute maximum: with two held
    // interrupts occupying the reserved slots (6 bulk + 2 control = 8 total),
    // a third control request is shed instead of growing admission.
    holdInterrupts = true;
    const secondInterrupt = postThreadRoute(info, token, "/interrupt", { reason: "user" });
    await waitFor(() => hungInterrupts.length >= 1);
    const thirdInterrupt = postThreadRoute(info, token, "/interrupt", { reason: "user" });
    await waitFor(() => hungInterrupts.length >= 2);
    const fourthInterrupt = await postThreadRoute(info, token, "/interrupt", { reason: "user" });
    expect(fourthInterrupt.status).toBe(503);
    expect(fourthInterrupt.code).toBe("host_busy");

    // No starvation collapse, part 1 (control): the moment one in-flight
    // control request finishes, its slot frees and control is admitted again.
    hungInterrupts[0]!.resolve();
    expect(await secondInterrupt).toMatchObject({ status: 200 });
    expect(interruptsAccepted).toBe(3);

    // No starvation collapse, part 2 (bulk): freeing two bulk slots lets new
    // bulk through at once — the freed control capacity never displaces bulk.
    hungSends[0]!.resolve();
    hungSends[1]!.resolve();
    await waitFor(() => resolvedSends >= 2);
    const refilled = postThreadRoute(info, token, "/send", sendBody);
    await waitFor(() => hungSends.length >= 7);
    hungSends[6]!.resolve();
    expect(await refilled).toMatchObject({ status: 200 });

    // Drain everything; every admitted request completes with its 200.
    for (const gate of hungSends) gate.resolve();
    for (const gate of hungInterrupts) gate.resolve();
    const outcomes = await Promise.all(sends);
    expect(outcomes.every((outcome) => outcome.status === 200)).toBe(true);
    expect(await thirdInterrupt).toMatchObject({ status: 200 });
  }, 15_000);

  it("keeps per-source reserved control capacity when one connection saturates its own bulk allowance", async () => {
    // Focused probe of the per-source split (the real-transport test above
    // covers the global behavior; a single HTTP client socket cannot
    // multiplex enough concurrent requests to saturate its own allowance).
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "per-source-test", label: "Per source" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
      maxConcurrentIngressWork: 8,
      maxConcurrentIngressWorkPerSource: 4,
      reservedIngressControlCapacity: 1,
      reservedIngressControlCapacityPerSource: 1,
    });
    servers.push(server);
    await server.start();

    type Admission = <T>(
      operation: () => T | PromiseLike<T>,
      source: object,
      workClass: "control" | "bulk",
    ) => Promise<T>;
    const admission = (
      (server as unknown as { runIngressWork: Admission }).runIngressWork as (
        this: RemoteAccessServer,
        ...args: Parameters<Admission>
      ) => ReturnType<Admission>
    ).bind(server);

    const outcome = async (promise: Promise<unknown>): Promise<string> => {
      try {
        await promise;
        return "admitted";
      } catch (error) {
        return (error as { code?: string }).code ?? "rejected";
      }
    };

    const source = { connection: "a" };
    const gate = createDeferred();
    const controlGate = createDeferred();
    let admittedHeldBulk = 0;
    let admittedHeldControl = 0;
    const heldBulkFrom = (from: object): Promise<string> => {
      // The operation body runs at admission, so the counter observes
      // admission while the promise itself stays pending on the gate.
      const promise = admission(
        () => {
          admittedHeldBulk += 1;
          return gate.promise;
        },
        from,
        "bulk",
      );
      return outcome(promise);
    };
    const heldControlFrom = (from: object): Promise<string> => {
      const promise = admission(
        () => {
          admittedHeldControl += 1;
          return controlGate.promise;
        },
        from,
        "control",
      );
      return outcome(promise);
    };
    const instantBulkFrom = (from: object) => outcome(admission(() => undefined, from, "bulk"));
    const instantControlFrom = (from: object) =>
      outcome(admission(() => undefined, from, "control"));

    // One source fills its bulk allowance (4 - 1 reserved = 3)…
    const held = [heldBulkFrom(source), heldBulkFrom(source), heldBulkFrom(source)];
    await waitFor(() => admittedHeldBulk >= 3);
    expect(await heldBulkFrom(source)).toBe("host_busy");
    // …and the same saturated source still has its reserved control slot.
    const heldControl = heldControlFrom(source);
    await waitFor(() => admittedHeldControl >= 1);
    // Control stays bounded by the source's full allowance (3 bulk + 1
    // control = 4).
    expect(await instantControlFrom(source)).toBe("host_busy");
    // A different source is unaffected by the first source's saturation, for
    // both classes.
    expect(await instantBulkFrom({ connection: "b" })).toBe("admitted");
    expect(await instantControlFrom({ connection: "b" })).toBe("admitted");

    gate.resolve();
    controlGate.resolve();
    expect(await Promise.all(held)).toEqual(["admitted", "admitted", "admitted"]);
    await heldControl;
  });

  it("rejects control reservations that would leave bulk without capacity", () => {
    const common = {
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "invalid-reserve", label: "Invalid reserve" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    };
    expect(
      () =>
        new RemoteAccessServer({
          ...common,
          reservedIngressControlCapacity: 8,
          maxConcurrentIngressWork: 8,
        }),
    ).toThrow("reservedIngressControlCapacity");
    expect(
      () =>
        new RemoteAccessServer({
          ...common,
          reservedIngressControlCapacityPerSource: 4,
          maxConcurrentIngressWorkPerSource: 4,
        }),
    ).toThrow("reservedIngressControlCapacityPerSource");
    expect(() => new RemoteAccessServer({ ...common, reservedIngressControlCapacity: -1 })).toThrow(
      "reservedIngressControlCapacity",
    );
  });
});
