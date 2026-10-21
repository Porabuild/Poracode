import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import type { SupervisorCallOptions } from "@/host/supervisor/SupervisorClient";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { createShellPromptGate } from "@/shared/shellPromptReady";
import { toWslUncPath } from "@/shared/wsl";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import { ACP_AUTHENTICATION_CONTROL_VERSION } from "@/shared/contracts/agent";

function quotePosixShellArg(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function quotePowerShellArg(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export type AdminSupervisorCall = <Name extends SupervisorProcedureName>(
  name: Name,
  payload: IpcProcedurePayload<Name>,
  options?: Pick<SupervisorCallOptions, "assertLaunchCurrent">,
) => Promise<IpcProcedureResult<Name>>;
type AgentTarget = Pick<
  Extract<HostAdminCommand, { action: "auth-login" }>,
  "agentKind" | "wslDistro" | "runtime"
>;

export async function readAdminAgentStatus(call: AdminSupervisorCall, target: AgentTarget) {
  const response = await call("refreshAgentStatuses", {
    wslDistros: target.wslDistro ? [target.wslDistro] : [],
    scope: {
      agentKinds: [target.agentKind],
      envs: [target.wslDistro ? { kind: "wsl", distro: target.wslDistro } : { kind: "native" }],
    },
  });
  const status = [...response.windows, ...response.wsl].find(
    (candidate) =>
      candidate.kind === target.agentKind &&
      (target.wslDistro
        ? candidate.envKind === "wsl" && candidate.envDistro === target.wslDistro
        : candidate.envKind !== "wsl"),
  );
  if (!status?.installed)
    throw new Error(
      "Provider is not installed in this environment. Run providers list or providers install.",
    );
  if (!target.runtime) return status;
  const variant = status.runtimeVariants?.[target.runtime];
  if (!variant?.installed)
    throw new Error(
      "Provider runtime is unavailable. Run auth methods for the available runtimes.",
    );
  if (!variant.authUsesProviderLogin)
    throw new Error(
      "This runtime uses separate credentials. Configure its profile environment instead of the provider login.",
    );
  const hasRuntimeLogin =
    variant.loginCommand !== undefined ||
    variant.loginCommandDisplay !== undefined ||
    variant.authMethods !== undefined ||
    variant.authLogoutSupported !== undefined ||
    variant.preferTerminalLogin !== undefined;
  const login = hasRuntimeLogin ? variant : status;
  return {
    ...status,
    authState: variant.authState,
    providerMetadata: variant.providerMetadata,
    loginCommand: login.loginCommand,
    authMethods: login.authMethods,
    preferTerminalLogin: login.preferTerminalLogin,
    authLogoutSupported: login.authLogoutSupported,
  };
}

interface AuthSession {
  shellId: string;
  marker: string;
  lastRead: number;
  closing?: Promise<void>;
  outputStart?: number;
}

/** Transient login terminals are supervisor shells, never persisted threads. */
export class HostProviderAuth {
  private closed = false;
  private readonly cancellation = new AbortController();
  private readonly starting = new Set<Promise<unknown>>();
  private readonly sessions = new Map<string, AuthSession>();
  private readonly timer = setInterval(() => {
    for (const [id, session] of this.sessions) {
      if (Date.now() - session.lastRead > 120_000) void this.close(id).catch(() => undefined);
    }
  }, 30_000);

  constructor(private readonly call: AdminSupervisorCall) {
    this.timer.unref();
  }

  login(input: Extract<HostAdminCommand, { action: "auth-login" }>, context?: HostControlContext) {
    const pending = this.startLogin(input, context);
    this.starting.add(pending);
    void pending.finally(() => this.starting.delete(pending)).catch(() => undefined);
    return pending;
  }

  private async startLogin(
    input: Extract<HostAdminCommand, { action: "auth-login" }>,
    context?: HostControlContext,
  ) {
    const assertActive = () => {
      if (this.closed) throw new Error("Provider authentication is shutting down.");
      context?.assertActive();
    };
    assertActive();
    const status = await readAdminAgentStatus(this.call, input);
    assertActive();
    const methods = status.authMethods ?? [];
    const method = input.methodId
      ? methods.find((candidate) => candidate.id === input.methodId)
      : methods.length === 1
        ? methods[0]
        : undefined;
    if (input.methodId && !method)
      throw new Error("Unknown authentication method. Run auth methods <provider>.");
    if (!method && methods.length > 1 && !status.preferTerminalLogin)
      throw new Error(
        "Choose an authentication method with --method. Run auth methods <provider>.",
      );
    if (method?.type === "env_var")
      throw new Error(
        "This method requires environment credentials. For a compatible saved profile, use providers configure <profile-id> --prompt-env NAME for hidden terminal entry or --env-file for scripts. Other providers need their supported server environment setup. A profile save does not authenticate an upstream account.",
      );
    if (method && method.type !== "terminal" && !status.preferTerminalLogin) {
      const operationId = randomUUID();
      const signal = AbortSignal.any([
        this.cancellation.signal,
        ...(context ? [context.signal] : []),
      ]);
      let cancelled: Promise<void> | undefined;
      const cancel = () => {
        cancelled ??= this.call("controlAcpAuthentication", {
          version: ACP_AUTHENTICATION_CONTROL_VERSION,
          action: "cancel",
          operationId,
        });
        void cancelled.catch(() => undefined);
      };
      signal.throwIfAborted();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await this.call("controlAcpAuthentication", {
          version: ACP_AUTHENTICATION_CONTROL_VERSION,
          action: "start",
          operationId,
          agentKind: input.agentKind,
          methodId: method.id,
          envKind: input.wslDistro ? "wsl" : process.platform === "win32" ? "windows" : "posix",
          ...(input.wslDistro ? { wslDistro: input.wslDistro } : {}),
        });
        signal.throwIfAborted();
        assertActive();
        return { authenticated: true };
      } finally {
        signal.removeEventListener("abort", cancel);
        // The start reply and scoped cancellation both join supervisor custody.
        // Never detach authentication after only the local caller's abort.
        await cancelled;
      }
    }
    if (!status.loginCommand)
      throw new Error("This provider does not offer terminal login. Run auth methods <provider>.");
    if (this.sessions.size >= 8)
      throw new Error("Too many active CLI logins. Finish or cancel an existing login.");
    const sessionId = randomUUID();
    const shellId = `cli-auth:${sessionId}`;
    const marker = `__poracode_auth_${randomUUID()}__`;
    const location: ProjectLocation = input.wslDistro
      ? {
          kind: "wsl",
          distro: input.wslDistro,
          linuxPath: "/",
          uncPath: toWslUncPath(input.wslDistro, "/"),
        }
      : process.platform === "win32"
        ? { kind: "windows", path: homedir() }
        : { kind: "posix", path: homedir() };
    const windows = location.kind === "windows";
    const env = method?.type === "terminal" ? (method.env ?? {}) : {};
    // Provider commands own routing and quoting. Method environments carry the
    // same isolated account roots used by the desktop login overlay.
    const assignments = Object.entries(env).map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key))
        throw new Error("Invalid provider environment variable.");
      return windows
        ? `$env:${key} = ${quotePowerShellArg(value)}`
        : `export ${key}=${quotePosixShellArg(value)}`;
    });
    const command = status.loginCommand;
    const script = windows
      ? [
          `Write-Output '${marker}'`,
          ...assignments,
          "$global:LASTEXITCODE = 0",
          command,
          "$poracodeAuthOk = $?",
          "$poracodeAuthCode = if ($poracodeAuthOk) { 0 } elseif ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }",
          `Write-Output ('${marker}:exit:' + $poracodeAuthCode)`,
          "exit $poracodeAuthCode",
        ].join("; ")
      : [
          `printf '%s\\n' '${marker}'`,
          ...assignments,
          command,
          "poracode_auth_code=$?",
          `printf '\\n${marker}:exit:%s\\n' "$poracode_auth_code"`,
          'exit "$poracode_auth_code"',
        ].join("; ");
    // The shell may echo its input. An encoded script keeps credential-bearing
    // assignments out of the returned transcript; read() only returns bytes
    // after the decoded script actually prints its unpredictable marker.
    const encoded = Buffer.from(script).toString("base64");
    const launch = windows
      ? `& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))))\r`
      : `command bash -c 'eval "$(printf %s ${encoded} | base64 -d)"'\r`;
    this.sessions.set(sessionId, { shellId, marker, lastRead: Date.now() });
    try {
      await this.call("startShell", {
        shellId,
        projectLocation: location,
        startInHome: true,
        ...(windows ? { windowsShellRuntime: "powershell" as const } : {}),
      });
      assertActive();
      // Wait for shell startup output before writing, matching the desktop's
      // prompt barrier. Terminal queries during Windows startup need answers.
      const gate = createShellPromptGate();
      let seen = 0;
      let lastOutput = Date.now();
      for (let attempt = 0; attempt < 300; attempt += 1) {
        assertActive();
        const snapshot = await this.call("readTerminalSnapshot", { threadId: shellId });
        assertActive();
        const chunk = snapshot?.data.slice(seen) ?? "";
        if (chunk) {
          seen = snapshot!.data.length;
          lastOutput = Date.now();
          if (chunk.includes("\u001b[6n"))
            await this.call("writeTerminal", { threadId: shellId, data: "\u001b[1;1R" });
          if (chunk.includes("\u001b[0c"))
            await this.call("writeTerminal", { threadId: shellId, data: "\u001b[?1;2c" });
          if (gate.push(chunk) === "ready") break;
        }
        if (Date.now() - lastOutput >= gate.delayMs()) break;
        await delay(50);
      }
      await this.call("writeTerminal", { threadId: shellId, data: launch });
      assertActive();
      return { sessionId };
    } catch (error) {
      await this.close(sessionId);
      throw error;
    }
  }

  async read(id: string, cursor: number) {
    const session = this.require(id);
    session.lastRead = Date.now();
    const snapshot = await this.call("readTerminalSnapshot", { threadId: session.shellId });
    if (!snapshot) throw new Error("Login terminal is unavailable. Run auth login again.");
    const end = snapshot.data.indexOf(`${session.marker}:exit:`);
    const start = snapshot.data.indexOf(session.marker);
    if (session.outputStart === undefined && start >= 0 && start !== end)
      session.outputStart = snapshot.fromCursor + start + session.marker.length;
    // A fast login can finish before the first poll and roll the opening marker
    // out of the bounded transcript. The private completion marker still proves
    // the script ran; in that case return its retained output tail.
    if (session.outputStart === undefined && end >= 0) session.outputStart = snapshot.fromCursor;
    if (session.outputStart === undefined && snapshot.fromCursor > 0)
      throw new Error(
        "Login output exceeded the terminal buffer before its first read. Cancel this login and retry with quieter provider startup output.",
      );
    const match =
      end < 0
        ? undefined
        : /^(-?\d+)\r?\n/u.exec(snapshot.data.slice(end + session.marker.length + 6));
    const outputEnd = end < 0 ? snapshot.toCursor : snapshot.fromCursor + end;
    const from = Math.max(cursor, session.outputStart ?? snapshot.toCursor, snapshot.fromCursor);
    const output = snapshot.data.slice(
      from - snapshot.fromCursor,
      Math.max(from, outputEnd) - snapshot.fromCursor,
    );
    const finished = match !== undefined && match !== null;
    if (snapshot.processState === "exited" && !finished)
      throw new Error("Login terminal exited before authentication completed.");
    return {
      data: output,
      cursor: outputEnd,
      finished,
      ...(finished ? { exitCode: Number(match[1]) } : {}),
    };
  }

  async write(id: string, data: string) {
    const session = this.require(id);
    session.lastRead = Date.now();
    await this.call("writeTerminal", { threadId: session.shellId, data });
  }

  async close(id: string) {
    const session = this.require(id);
    if (session.closing) return session.closing;
    const pending = this.call("closeThreadConfirmed", { threadId: session.shellId }).then(
      (result) => {
        if (!result.confirmed)
          throw new Error("Login process exit was not confirmed; its owner retains the session.");
        this.sessions.delete(id);
      },
    );
    session.closing = pending;
    try {
      await pending;
    } catch (error) {
      delete session.closing;
      throw error;
    }
  }

  async dispose() {
    this.closed = true;
    this.cancellation.abort();
    clearInterval(this.timer);
    await Promise.allSettled(this.starting);
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }

  private require(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Login session expired. Run auth login again.");
    return session;
  }
}

export function adminProviderSummary(status: AgentStatus) {
  return {
    kind: status.kind,
    label: status.label,
    installed: status.installed,
    version: status.version,
    envKind: status.envKind,
    envDistro: status.envDistro,
    authState: status.authState,
    presentationAuthStates: status.presentationAuthStates,
    providerMetadata: status.providerMetadata,
    runtimes: Object.keys(status.runtimeVariants ?? {}),
  };
}
