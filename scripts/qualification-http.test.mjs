import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assertUnchangedProjectCatalog } from "./server-install-qualification.mjs";
import {
  jsonRequest,
  PROTOCOL_VERSION_HEADER,
  readQualificationProtocolVersion,
} from "./qualification-http.mjs";
import { pairAndAuthenticate } from "./server-n1-qualification/server-session.mjs";
import { redactSecrets } from "./server-n1-qualification/redaction.mjs";

void test("rejected writer catalog checks compare structured Windows paths", () => {
  const before = { status: 200, body: { projects: [{ path: "C:\\existing\\project" }] } };
  assert.doesNotThrow(() => assertUnchangedProjectCatalog(before, structuredClone(before)));
  assert.throws(
    () =>
      assertUnchangedProjectCatalog(before, {
        status: 200,
        body: { projects: [...before.body.projects, { path: "C:\\qualification\\project" }] },
      }),
    /changed the project catalog/u,
  );
  assert.throws(
    () => assertUnchangedProjectCatalog(before, { status: 500, body: before.body }),
    /catalog read failed/u,
  );
});

void test("qualification requests declare host generation and preserve auth only in memory", async (t) => {
  let version = 71;
  let mutations = 0;
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, headers: request.headers });
    response.setHeader("content-type", "application/json");
    if (request.url === "/.well-known/poracode/environment") {
      response.end(JSON.stringify({ protocolVersion: version }));
    } else if (request.url === "/oauth/token") {
      response.end(JSON.stringify({ accessToken: "synthetic-bearer" }));
    } else if (request.url === "/api/auth/websocket-ticket") {
      response.end(JSON.stringify({ ticket: "synthetic-ticket" }));
    } else if (request.url === "/api/projects" && request.method === "GET") {
      response.end(JSON.stringify({ projects: [] }));
    } else if (request.headers[PROTOCOL_VERSION_HEADER] !== String(version)) {
      response.statusCode = 409;
      response.end(JSON.stringify({ error: { code: "protocol_version_mismatch" } }));
    } else {
      mutations++;
      response.end("{}");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const httpBase = `http://127.0.0.1:${server.address().port}`;
  const doctor = () => ({ versions: { remoteProtocolVersion: version } });
  const runCli = () => ({
    stdout: JSON.stringify({ pairingUrl: `${httpBase}/pair#token=synthetic-credential` }),
  });
  const old = await pairAndAuthenticate(runCli, "entry", {}, httpBase, fetch, doctor());
  assert.equal(old.token, "synthetic-bearer");
  assert.equal(old.protocolVersion, 71);
  assert.equal(requests[0].headers[PROTOCOL_VERSION_HEADER], undefined);
  assert.equal(requests[1].headers[PROTOCOL_VERSION_HEADER], undefined);
  const ticket = await jsonRequest(fetch, `${httpBase}/api/auth/websocket-ticket`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
  });
  assert.equal(ticket.body.ticket, "synthetic-ticket");
  await jsonRequest(fetch, `${httpBase}/api/projects`, {
    token: old.token,
    protocolVersion: old.protocolVersion,
  });
  assert.equal(requests.at(-1).headers[PROTOCOL_VERSION_HEADER], undefined);
  const add = await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
    body: { kind: "add-existing" },
  });
  assert.equal(add.status, 200);
  assert.equal(requests.at(-1).headers.authorization, "Bearer synthetic-bearer");
  assert.equal(requests.at(-1).headers[PROTOCOL_VERSION_HEADER], "71");
  version = 72; // Candidate replaces N-1 at the exact same origin.
  const refused = await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: old.token,
    method: "POST",
    protocolVersion: old.protocolVersion,
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, "protocol_version_mismatch");
  assert.equal(mutations, 1);
  const current = await pairAndAuthenticate(runCli, "entry", {}, httpBase, fetch, doctor());
  assert.equal(current.protocolVersion, 72);
  await jsonRequest(fetch, `${httpBase}/api/projects/command`, {
    token: current.token,
    method: "POST",
    protocolVersion: current.protocolVersion,
  });
  assert.equal(mutations, 2);
  const beforeMissing = requests.length;
  await assert.rejects(
    jsonRequest(fetch, `${httpBase}/api/projects/command`, { token: old.token, method: "POST" }),
    /positive safe integer/u,
  );
  assert.equal(requests.length, beforeMissing);
  assert.equal(
    redactSecrets(JSON.stringify({ accessToken: old.token })).includes(old.token),
    false,
  );
  assert.equal(redactSecrets(`Bearer ${old.token}`).includes(old.token), false);
  assert.equal(
    redactSecrets(`${httpBase}/ws?ticket=${ticket.body.ticket}`).includes(ticket.body.ticket),
    false,
  );
});

void test("qualification protocol discovery rejects malformed or contradictory declarations", async () => {
  const declared = (version) => async () =>
    new Response(JSON.stringify({ protocolVersion: version }));
  for (const version of [undefined, "13", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      readQualificationProtocolVersion(declared(version), "http://fixture.test", {
        versions: { remoteProtocolVersion: 13 },
      }),
      /positive safe integer/u,
    );
  }
  await assert.rejects(
    readQualificationProtocolVersion(declared(13), "http://fixture.test", {
      versions: { remoteProtocolVersion: 12 },
    }),
    /disagrees with doctor/u,
  );
  await assert.rejects(
    readQualificationProtocolVersion(declared(13), "http://fixture.test", {}),
    /doctor must declare/u,
  );
  const contract = await readFile(
    new URL("../src/shared/remote/protocol/core.ts", import.meta.url),
    "utf8",
  );
  assert.ok(contract.includes(`REMOTE_PROTOCOL_VERSION_HEADER = "${PROTOCOL_VERSION_HEADER}"`));
});
