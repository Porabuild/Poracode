import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LOOPBACK_HOST } from "./harness/constants.ts";
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
      expect(descriptor.protocolVersion).toBe(3);

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
});
