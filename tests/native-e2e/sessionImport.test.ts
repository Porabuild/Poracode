import { afterEach, expect, it } from "vitest";
import { pairAndAuth, startLab } from "./helpers/testClient";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("imports a listed CLI session as an inactive resumable thread and reconciles retries", async () => {
  lab = await startLab();
  const prepared = await fetch(new URL("/v1/checkpoints/session-import-ready", lab.controlUrl), {
    method: "POST",
    headers: { authorization: `Harness ${lab.capability}` },
  });
  expect(prepared.status).toBe(200);
  const { accessToken } = await pairAndAuth(lab, [
    "session:read",
    "session:operate",
    "projects:manage",
  ]);
  const call = (path: string, body?: unknown) =>
    fetch(new URL(path, lab!.httpBaseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  expect(await (await call("/.well-known/poracode/environment")).json()).toMatchObject({
    capabilities: { sessionImport: { versions: [1] } },
  });
  const listing = await (
    await call("/api/git/call", { procedure: "listImportableSessions", payload: {} })
  ).json();
  const session = listing.result.sessions[0];
  expect(session.model).toBe("gpt-5");
  const registration = { kind: "add-existing", path: session.cwd };
  const first = await (await call("/api/projects/command", registration)).json();
  const retry = await (await call("/api/projects/command", registration)).json();
  expect(retry.project.id).toBe(first.project.id);
  expect(retry.projects).toHaveLength(first.projects.length);
  const command = {
    kind: "import-session",
    projectId: first.project.id,
    agentKind: session.agentKind,
    model: session.model,
    title: session.title ?? session.preview,
    path: session.path,
    providerSessionId: session.providerSessionId,
  };
  expect((await call("/api/threads/imported-1/command", command)).status).toBe(200);
  expect((await call("/api/threads/imported-1/command", command)).status).toBe(409);
  const snapshot = await (await call("/api/snapshot")).json();
  expect(snapshot.threads).toHaveLength(2);
  expect(
    snapshot.threads.find((thread: { id: string }) => thread.id === "imported-1"),
  ).toMatchObject({
    status: "inactive",
    attention: "none",
    title: "CLI layout review",
    config: { model: "gpt-5", importedFrom: { path: session.path } },
    sessionRef: { providerSessionId: session.providerSessionId },
  });
  const history = await (await call("/api/threads/imported-1/history")).json();
  expect(history.thread.id).toBe("imported-1");
  expect(history.runtimeItems[0].payload.prompt).toBe(session.preview);
  expect(
    (await call("/api/threads/unknown-import/command", { ...command, path: "/not-listed" })).status,
  ).toBe(404);
});

it("filters the import listing and denies discovery to a read-only pairing", async () => {
  lab = await startLab();
  const { accessToken } = await pairAndAuth(lab, ["session:read", "projects:manage"]);
  const response = await fetch(new URL("/api/git/call", lab.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      procedure: "listImportableSessions",
      payload: { query: "no matching session" },
    }),
  });
  expect((await response.json()).result.sessions).toEqual([]);
  const readOnly = await pairAndAuth(lab, ["session:read"]);
  const denied = await fetch(new URL("/api/git/call", lab.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${readOnly.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ procedure: "listImportableSessions", payload: {} }),
  });
  expect(denied.status).toBe(403);
});
