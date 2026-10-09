import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_PROTOCOL_VERSION_HEADER,
} from "../../src/shared/remote/protocol.ts";
import { LOOPBACK_HOST } from "./harness/constants.ts";
import { currentClientProtocolHeaders } from "./harness/httpIo.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { missingServerArtifactBlocker, startRealHost } from "./harness/realHost.ts";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import { exchangeToken, issueTicket, openSocket, readWsMessage } from "./helpers/testClient.ts";

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const repoRootForSmoke = findRepoRoot();
const realHostEntrypoint = detectHeadlessServerEntrypoint(repoRootForSmoke);
const expectedArtifact = join(repoRootForSmoke, "dist/main/server.cjs");

describe("real production host smoke", () => {
  let cleanup: ProcessCleanup | undefined;
  let stop: (() => Promise<void>) | undefined;

  it("names an explicit blocker when the production artifact is absent", () => {
    const blocker = missingServerArtifactBlocker(repoRootForSmoke);
    expect(blocker.code).toBe("missing-server-artifact");
    expect(blocker.path).toBe(expectedArtifact);
    expect(realHostEntrypoint === null || existsSync(expectedArtifact)).toBe(true);
    expect(blocker.path).toBe(expectedArtifact);
  });

  afterEach(async () => {
    await stop?.();
    stop = undefined;
    await cleanup?.shutdown("test-end");
    cleanup = undefined;
  });

  it.skipIf(!realHostEntrypoint)(
    `starts the built headless host and walks environment/pair/token/ticket/socket${
      realHostEntrypoint
        ? ""
        : ` (skipped: ${missingServerArtifactBlocker(repoRootForSmoke).message})`
    }`,
    async () => {
      const repoRoot = repoRootForSmoke;
      const entrypoint = realHostEntrypoint;
      if (!entrypoint) {
        throw new Error(missingServerArtifactBlocker(repoRoot).message);
      }
      cleanup = new ProcessCleanup();

      const port = await allocateLoopbackPort();
      const host = await startRealHost({
        host: LOOPBACK_HOST,
        port,
        repoRoot,
        cleanup,
        startupTimeoutMs: 45_000,
      });
      stop = () => host.stop();

      const environment = await fetch(
        new URL("/.well-known/poracode/environment", host.httpBaseUrl),
      );
      expect(environment.status).toBe(200);
      const descriptor = (await environment.json()) as {
        protocolVersion: number;
        endpoints: unknown;
      };
      expect(descriptor.protocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);

      const pairing = await host.pair();
      const credential = pairingTokenFromUrl(pairing.pairingUrl);
      const token = await exchangeToken(host.httpBaseUrl, credential, ["session:read"]);
      expect(token.status).toBe(200);
      expect(token.accessToken.length).toBeGreaterThan(8);

      const ticket = await issueTicket(host.httpBaseUrl, token.accessToken);
      expect(ticket.status).toBe(200);

      const ws = openSocket(host.wsBaseUrl, ticket.ticket);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      expect(await readWsMessage(ws)).toMatchObject({ type: "ready" });
      ws.close();

      expect(host.entrypoint).toBe(entrypoint);
      expect(host.blockers.some((blocker) => blocker.code === "real-host-no-fault-injection")).toBe(
        true,
      );
      expect(host.entrypoint.endsWith("dist/main/server.cjs")).toBe(true);

      await host.restart();
      const afterRestart = await fetch(
        new URL("/.well-known/poracode/environment", host.httpBaseUrl),
      );
      expect(afterRestart.status).toBe(200);
      const pairingAgain = await host.pair();
      const credentialAgain = pairingTokenFromUrl(pairingAgain.pairingUrl);
      const tokenAgain = await exchangeToken(host.httpBaseUrl, credentialAgain, ["session:read"]);
      expect(tokenAgain.status).toBe(200);
    },
    90_000,
  );

  it.skipIf(!realHostEntrypoint)(
    "refuses old-generation writers without effect and admits the current client generation",
    async () => {
      cleanup = new ProcessCleanup();
      const host = await startRealHost({
        host: LOOPBACK_HOST,
        port: await allocateLoopbackPort(),
        repoRoot: repoRootForSmoke,
        cleanup,
        startupTimeoutMs: 45_000,
      });
      stop = () => host.stop();
      expect(
        host.blockers.filter((blocker) => blocker.code === "project-seed-unavailable"),
      ).toEqual([]);

      const pairing = await host.pair();
      const token = await exchangeToken(host.httpBaseUrl, pairingTokenFromUrl(pairing.pairingUrl), [
        "session:read",
        "projects:manage",
      ]);
      expect(token.status).toBe(200);
      const auth = { authorization: `Bearer ${token.accessToken}` };
      const listProjects = async () => {
        const snapshot = await fetch(new URL("/api/snapshot", host.httpBaseUrl), {
          headers: auth,
        });
        expect(snapshot.status).toBe(200);
        return ((await snapshot.json()) as { projects: Array<{ id: string; name: string }> })
          .projects;
      };
      const seeded = (await listProjects()).find((entry) => entry.name === "native-e2e-fixture");
      if (!seeded) throw new Error("seeded project native-e2e-fixture must exist");
      const seededName = async () =>
        (await listProjects()).find((entry) => entry.id === seeded.id)?.name;

      const rename = (name: string, generation: Record<string, string>) =>
        fetch(new URL("/api/projects/command", host.httpBaseUrl), {
          method: "POST",
          headers: { ...auth, "content-type": "application/json", ...generation },
          body: JSON.stringify({ kind: "update", projectId: seeded.id, patch: { name } }),
        });
      // An old client never declares the writer generation; a stale one
      // declares the previous generation. Both are refused before any effect.
      for (const generation of [
        {},
        { [REMOTE_PROTOCOL_VERSION_HEADER]: String(PORACODE_REMOTE_PROTOCOL_VERSION - 1) },
      ]) {
        const refused = await rename("old-writer-rename", generation);
        expect(refused.status).toBe(409);
        expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
          "protocol_version_mismatch",
        );
        expect(await seededName()).toBe("native-e2e-fixture");
      }

      const admitted = await rename("current-writer-rename", currentClientProtocolHeaders("POST"));
      expect(admitted.status).toBe(200);
      expect(await seededName()).toBe("current-writer-rename");
    },
    90_000,
  );
});
