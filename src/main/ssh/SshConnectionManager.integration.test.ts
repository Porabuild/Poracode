import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { REMOTE_STANDARD_SCOPES } from "@/shared/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { SshConnectionManager } from "./SshConnectionManager";

const target = process.env.PORACODE_SSH_E2E_TARGET;
const identityFile = process.env.PORACODE_SSH_E2E_IDENTITY;
const port = Number(process.env.PORACODE_SSH_E2E_PORT ?? "22");
const runAgent = process.env.PORACODE_SSH_E2E_AGENT === "1";
const agentProjectPath = process.env.PORACODE_SSH_E2E_PROJECT;
const preferredAgentKind = process.env.PORACODE_SSH_E2E_AGENT_KIND;
const agentPresentationMode =
  process.env.PORACODE_SSH_E2E_PRESENTATION === "gui" ? "gui" : "terminal";

function normalizedTerminalText(value: string): string {
  return stripAnsiPreservingLayout(value).replace(/\s+/gu, " ").trim();
}

function compactTerminalText(value: string): string {
  return normalizedTerminalText(value).replace(/\s+/gu, "");
}

describe.skipIf(!target || !identityFile)("SshConnectionManager real SSH", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const cacheDir = join(tmpdir(), "poracode-ssh-e2e-runtime-bundles");
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
        label: "Poracode SSH E2E",
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
      expect(environment.hostMode).toBe("helper");
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
          (!preferredAgentKind || status.kind === preferredAgentKind) &&
          status.installed &&
          status.authState !== "missing" &&
          status.capabilities.models.length > 0,
      );
      expect(
        agent,
        `${preferredAgentKind ?? "An agent"} must be installed and signed in on the SSH target: ${JSON.stringify(
          statuses.windows,
          null,
          2,
        )}`,
      ).toBeDefined();
      expect(
        agentProjectPath,
        "PORACODE_SSH_E2E_PROJECT is required for the agent probe",
      ).toBeTruthy();
      const projectResult = await client.projectCommand({
        kind: "add-existing",
        path: agentProjectPath!,
        name: "Poracode SSH E2E",
      });
      let project = projectResult.project;
      expect(project).toBeDefined();
      project = (
        await client.projectCommand({
          kind: "update",
          projectId: project!.id,
          patch: { name: "Poracode SSH E2E renamed", disabled: false },
        })
      ).project;
      expect(project?.name).toBe("Poracode SSH E2E renamed");
      const threadId = crypto.randomUUID();
      let threadDeleted = false;
      try {
        const threadConfig = {
          model: agent!.capabilities.models[0]!.id,
          ...(agent!.capabilities.defaultApprovalPolicy
            ? { approvalPolicy: agent!.capabilities.defaultApprovalPolicy }
            : {}),
          ...(agent!.capabilities.defaultSandboxMode
            ? { sandboxMode: agent!.capabilities.defaultSandboxMode }
            : {}),
        };
        await client.startNewThread({
          threadId,
          projectId: project!.id,
          agentKind: agent!.kind,
          config: threadConfig,
          prompt: "Reply with exactly SSH_E2E_OK and do not use tools.",
          presentationMode: agentPresentationMode,
        });

        let transcript = "";
        let acceptedWorkspaceTrust = false;
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const history = await client.threadHistory(threadId);
          const scrollback = history.terminalScrollback ?? "";
          transcript = `${scrollback}\n${JSON.stringify(history.runtimeItems)}\n${JSON.stringify(
            history.completedTurns,
          )}`;
          const terminalText = normalizedTerminalText(scrollback);
          const compactText = compactTerminalText(scrollback);
          if (normalizedTerminalText(transcript).includes("SSH_E2E_OK")) break;
          if (
            agentPresentationMode === "terminal" &&
            !acceptedWorkspaceTrust &&
            (terminalText.includes("Yes, I trust this folder") ||
              compactText.includes("Yes,Itrustthisfolder"))
          ) {
            acceptedWorkspaceTrust = true;
            // This prompt is emitted by Claude after it enables Kitty keyboard
            // mode, so Enter is encoded as CSI-u (the xterm surface sends the
            // same bytes).
            await client.writeTerminal({ threadId, data: "\x1b[13;1u" });
          } else if (
            agentPresentationMode === "terminal" &&
            !acceptedWorkspaceTrust &&
            (terminalText.includes("Do you trust the contents of this directory?") ||
              compactText.includes("Doyoutrustthecontentsofthisdirectory?"))
          ) {
            acceptedWorkspaceTrust = true;
            await client.writeTerminal({ threadId, data: "\r" });
          }
          if (history.thread.status === "error") {
            throw new Error(history.thread.errorMessage ?? transcript.slice(-2_000));
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        }
        expect(normalizedTerminalText(transcript)).toContain("SSH_E2E_OK");

        await client.sendThreadInput({
          threadId,
          prompt: "Reply with exactly SSH_FOLLOWUP_OK and do not use tools.",
          config: threadConfig,
        });
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const history = await client.threadHistory(threadId);
          transcript = `${history.terminalScrollback ?? ""}\n${JSON.stringify(
            history.runtimeItems,
          )}\n${JSON.stringify(history.completedTurns)}`;
          if (transcript.includes("SSH_FOLLOWUP_OK")) break;
          if (history.thread.status === "error") {
            throw new Error(history.thread.errorMessage ?? transcript.slice(-2_000));
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        }
        expect(normalizedTerminalText(transcript)).toContain("SSH_FOLLOWUP_OK");

        await client.sendThreadCommand({
          kind: "rename",
          threadId,
          title: "SSH helper renamed thread",
        });
        await client.sendThreadCommand({ kind: "set-starred", threadId, starred: true });
        let metadata = (await client.threadHistory(threadId)).thread;
        expect(metadata).toMatchObject({
          title: "SSH helper renamed thread",
          starred: true,
        });
        await client.sendThreadCommand({ kind: "set-done", threadId, done: true });
        metadata = (await client.threadHistory(threadId)).thread;
        expect(metadata).toMatchObject({
          title: "SSH helper renamed thread",
          done: true,
          starred: false,
        });
        await client.sendThreadCommand({ kind: "set-done", threadId, done: false });
        metadata = (await client.threadHistory(threadId)).thread;
        expect(metadata.done).toBe(false);

        await client.sendThreadCommand({ kind: "archive", threadId });
        metadata = (await client.threadHistory(threadId)).thread;
        expect(metadata.archived).toBe(true);
        await client.sendThreadCommand({ kind: "unarchive", threadId });
        metadata = (await client.threadHistory(threadId)).thread;
        expect(metadata.archived).toBe(false);

        await client.closeThread(threadId);
        await client.sendThreadCommand({ kind: "delete", threadId });
        threadDeleted = true;
      } finally {
        if (!threadDeleted) await client.closeThread(threadId).catch(() => undefined);
        await client
          .projectCommand({ kind: "remove", projectId: project!.id })
          .catch(() => undefined);
      }
    },
    15 * 60_000,
  );
});
