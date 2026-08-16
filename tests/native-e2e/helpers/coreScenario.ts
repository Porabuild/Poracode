import assert from "node:assert/strict";
import {
  allConfiguredProcedureFixtures,
  PROCEDURE_REQUEST_FIXTURES,
} from "../harness/contractFixtures.ts";
import {
  allReplayableEventFixtures,
  allRuntimeEventFixtures,
  buildReplayableEvent,
  FIXTURE_PROJECT_ID,
  FIXTURE_THREAD_ID,
} from "../harness/labFixtures.ts";
import { CLIENT_WS_FIXTURES } from "../harness/wsFixtures.ts";
import type { StartedMockHarness } from "../harness/startMockHarness.ts";
import { openReadySocket } from "./testClient.ts";

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function exerciseCoreLifecycle(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  const auth = { authorization: `Bearer ${accessToken}` };
  await expectStatus(fetch(new URL("/.well-known/poracode/environment", harness.httpBaseUrl)), 200);
  await expectStatus(
    fetch(new URL("/.well-known/lightcode/environment", harness.httpBaseUrl)),
    200,
  );
  await expectStatus(fetch(new URL("/api/snapshot", harness.httpBaseUrl), { headers: auth }), 200);
  await expectStatus(
    fetch(new URL(`/api/projects/${FIXTURE_PROJECT_ID}/settings`, harness.httpBaseUrl), {
      headers: auth,
    }),
    200,
  );
  await jsonRequest(harness, accessToken, `/api/projects/${FIXTURE_PROJECT_ID}/notes`, {
    doc: null,
    todos: [],
    updatedAt: "2026-08-12T10:03:00.000Z",
  });
  await expectStatus(
    fetch(new URL(`/api/projects/${FIXTURE_PROJECT_ID}/notes`, harness.httpBaseUrl), {
      headers: auth,
    }),
    200,
  );
  await jsonRequest(harness, accessToken, "/api/projects/command", {
    kind: "update",
    projectId: FIXTURE_PROJECT_ID,
    patch: { name: "Fixture Project Updated" },
  });
  await expectStatus(fetch(new URL("/api/snapshot", harness.httpBaseUrl), { headers: auth }), 200);

  const uploadUrl = new URL("/api/files/attachment", harness.httpBaseUrl);
  uploadUrl.searchParams.set("threadId", FIXTURE_THREAD_ID);
  uploadUrl.searchParams.set("name", "fixture & raw.bin");
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream" },
    body: Buffer.from([0, 1, 2, 3, 255]),
  });
  assert.equal(upload.status, 200);
  const attachment = (await upload.json()) as { path: string };
  assert.match(attachment.path, /fixture%20%26%20raw\.bin$/);

  await jsonRequest(harness, accessToken, "/api/threads/start", {
    threadId: FIXTURE_THREAD_ID,
    projectLocation: { kind: "posix", path: "/tmp/native-e2e-fixture" },
    agentKind: "codex",
    config: { model: "gpt-5" },
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "gui",
  });
  await expectStatus(fetch(new URL("/api/snapshot", harness.httpBaseUrl), { headers: auth }), 200);
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/send`, {
    prompt: "Use the attachment",
    config: { model: "gpt-5" },
    segments: [{ kind: "attachment", path: attachment.path, mimeType: "text/plain" }],
  });
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/interrupt`, {});
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/command`, {
    kind: "rename",
    title: "Renamed fixture thread",
  });
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/goal`, {
    action: "edit",
    objective: "Verify lifecycle fixtures",
  });
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/steer/set`, {
    prompt: "Steer fixture",
    config: { model: "gpt-5" },
  });
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/steer/clear`, {});
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/runtime/truncate`, {
    itemId: "item-fixture-assistant",
  });
  await jsonRequest(harness, accessToken, `/api/threads/${FIXTURE_THREAD_ID}/close`, {});
  await expectStatus(
    fetch(new URL(`/api/threads/${FIXTURE_THREAD_ID}/history`, harness.httpBaseUrl), {
      headers: auth,
    }),
    200,
  );
  await expectStatus(
    fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/history/items?limit=100`, harness.httpBaseUrl),
      { headers: auth },
    ),
    200,
  );
}

export async function exerciseCoreProcedures(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  const pairs = [
    ["writeProjectFile", "readProjectFile"],
    ["createProjectEntry", "listProjectTree"],
    ["gitStage", "getGitStatus"],
    ["gitAddWorktree", "gitListWorktrees"],
    ["createFileCheckpoint", "listFileCheckpoints"],
  ] as const;
  await callProcedure(harness, accessToken, "searchProjectFiles");
  for (const [mutation, followUp] of pairs) {
    await callProcedure(harness, accessToken, mutation);
    await callProcedure(harness, accessToken, followUp);
  }
  const configured = new Set(allConfiguredProcedureFixtures().map((fixture) => fixture.name));
  assert.ok(
    [...new Set(["searchProjectFiles", ...pairs.flat()])].every((name) => configured.has(name)),
  );
}

export async function exerciseCoreWebSocket(
  harness: StartedMockHarness,
  accessToken: string,
): Promise<void> {
  const first = await openReadySocket(harness, accessToken);
  assert.deepEqual(first.ready, { type: "ready", seq: 0 });
  first.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["browser-watch"]));
  for (let index = 0; index < 3; index += 1) await first.next();
  for (const type of [
    "browser-input",
    "browser-unwatch",
    "git-state-interests",
    "thread-item-interests",
  ] as const) {
    first.ws.send(JSON.stringify(CLIENT_WS_FIXTURES[type]));
  }
  first.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["terminal-watch"]));
  assert.equal(((await first.next()) as { type: string }).type, "terminal-watch-result");
  harness.lab.emit({ kind: "terminal-output", data: "fixture terminal" });
  assert.equal(((await first.next()) as { type: string }).type, "terminal-output");
  first.ws.send(JSON.stringify(CLIENT_WS_FIXTURES.ping));
  assert.equal(((await first.next()) as { type: string }).type, "pong");
  first.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["terminal-unwatch"]));
  harness.lab.emit({ kind: "resync-required", reason: "Fixture resync." });
  assert.equal(((await first.next()) as { type: string }).type, "resync-required");

  for (const event of allReplayableEventFixtures()) harness.lab.publishEvent(event);
  for (const runtimeEvent of allRuntimeEventFixtures()) {
    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: FIXTURE_THREAD_ID,
      event: runtimeEvent,
    });
  }
  const eventCount = allReplayableEventFixtures().length + allRuntimeEventFixtures().length;
  for (let index = 0; index < eventCount; index += 1) {
    assert.equal(((await first.next()) as { type: string }).type, "event");
  }
  const cursor = harness.lab.ring.seq;
  first.ws.close();

  harness.lab.publishEvent(buildReplayableEvent("thread-state"));
  const replay = await openReadySocket(harness, accessToken, { lastSeenSeq: cursor });
  assert.equal(((await replay.next()) as { type: string }).type, "event");
  replay.ws.close();

  harness.lab.setFault({ kind: "duplicate-event-delivery" });
  const duplicate = await openReadySocket(harness, accessToken);
  harness.lab.publishEvent(buildReplayableEvent("thread-state"));
  assert.equal(((await duplicate.next()) as { type: string }).type, "event");
  assert.equal(((await duplicate.next()) as { type: string }).type, "event");
  duplicate.ws.close();

  const beforeGap = harness.lab.ring.seq;
  harness.lab.setFault({ kind: "sequence-gap" });
  harness.lab.publishEvent(buildReplayableEvent("thread-state"));
  harness.lab.publishEvent(buildReplayableEvent("thread-state"));
  const gap = await openReadySocket(harness, accessToken, { lastSeenSeq: beforeGap });
  assert.equal(((await gap.next()) as { type: string }).type, "resync-required");
  gap.ws.close();
}

async function callProcedure(
  harness: StartedMockHarness,
  accessToken: string,
  name: keyof typeof PROCEDURE_REQUEST_FIXTURES,
): Promise<unknown> {
  const response = await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, ...JSON_HEADERS },
    body: JSON.stringify({ procedure: name, payload: PROCEDURE_REQUEST_FIXTURES[name] }),
  });
  assert.equal(response.status, 200, `${name} returned ${response.status}`);
  return response.json();
}

async function jsonRequest(
  harness: StartedMockHarness,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(new URL(path, harness.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, ...JSON_HEADERS },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  return response.json();
}

async function expectStatus(responsePromise: Promise<Response>, expected: number): Promise<void> {
  const response = await responsePromise;
  assert.equal(response.status, expected, `${response.url} returned ${response.status}`);
}
