import assert from "node:assert/strict";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";
import type { RemoteProcedureName } from "../../../src/shared/remote/procedures.ts";
import {
  allConfiguredProcedureFixtures,
  PROCEDURE_REQUEST_FIXTURES,
} from "../harness/contractFixtures.ts";
import { generatedRoute, loadGeneratedContract } from "../harness/generatedContract.ts";
import { loadProtocolManifest } from "../harness/manifest.ts";
import { CORE_ROUTE_IDS } from "../harness/operationMap.ts";
import { schemaExample } from "../harness/schemaExamples.ts";
import type { StartedMockHarness } from "../harness/startMockHarness.ts";

const JSON_HEADERS = { "content-type": "application/json" } as const;
const STATEFUL_PROCEDURES = new Set<RemoteProcedureName>([
  "createFileCheckpoint",
  "createProjectEntry",
  "gitAddWorktree",
  "gitStage",
  "readProjectFile",
  "listFileCheckpoints",
  "listProjectTree",
  "getGitStatus",
  "gitListWorktrees",
  "writeProjectFile",
]);

export async function exerciseRemainingRoutes(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  const excluded = new Set([
    ...CORE_ROUTE_IDS,
    "forward-enter",
    "port-forward",
    "port-enter",
    "port-unforward",
  ]);
  for (const route of loadProtocolManifest().httpRoutes) {
    if (excluded.has(route.id)) continue;
    const response = await requestGeneratedRoute(harness, accessToken, route.id);
    assert.equal(response.status, generatedRoute(route.id).response.status, route.id);
    if (route.id === "local-image" || route.id === "runtime-image") {
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()).subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    } else {
      await response.json();
    }
  }

  const forwarded = await jsonRoute(harness, accessToken, "port-forward", { targetPort: 4310 });
  const forward = forwarded.forward as { id: string; targetPort: number };
  assert.equal(forward.targetPort, 4310);
  const entered = await jsonRoute(harness, accessToken, "port-enter", { id: forward.id });
  const redirect = await fetch(new URL(String(entered.enterPath), harness.httpBaseUrl), {
    redirect: "manual",
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "/");
  assert.match(redirect.headers.get("content-type") ?? "", /^text\/html/);
  const ports = await getJsonRoute(harness, accessToken, "ports-read");
  assert.ok((ports.forwards as Array<{ id: string }>).some((item) => item.id === forward.id));
  await jsonRoute(harness, accessToken, "port-unforward", { id: forward.id });
  const after = await getJsonRoute(harness, accessToken, "ports-read");
  assert.ok(!(after.forwards as Array<{ id: string }>).some((item) => item.id === forward.id));

  await exerciseRouteFollowUps(harness, accessToken);
}

export async function exerciseAllProcedures(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  const fixtures = allConfiguredProcedureFixtures();
  assert.equal(fixtures.length, 100);
  for (const fixture of fixtures) {
    const body = await callProcedure(
      harness,
      accessToken,
      fixture.name as RemoteProcedureName,
      PROCEDURE_REQUEST_FIXTURES[fixture.name as RemoteProcedureName],
    );
    if (fixture.resultKind === "omitted") {
      assert.deepEqual(body, {}, `${fixture.name} must use the omitted-result envelope`);
    } else {
      assert.ok(Object.hasOwn(body, "result"), `${fixture.name} must return {result:T}`);
      if (!STATEFUL_PROCEDURES.has(fixture.name as RemoteProcedureName)) {
        assert.deepEqual(
          body.result,
          REMOTE_PROCEDURE_RESULT_FIXTURES[fixture.name as RemoteProcedureName],
          `${fixture.name} must use its producer-shaped golden`,
        );
      }
    }
    const followUp = harness.lab.workspace.followUpFor(fixture.name as RemoteProcedureName);
    if (followUp) {
      await callProcedure(harness, accessToken, followUp, PROCEDURE_REQUEST_FIXTURES[followUp]);
    }
  }
  assert.equal(loadGeneratedContract().ir.procedures.length, fixtures.length);
}

async function requestGeneratedRoute(
  harness: StartedMockHarness,
  accessToken: string,
  routeId: string,
): Promise<Response> {
  const route = generatedRoute(routeId);
  const queryValues = schemaExample(route.request.querySchema) as Record<string, unknown>;
  if (routeId === "local-image") queryValues.path = "/tmp/image one.png";
  if (routeId === "runtime-image") queryValues.path = ["payload", 0, "image key"];
  let path = route.path;
  for (const name of route.pathParameters ?? []) {
    const value = `${name} fixture/encoded`;
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(path, harness.httpBaseUrl);
  for (const codec of route.queryCodecs ?? []) {
    if (!(codec.name in queryValues)) continue;
    const value = queryValues[codec.name];
    url.searchParams.set(
      codec.name,
      codec.kind === "JSON-string" ? JSON.stringify(value) : String(value),
    );
  }
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
  let body: BodyInit | undefined;
  if (route.request.bodyKind === "json") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(routeBody(routeId, schemaExample(route.request.jsonSchema)));
  } else if (route.request.bodyKind === "raw-upload") {
    headers["content-type"] = "application/octet-stream";
    body = Buffer.from([0, 1, 2, 3, 255]);
  }
  return fetch(url, { method: route.method, headers, ...(body === undefined ? {} : { body }) });
}

function routeBody(routeId: string, generated: unknown): unknown {
  const body = generated as Record<string, unknown>;
  switch (routeId) {
    case "browser-command":
      return { kind: "create-tab", url: "https://example.test/a?x=one&y=two" };
    case "push-register":
      return { deviceId: "device-fixture-001", platform: "android", deviceToken: "token-fixture" };
    case "push-unregister":
      return { deviceId: "device-fixture-001", platform: "android" };
    case "settings-write":
      return { titleGenProvider: "fixture-provider" };
    default:
      return body;
  }
}

async function exerciseRouteFollowUps(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  for (const id of [
    "host-update",
    "settings-read",
    "schedules-read",
    "browser-state",
    "ports-read",
    "push-config",
  ] as const) {
    await getJsonRoute(harness, accessToken, id);
  }
  await requestGeneratedRoute(harness, accessToken, "profile-core-stats");
  await requestGeneratedRoute(harness, accessToken, "pr-watch-read");
  await getJsonRoute(
    harness,
    accessToken,
    "thread-history",
    "/api/threads/thread-fixture-001/history",
  );
  const settings = await getJsonRoute(harness, accessToken, "settings-read");
  assert.equal((settings.settings as Record<string, unknown>).titleGenProvider, "fixture-provider");
  const browser = await getJsonRoute(harness, accessToken, "browser-state");
  assert.equal((browser.state as { tabs: unknown[] }).tabs.length, 1);
}

async function callProcedure(
  harness: StartedMockHarness,
  accessToken: string,
  procedure: RemoteProcedureName,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, ...JSON_HEADERS },
    body: JSON.stringify({ procedure, payload }),
  });
  assert.equal(response.status, 200, `${procedure} returned ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function jsonRoute(
  harness: StartedMockHarness,
  accessToken: string,
  routeId: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const route = generatedRoute(routeId);
  const response = await fetch(new URL(route.path, harness.httpBaseUrl), {
    method: route.method,
    headers: { authorization: `Bearer ${accessToken}`, ...JSON_HEADERS },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, route.response.status, routeId);
  return response.json() as Promise<Record<string, unknown>>;
}

async function getJsonRoute(
  harness: StartedMockHarness,
  accessToken: string,
  routeId: string,
  path?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path ?? generatedRoute(routeId).path, harness.httpBaseUrl), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(response.status, generatedRoute(routeId).response.status, routeId);
  return response.json() as Promise<Record<string, unknown>>;
}
