import { utimesSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readRemoteAccessSessions } from "../../src/main/remote/auth.ts";
import { findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import { expectOk } from "./helpers/sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts.ts";

it.each([false, true])(
  "rejects a concurrent stale save (separate credentials=%s)",
  async (separateCredentials) => {
    const repoRoot = findRepoRoot();
    const cleanup = new ProcessCleanup();
    let host: RealHostHandle | undefined;
    const clients: ProfileClient[] = [];
    try {
      host = await startRealHost({
        port: await allocateLoopbackPort(),
        cleanup,
        baseDirRoot: join(repoRoot, "tmp", ".tmp", "file-conflict-qa"),
      });
      const initialSessionIds = new Set(
        readRemoteAccessSessions(host.baseDir).map((session) => session.id),
      );
      const credential = await acquireDeviceCredential(host, "file-conflict");
      for (const label of ["editor-a", "editor-b"]) {
        const nextCredential =
          separateCredentials && label === "editor-b"
            ? await acquireDeviceCredential(host, "file-conflict-second-device")
            : credential;
        clients.push(
          await ProfileClient.create({
            handle: host,
            label,
            accessToken: nextCredential.accessToken,
          }),
        );
      }
      const accessSessionCount = new Set(
        readRemoteAccessSessions(host.baseDir)
          .map((session) => session.id)
          .filter((id) => !initialSessionIds.has(id)),
      ).size;
      expect(accessSessionCount).toBe(separateCredentials ? 2 : 1);
      const [first, second] = clients as [ProfileClient, ProfileClient];
      expect(first.accessToken !== second.accessToken).toBe(separateCredentials);
      const snapshot = await first.fetchJson("snapshot", "/api/snapshot");
      expectOk(snapshot.status, "snapshot", snapshot.body);
      const project = (
        snapshot.body as { projects: Array<{ location: { kind: string; path: string } }> }
      ).projects[0]!;
      expect(project.location.kind).toBe("posix");
      utimesSync(
        join(project.location.path, "README.md"),
        new Date(2000, 0, 1),
        new Date(2000, 0, 1),
      );
      const input = { projectLocation: project.location, path: "README.md" };
      const baseline = await first.gitProcedure("read", "readProjectFile", input);
      expectOk(baseline.status, "read baseline", baseline.body);
      const baseModifiedAtMs = (baseline.body as { modifiedAtMs: number }).modifiedAtMs;
      const edits = ["saved by editor A\n", "saved by editor B\n"];
      const writes = await Promise.all(
        clients.map((client, index) =>
          client.gitProcedure("save", "writeProjectFile", {
            ...input,
            content: edits[index],
            baseModifiedAtMs,
          }),
        ),
      );
      const winners = writes.flatMap((result, index) => (result.status === 200 ? [index] : []));
      expect(winners).toHaveLength(1);
      const loser = writes.find((result) => result.status !== 200)!;
      expect(loser.status).toBe(409);
      expect(loser.body).toEqual({
        error: {
          code: "file_save_conflict",
          message: "The file changed on disk. Reload it before saving.",
        },
      });
      const saved = await second.gitProcedure("read", "readProjectFile", input);
      expectOk(saved.status, "read winner", saved.body);
      expect((saved.body as { content: string }).content).toBe(edits[winners[0]!]);
      writeExperimentArtifact(
        repoRoot,
        separateCredentials ? "file-conflict-separate-devices.json" : "file-conflict.json",
        {
          accessSessionCount,
          preexistingHarnessSessions: initialSessionIds.size,
          statuses: writes.map((result) => result.status),
          winner: winners[0],
          conflict: loser.body,
          finalContent: (saved.body as { content: string }).content,
          scope:
            "One production backend, two authenticated connections; accessSessionCount identifies separately paired credentials. Native filesystem with a baseline older than timestamp tolerance; coarse timestamps and external-process races are separate gates.",
        },
      );
    } finally {
      try {
        await closeProfileClients(clients);
      } finally {
        try {
          await host?.stop();
        } finally {
          await cleanup.shutdown();
        }
      }
    }
  },
  120_000,
);
