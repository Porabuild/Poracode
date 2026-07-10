import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { REMOTE_STANDARD_SCOPES } from "@/shared/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { SshConnectionManager } from "./SshConnectionManager";

const target = process.env.LIGHTCODE_SSH_E2E_TARGET;
const identityFile = process.env.LIGHTCODE_SSH_E2E_IDENTITY;
const port = Number(process.env.LIGHTCODE_SSH_E2E_PORT ?? "22");
const runAgent = process.env.LIGHTCODE_SSH_E2E_AGENT === "1";
const agentProjectPath = process.env.LIGHTCODE_SSH_E2E_PROJECT;

describe.skipIf(!target || !identityFile)("SshConnectionManager real SSH", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const cacheDir = join(tmpdir(), "lightcode-ssh-e2e-runtime-bundles");
  mkdirSync(cacheDir, { recursive: true });
  const manager = new SshConnectionManager({
    mainBundleDir: join(root, "dist", "main"),
    agentPluginsDir: join(root, "resources", "agent-plugins"),
    wslHelpersDir: join(root, "resources", "wsl-helpers"),
    cacheDir,
    ...(process.platform === "win32" ? { sshConfigFile: "NUL" } : {}),
  });

  afterAll(async () => {
    await manager.dispose();
  });

  it(
    "installs, launches, tunnels, pairs, and optionally runs a remote agent",
    async () => {
      const connection = {
        id: crypto.randomUUID(),
        label: "Lightcode SSH E2E",
        target: target!,
        port,
        identityFile: identityFile!,
      };
      const connected = await manager.connect({
        connection,
        issuePairingCredential: true,
      });
      expect(connected.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(connected.pairingCredential).toMatch(/^lc_pair_/);

      const bootstrap = new RemoteDesktopClient(connected.endpoint);
      const token = await bootstrap.exchangePairingCredential({
        credential: connected.pairingCredential!,
        scopes: [...REMOTE_STANDARD_SCOPES],
        client: { label: "SSH E2E", deviceType: "desktop" },
      });
      const client = new RemoteDesktopClient(connected.endpoint, token.accessToken);
      const [environment, snapshot, initialStatuses] = await Promise.all([
        client.environment(),
        client.snapshot(),
        client.agentStatuses(),
      ]);
      expect(environment.platform).toBe("linux");
      expect(snapshot.projects).toBeInstanceOf(Array);
      expect(initialStatuses.windows).toBeInstanceOf(Array);

      const reused = await manager.connect({ connection });
      expect(reused.endpoint).toBe(connected.endpoint);

      const shellId = `shell:${crypto.randomUUID()}`;
      const ticket = await client.websocketTicket();
      const socket = new WebSocket(client.websocketUrl(ticket, snapshot.snapshotSeq));
      try {
        await new Promise<void>((resolveOpen, rejectOpen) => {
          socket.once("open", resolveOpen);
          socket.once("error", rejectOpen);
        });
        socket.send(JSON.stringify({ type: "terminal-watch", id: shellId }));
        const receivedTerminalOutput = new Promise<void>((resolveOutput, rejectOutput) => {
          const timer = setTimeout(
            () => rejectOutput(new Error("Timed out waiting for remote terminal output.")),
            15_000,
          );
          socket.on("message", (data) => {
            const message = client.parseSocketMessage(data.toString());
            if (message.type === "terminal-output" && message.id === shellId) {
              clearTimeout(timer);
              resolveOutput();
            }
          });
        });
        await client.startShell({
          shellId,
          projectLocation: { kind: "posix", path: "/tmp" },
          startInHome: true,
        });
        await receivedTerminalOutput;
        await client.writeTerminal({ threadId: shellId, data: "echo SSH_WS_OK\r" });
      } finally {
        await client.closeShell({ threadId: shellId }).catch(() => undefined);
        socket.close();
      }

      if (!runAgent) return;
      let statuses = initialStatuses;
      for (let attempt = 0; attempt < 60 && statuses.windows.length === 0; attempt += 1) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        statuses = await client.agentStatuses();
      }
      const agent = statuses.windows.find(
        (status) =>
          status.kind === "claude" &&
          status.installed &&
          status.authState !== "missing" &&
          status.capabilities.models.length > 0,
      );
      expect(
        agent,
        `Claude must be installed and signed in on the SSH target: ${JSON.stringify(
          statuses.windows,
          null,
          2,
        )}`,
      ).toBeDefined();
      expect(
        agentProjectPath,
        "LIGHTCODE_SSH_E2E_PROJECT is required for the agent probe",
      ).toBeTruthy();
      const projectResult = await client.projectCommand({
        kind: "add-existing",
        path: agentProjectPath!,
        name: "Lightcode SSH E2E",
      });
      const project = projectResult.project;
      expect(project).toBeDefined();
      const threadId = crypto.randomUUID();
      try {
        await client.startNewThread({
          threadId,
          projectId: project!.id,
          agentKind: agent!.kind,
          config: {
            model: agent!.capabilities.models[0]!.id,
            ...(agent!.capabilities.defaultApprovalPolicy
              ? { approvalPolicy: agent!.capabilities.defaultApprovalPolicy }
              : {}),
            ...(agent!.capabilities.defaultSandboxMode
              ? { sandboxMode: agent!.capabilities.defaultSandboxMode }
              : {}),
          },
          prompt: "Reply with exactly SSH_E2E_OK and do not use tools.",
          presentationMode: "terminal",
        });

        let scrollback = "";
        let acceptedWorkspaceTrust = false;
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const history = await client.threadHistory(threadId);
          scrollback = history.terminalScrollback ?? "";
          if (scrollback.includes("SSH_E2E_OK")) break;
          if (!acceptedWorkspaceTrust && scrollback.includes("Yes, I trust this folder")) {
            acceptedWorkspaceTrust = true;
            // Claude enables Kitty keyboard mode before showing this gate, so
            // Enter is encoded as CSI-u (the xterm surface sends the same bytes).
            await client.writeTerminal({ threadId, data: "\x1b[13;1u" });
          }
          if (history.thread.status === "error") {
            throw new Error(history.thread.errorMessage ?? scrollback.slice(-2_000));
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        }
        expect(scrollback).toContain("SSH_E2E_OK");
      } finally {
        await client.closeThread(threadId).catch(() => undefined);
        await client
          .projectCommand({ kind: "remove", projectId: project!.id })
          .catch(() => undefined);
      }
    },
    15 * 60_000,
  );
});
