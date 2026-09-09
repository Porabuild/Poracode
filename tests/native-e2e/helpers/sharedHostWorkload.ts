import assert from "node:assert/strict";
import type { ProfileClient, ReceivedEvent } from "./concurrencyProfileClient.ts";

/** Workload units for the shared-host concurrency experiment. Each helper
 * performs real API round-trips and asserts functional invariants only. */

export interface WorkloadProject {
  readonly projectId: string;
  readonly locationPath: string;
}

export function expectOk(status: number, what: string, body: unknown): void {
  if (status !== 200) {
    throw new Error(`${what} failed with HTTP ${String(status)}: ${JSON.stringify(body)}`);
  }
}

export function posixLocation(project: WorkloadProject): Record<string, string> {
  return { kind: "posix", path: project.locationPath };
}

/** Key-order-insensitive serialization for set-membership checks on JSON docs
 * echoed back by the server. */
function canonicalJson(value: unknown): string {
  const sortDeep = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sortDeep);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, inner]) => [key, sortDeep(inner)]),
      );
    }
    return entry;
  };
  return JSON.stringify(sortDeep(value));
}

/** Renames the project and fans out. Event waiters are armed BEFORE the
 * mutation so the stream winning the race against the HTTP response is still
 * observed. Every stamp here (request start, response completion, event
 * arrival) is a monotonic `performance.now()` value, so sub-millisecond
 * propagation survives and samples can be negative — that is a real
 * measurement (the stream beat the response), not clock skew. */
export async function renameProjectAndAwaitFanout(
  mutator: ProfileClient,
  listeners: readonly ProfileClient[],
  project: WorkloadProject,
  uniqueName: string,
): Promise<{ propagationMs: number[]; endToEndMs: number; responseMs: number }> {
  const pending = listeners.map((client) =>
    client
      .awaitNextEvent(
        (event: ReceivedEvent) =>
          event.type === "remote-projects-changed" &&
          JSON.stringify(event.event).includes(uniqueName),
      )
      .catch((error: unknown) => {
        throw new Error(
          `${client.label}: no remote-projects-changed for ${uniqueName}: ${String(error)}`,
        );
      }),
  );
  const requestStartedAt = performance.now();
  const response = await mutator.fetchJson("project-update", "/api/projects/command", {
    method: "POST",
    body: { kind: "update", projectId: project.projectId, patch: { name: uniqueName } },
  });
  expectOk(response.status, `project rename to ${uniqueName}`, response.body);
  const responseDoneAt = performance.now();
  const body = response.body as { projects?: Array<{ id?: string; name?: string }> };
  const echoed = body.projects?.some(
    (entry) => entry.id === project.projectId && entry.name === uniqueName,
  );
  assert(echoed, "authoritative project list must echo the rename");
  const arrivals = await Promise.all(pending);
  return {
    propagationMs: arrivals.map((event) => event.arrivedAtMs - responseDoneAt),
    endToEndMs: arrivals.reduce(
      (worst, event) => Math.max(worst, event.arrivedAtMs - requestStartedAt),
      0,
    ),
    responseMs: responseDoneAt - requestStartedAt,
  };
}

/** Writes notes then reads them back through a second round-trip. Returns the
 * doc as the server holds it; the caller decides the assertion (sequenced
 * callers can demand exact equality, concurrent callers can only demand that
 * the shared doc holds one of the issued values). */
export async function writeAndReadBackNotes(
  client: ProfileClient,
  project: WorkloadProject,
  doc: unknown,
): Promise<unknown> {
  const write = await client.fetchJson("notes-write", `/api/projects/${project.projectId}/notes`, {
    method: "POST",
    body: { doc, todos: [], updatedAt: new Date().toISOString() },
  });
  expectOk(write.status, "project notes write", write.body);
  const read = await client.fetchJson("notes-read", `/api/projects/${project.projectId}/notes`);
  expectOk(read.status, "project notes read", read.body);
  return (read.body as { notes?: { doc?: unknown } }).notes?.doc;
}

async function createAndWriteFixtureFile(
  client: ProfileClient,
  project: WorkloadProject,
  relativePath: string,
  content: string,
): Promise<void> {
  const payload = { projectLocation: posixLocation(project), path: relativePath };
  const created = await client.gitProcedure("git-create-file", "createProjectEntry", {
    ...payload,
    type: "file",
  });
  expectOk(created.status, `createProjectEntry ${relativePath}`, created.body);
  const baseline = await client.gitProcedure("git-read-file", "readProjectFile", payload);
  expectOk(baseline.status, `readProjectFile baseline ${relativePath}`, baseline.body);
  const modifiedAtMs = (baseline.body as { modifiedAtMs?: number }).modifiedAtMs;
  assert(typeof modifiedAtMs === "number", "file read must include its modification time");
  const written = await client.gitProcedure("git-write-file", "writeProjectFile", {
    ...payload,
    content,
    baseModifiedAtMs: modifiedAtMs,
  });
  expectOk(written.status, `writeProjectFile ${relativePath}`, written.body);
}

export async function gitWriteStageAndVerify(
  client: ProfileClient,
  project: WorkloadProject,
  relativePath: string,
  content: string,
): Promise<void> {
  await createAndWriteFixtureFile(client, project, relativePath, content);
  const read = await client.gitProcedure("git-read-file", "readProjectFile", {
    projectLocation: posixLocation(project),
    path: relativePath,
  });
  expectOk(read.status, `readProjectFile ${relativePath}`, read.body);
  assert.strictEqual(
    (read.body as { content?: string }).content,
    content,
    `readProjectFile must return the written bytes for ${relativePath}`,
  );

  const stage = await client.gitProcedure("git-stage", "gitStage", {
    projectLocation: posixLocation(project),
    filePath: relativePath,
  });
  expectOk(stage.status, `gitStage ${relativePath}`, stage.body);
  const status = await client.gitProcedure("git-status", "getGitStatus", {
    projectLocation: posixLocation(project),
  });
  expectOk(status.status, "getGitStatus after stage", status.body);
  const staged = (status.body as { staged?: Array<{ path?: string }> }).staged ?? [];
  assert(
    staged.some((entry) => entry.path === relativePath),
    `staged list must contain ${relativePath}`,
  );
}

export const BURST_OPS_PER_CLIENT = 9;

/** Fires BURST_OPS_PER_CLIENT ops per client fully concurrently: durable file
 * write + read-back + fixture read + notes write/read + settings write + full
 * snapshot read. Under N-way concurrency the shared notes doc holds ONE of the
 * issued docs (last-writer-wins); a value outside the issued set means a lost
 * or stale read and fails. */
export async function runConcurrentBurst(
  clients: readonly ProfileClient[],
  project: WorkloadProject,
  sizeTag: string,
): Promise<void> {
  const issuedSettingsValues = new Set<string>();
  const issuedNoteDocs = new Set<string>();
  await Promise.all(
    clients.map(async (client) => {
      const label = `${sizeTag}-burst-${client.label}`;
      const content = `burst payload for ${label} at ${Date.now()}\n`;
      const relativePath = `shared-host-qa/${label}.txt`;
      await createAndWriteFixtureFile(client, project, relativePath, content);
      const read = await client.gitProcedure("git-read-file", "readProjectFile", {
        projectLocation: posixLocation(project),
        path: relativePath,
      });
      expectOk(read.status, `burst readProjectFile ${relativePath}`, read.body);
      assert.strictEqual(
        (read.body as { content?: string }).content,
        content,
        `burst read-back must return the written bytes for ${relativePath}`,
      );
      const readme = await client.gitProcedure("git-read-file", "readProjectFile", {
        projectLocation: posixLocation(project),
        path: "README.md",
      });
      expectOk(readme.status, "burst readProjectFile README.md", readme.body);
      assert.strictEqual(
        (readme.body as { content?: string }).content,
        "native-e2e fixture\n",
        "fixture README must read back byte-stable during the burst",
      );

      const noteDoc = { burst: label, writtenAt: Date.now() };
      issuedNoteDocs.add(canonicalJson(noteDoc));
      const readDoc = await writeAndReadBackNotes(client, project, noteDoc);
      assert(
        issuedNoteDocs.has(canonicalJson(readDoc)),
        `${client.label}: notes read-back must hold an issued doc of this burst, got ${JSON.stringify(readDoc)}`,
      );

      const unique = { [`${label}-${Date.now()}`]: true };
      issuedSettingsValues.add(JSON.stringify(unique));
      const settings = await client.fetchJson("settings-write", "/api/settings", {
        method: "POST",
        body: { searchExclude: unique },
      });
      expectOk(settings.status, "burst settings write", settings.body);
      const snapshot = await client.fetchJson("snapshot-read", "/api/snapshot");
      expectOk(snapshot.status, "burst snapshot read", snapshot.body);
    }),
  );
  // Persistence invariant under N-way concurrent settings writers: the shared
  // file ends up holding exactly one complete issued replacement, without interleaved/corrupt JSON.
  const judge = clients[0];
  if (!judge) throw new Error("burst ran with no clients");
  const final = await judge.fetchJson("settings-read", "/api/settings");
  expectOk(final.status, "post-burst settings read", final.body);
  const finalValue = (final.body as { settings?: { searchExclude?: unknown } }).settings
    ?.searchExclude;
  assert(
    issuedSettingsValues.has(JSON.stringify(finalValue)),
    "post-burst settings must hold exactly one issued value",
  );
}

/** Waits until every client's stream has absorbed the host cursor, then
 * validates EVERY client: its own authoritative snapshot matches the converged
 * seq and project list, its stream is contiguous, and its delivered-frame
 * accounting holds (replay windows included via first-delivered seq). */
export async function quiesceAndAssertConvergence(
  clients: readonly ProfileClient[],
  profileTag: string,
): Promise<number> {
  const head = clients[0];
  if (!head) throw new Error(`${profileTag}: quiesce ran with no clients`);
  // Monotonic deadline: convergence polling must not be perturbed by a
  // wall-clock step mid-run.
  const deadline = performance.now() + 20_000;
  let snapshotSeq = -1;
  for (;;) {
    const snapshot = await head.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, "quiesce snapshot read", snapshot.body);
    snapshotSeq = (snapshot.body as { snapshotSeq?: number }).snapshotSeq ?? -1;
    if (clients.every((client) => client.metrics.lastEventSeq === snapshotSeq)) break;
    if (performance.now() > deadline) {
      const progress = clients.map(
        (client) => `${client.label}: ${String(client.metrics.lastEventSeq)}`,
      );
      throw new Error(
        `${profileTag}: clients never converged on snapshot seq ${String(snapshotSeq)} (${progress.join(", ")})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const snapshotProjects: unknown[] = [];
  const lastProjectsEventByClient = new Map<string, unknown>();
  for (const client of clients) {
    const snapshot = await client.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, `${client.label} final snapshot read`, snapshot.body);
    const body = snapshot.body as { snapshotSeq?: number; projects?: unknown };
    assert.strictEqual(
      body.snapshotSeq,
      snapshotSeq,
      `${client.label}: snapshot seq must match the converged host cursor`,
    );
    assert.strictEqual(client.metrics.eventSeqGaps, 0, `${client.label}: event seq gaps`);
    assert.strictEqual(client.metrics.resyncRequiredCount, 0, `${client.label}: resync-required`);
    assert.strictEqual(
      client.metrics.lastEventSeq,
      snapshotSeq,
      `${client.label}: last event seq must match the host cursor`,
    );
    const first = client.metrics.firstEventSeq;
    if (first === null) {
      assert.strictEqual(client.metrics.eventsReceived, 0, `${client.label}: received no events`);
    } else {
      assert.strictEqual(
        client.metrics.eventsReceived,
        (client.metrics.lastEventSeq ?? 0) - first + 1,
        `${client.label}: delivered-frame accounting (replay included)`,
      );
    }
    snapshotProjects.push(body.projects);
    const projectsEvents = client
      .receivedEvents()
      .filter((event) => event.type === "remote-projects-changed");
    const last = projectsEvents[projectsEvents.length - 1];
    if (last) lastProjectsEventByClient.set(client.label, last.event.projects);
  }
  for (const entry of snapshotProjects) {
    assert.deepStrictEqual(
      entry,
      snapshotProjects[0],
      `${profileTag}: authoritative snapshot projects must match on every client`,
    );
  }
  const projectLists = [...lastProjectsEventByClient.values()];
  assert(projectLists.length > 0, `${profileTag}: no projects events were observed`);
  for (const entry of projectLists) {
    assert.deepStrictEqual(
      entry,
      projectLists[0],
      `${profileTag}: final projects event must be identical across clients`,
    );
  }
  return snapshotSeq;
}
