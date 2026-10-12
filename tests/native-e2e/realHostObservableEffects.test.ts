import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import { acquireDeviceCredential, allocateLoopbackPort } from "./helpers/profileClientFactory.ts";
import { expectOk } from "./helpers/sharedHostWorkload.ts";

/**
 * E.2 observable-effect families against the REAL host (real PTY + real git
 * repo). This is the real-host peer for the device family journeys: the
 * keystroke family's typed bytes must come back as PTY echo through
 * `terminal-output`, and the git family's action (`gitStageAll`, the exact
 * procedure the device journeys drive) must change the repo index — read back
 * through the harness with `git status`, never through a device-side journal.
 *
 * Gated like the other real-host suites: it runs only when the built headless
 * server artifact exists (CI builds it; device-less runs skip).
 */
const realHostEntrypoint = detectHeadlessServerEntrypoint(findRepoRoot());

const STAGED_RELATIVE_PATH = "family-git/family-staged.txt";

it.skipIf(!realHostEntrypoint)(
  "terminal keystroke echoes on a real PTY and the git family stages into the real repo index",
  async () => {
    const repoRoot = findRepoRoot();
    const cleanup = new ProcessCleanup();
    let host: RealHostHandle | undefined;
    try {
      host = await startRealHost({
        port: await allocateLoopbackPort(),
        cleanup,
        baseDirRoot: join(repoRoot, "tmp", ".tmp", "real-host-observable"),
      });
      const credential = await acquireDeviceCredential(host, "observable-effects");
      const client = await ProfileClient.create({
        handle: host,
        label: "observable",
        accessToken: credential.accessToken,
      });
      const snapshot = await client.fetchJson("snapshot", "/api/snapshot");
      expectOk(snapshot.status, "snapshot", snapshot.body);
      const project = (
        snapshot.body as { projects: Array<{ location: { kind: string; path: string } }> }
      ).projects[0]!;
      expect(project.location.kind).toBe("posix");
      const projectPath = project.location.path;

      // --- terminal-keystroke family against a REAL PTY ---------------------
      const shellId = "observable-shell";
      const started = await client.fetchJson("terminal-start", "/api/terminal/start", {
        method: "POST",
        body: {
          shellId,
          projectLocation: project.location,
          initialSize: { cols: 80, rows: 24 },
        },
      });
      expectOk(started.status, "terminal/start", started.body);

      const ticket = await client.fetchJson("ws-ticket", "/api/auth/websocket-ticket", {
        method: "POST",
      });
      expectOk(ticket.status, "websocket-ticket", ticket.body);
      const ws = new WebSocket(
        `${host.wsBaseUrl.replace(/\/$/u, "")}/ws?ticket=${encodeURIComponent((ticket.body as { ticket: string }).ticket)}`,
      );
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve());
        ws.addEventListener("error", () => reject(new Error("ws open failed")));
      });
      ws.send(JSON.stringify({ type: "terminal-watch", id: shellId }));
      const typedLine = "echo poracode-qualify";
      const echoed = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PTY echo timeout")), 20_000);
        let buf = "";
        ws.addEventListener("message", (event) => {
          let frame: { type?: string; data?: string };
          try {
            frame = JSON.parse(String(event.data)) as typeof frame;
          } catch {
            return;
          }
          if (frame.type === "terminal-output" && typeof frame.data === "string") {
            buf += frame.data;
            if (buf.includes(typedLine)) {
              clearTimeout(timer);
              resolve(buf);
            }
          }
        });
      });
      const written = await client.fetchJson(
        "terminal-write",
        `/api/threads/${shellId}/terminal/write`,
        { method: "POST", body: { data: `${typedLine}\n` } },
      );
      expectOk(written.status, "terminal/write", written.body);
      // The typed bytes themselves come back as PTY echo through
      // terminal-output — not as a journal entry.
      await echoed;
      ws.close();

      // --- git family against a REAL repo -----------------------------------
      // Write the file the way the app does (procedures, not harness-side
      // writes), then drive the exact family action the device journeys drive.
      const created = await client.gitProcedure("git-create-file", "createProjectEntry", {
        projectLocation: project.location,
        path: STAGED_RELATIVE_PATH,
        type: "file",
      });
      expectOk(created.status, "createProjectEntry", created.body);
      const readBack = await client.gitProcedure("git-read-file", "readProjectFile", {
        projectLocation: project.location,
        path: STAGED_RELATIVE_PATH,
      });
      expectOk(readBack.status, "readProjectFile", readBack.body);
      const modifiedAtMs = (readBack.body as { modifiedAtMs?: number }).modifiedAtMs;
      expect(typeof modifiedAtMs).toBe("number");
      const writtenFile = await client.gitProcedure("git-write-file", "writeProjectFile", {
        projectLocation: project.location,
        path: STAGED_RELATIVE_PATH,
        content: "staged by the real-host git family journey\n",
        baseModifiedAtMs: modifiedAtMs,
      });
      expectOk(writtenFile.status, "writeProjectFile", writtenFile.body);
      const staged = await client.gitProcedure("git-stage-all", "gitStageAll", {
        projectLocation: project.location,
      });
      expectOk(staged.status, "gitStageAll", staged.body);

      // Observable effect, read through the harness from the REAL repo: the
      // family action must have changed the repo index.
      const porcelain = execFileSync("git", ["status", "--porcelain"], {
        cwd: projectPath,
        encoding: "utf8",
      });
      expect(
        porcelain.split("\n").some((line) => line.startsWith(`A  ${STAGED_RELATIVE_PATH}`)),
        `git status must show the staged file, got: ${porcelain}`,
      ).toBe(true);
      const status = await client.gitProcedure("git-status", "getGitStatus", {
        projectLocation: project.location,
      });
      expectOk(status.status, "getGitStatus after stage", status.body);
      const stagedPaths = (status.body as { staged?: Array<{ path?: string }> }).staged ?? [];
      expect(stagedPaths.some((entry) => entry.path === STAGED_RELATIVE_PATH)).toBe(true);
    } finally {
      await cleanup.shutdown();
    }
  },
  120_000,
);
