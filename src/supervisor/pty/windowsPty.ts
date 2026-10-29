import {
  fork,
  type ChildProcessWithoutNullStreams,
  type ForkOptions,
  type SpawnOptions,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { basename, dirname } from "node:path";
import type { IPty, IWindowsPtyForkOptions } from "node-pty";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import { DEVICE_WORKSPACE_AGENT_KEY_ENV } from "@/shared/deviceWorkspaceAgentProof";
import {
  PTY_BROKER_CONTROL_MAX_BYTES,
  PTY_BROKER_INPUT_MAX_BYTES,
  PTY_BROKER_INPUT_MAX_CHUNKS,
  PTY_BROKER_PROTOCOL_VERSION,
  ptyBrokerLaunchSchema,
  ptyBrokerReplySchema,
  type PtyBrokerLaunch,
  type PtyBrokerReply,
  type PtyBrokerRequest,
} from "@/shared/contracts/ptyBroker";
import { sanitizeEnv, sanitizedProcessEnv } from "../runtime/threadSession/spawnDiagnostics";
import { registerManagedPty, type ManagedPtyCustody } from "./managedPty";
import { WindowsPtyJob, ptyBootstrapEnvironment } from "./windowsPtyJob";

interface WindowsPtyOptions {
  helperPath: string;
  brokerPath: string;
  /** Only an owned source-import fixture supplies loaders; packaged workers use none. */
  execArgv?: string[];
}

/** Synchronous session attachment with asynchronously cancellable native startup. */
export class WindowsPty implements IPty, ManagedPtyCustody {
  private readonly readyResult = Promise.withResolvers<void>();
  private readonly closedResult = Promise.withResolvers<void>();
  readonly ready = this.readyResult.promise;
  readonly closed = this.closedResult.promise;
  private readonly abort = new AbortController();
  private readonly nonce = randomBytes(24).toString("hex");
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<
    (event: { exitCode: number; signal?: number }) => void
  >();
  private readonly waiters = new Set<(frame?: PtyBrokerReply, error?: Error) => void>();
  private readonly launch: PtyBrokerLaunch;
  private readonly starting: Promise<void>;
  private broker: ChildProcessWithoutNullStreams | undefined;
  private bootstrapLifetime: ChildProcessLifetime | undefined;
  private job: WindowsPtyJob | undefined;
  private bootstrap: Extract<PtyBrokerReply, { kind: "ready" }> | undefined;
  private closing: Promise<void> | undefined;
  private closeRequested = false;
  private confirmed = false;
  private started = false;
  private startSent = false;
  private failure: Error | undefined;
  private processId = 0;
  private columns: number;
  private lines: number;
  private flowControl: boolean;
  private paused = false;
  private controlBytes = 0;
  private inputBytes = 0;
  private readonly pendingInput: Buffer[] = [];
  private exitCode = 0;
  private exitSignal: number | undefined;

  constructor(
    command: string,
    args: string[],
    options: IWindowsPtyForkOptions,
    private readonly paths: WindowsPtyOptions,
  ) {
    const env = sanitizeEnv(options.env ?? sanitizedProcessEnv);
    delete env[DEVICE_WORKSPACE_AGENT_KEY_ENV];
    const parsed = ptyBrokerLaunchSchema.safeParse({
      command,
      args,
      options: {
        ...options,
        name: options.name ?? "xterm-color",
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
        cwd: options.cwd ?? process.cwd(),
        env,
      },
    });
    if (
      !parsed.success ||
      Buffer.byteLength(JSON.stringify(parsed.data)) > PTY_BROKER_CONTROL_MAX_BYTES - 1024
    )
      throw new Error("Unsupported or oversized Windows PTY launch options.");
    this.launch = parsed.data;
    this.columns = parsed.data.options.cols;
    this.lines = parsed.data.options.rows;
    this.flowControl = parsed.data.options.handleFlowControl ?? false;
    registerManagedPty(this, this);
    void this.ready.catch(() => {});
    // Publish the runtime/lease synchronously before any process effect. A
    // close in the same turn can therefore cancel before either child starts.
    this.starting = Promise.resolve().then(() => this.initialize());
    void this.starting.catch((error: unknown) => {
      if (!this.closeRequested)
        this.fail(error instanceof Error ? error : new Error("Windows PTY startup failed."));
    });
  }

  get pid(): number {
    return this.processId;
  }
  get cols(): number {
    return this.columns;
  }
  get rows(): number {
    return this.lines;
  }
  get process(): string {
    return basename(this.launch.command);
  }
  get exitConfirmed(): boolean {
    return this.confirmed;
  }
  get handleFlowControl(): boolean {
    return this.flowControl;
  }
  set handleFlowControl(enabled: boolean) {
    this.flowControl = enabled;
    if (this.started && !this.closeRequested)
      this.send({
        version: PTY_BROKER_PROTOCOL_VERSION,
        nonce: this.nonce,
        kind: "flow-control",
        enabled,
      });
  }

  readonly onData: IPty["onData"] = (listener) => {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  };
  readonly onExit: IPty["onExit"] = (listener) => {
    this.exitListeners.add(listener);
    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  };

  write(data: string | Buffer): void {
    if (this.closeRequested) throw new Error("Terminal is closing; no input was accepted.");
    if (this.flowControl && typeof data === "string") {
      if (data === (this.launch.options.flowControlPause || "\x13")) {
        this.pause();
        return;
      }
      if (data === (this.launch.options.flowControlResume || "\x11")) {
        this.resume();
        return;
      }
    }
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    if (!this.started) {
      if (
        this.inputBytes + bytes.length > PTY_BROKER_INPUT_MAX_BYTES ||
        this.pendingInput.length >= PTY_BROKER_INPUT_MAX_CHUNKS
      )
        throw new Error(
          "Terminal startup input queue is full; wait for the terminal before retrying.",
        );
      this.pendingInput.push(Buffer.from(bytes));
      this.inputBytes += bytes.length;
      return;
    }
    if (this.broker!.stdin.writableLength + bytes.length > PTY_BROKER_INPUT_MAX_BYTES)
      throw new Error("Terminal input queue is full; wait before retrying.");
    this.broker!.stdin.write(bytes, (error) => {
      if (error) this.fail(new Error("Windows PTY input pipe failed."));
    });
  }

  resize(cols: number, rows: number): void {
    if (this.closeRequested) return;
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 1 ||
      rows < 1 ||
      cols > 65_535 ||
      rows > 65_535
    )
      throw new Error("Invalid terminal dimensions.");
    this.columns = cols;
    this.lines = rows;
    if (this.started)
      this.send({
        version: PTY_BROKER_PROTOCOL_VERSION,
        nonce: this.nonce,
        kind: "resize",
        cols,
        rows,
      });
  }
  clear(): void {
    if (this.started && !this.closeRequested)
      this.send({ version: PTY_BROKER_PROTOCOL_VERSION, nonce: this.nonce, kind: "clear" });
  }
  pause(): void {
    this.paused = true;
    if (this.started && !this.closeRequested)
      this.send({ version: PTY_BROKER_PROTOCOL_VERSION, nonce: this.nonce, kind: "pause" });
  }
  resume(): void {
    this.paused = false;
    if (this.started && !this.closeRequested)
      this.send({ version: PTY_BROKER_PROTOCOL_VERSION, nonce: this.nonce, kind: "resume" });
  }
  kill(signal?: string): void {
    if (signal !== undefined) throw new Error("Windows PTY termination does not accept a signal.");
    void this.close().catch(() => {});
  }

  close(): Promise<void> {
    if (this.confirmed) return Promise.resolve();
    if (this.closing) return this.closing;
    const result = Promise.withResolvers<void>();
    this.closing = result.promise;
    this.closeRequested = true;
    this.abort.abort(new Error("Windows PTY startup cancelled."));
    this.readyResult.reject(this.abort.signal.reason);
    this.pendingInput.length = 0;
    this.inputBytes = 0;
    void this.retire().then(result.resolve, (error: unknown) => {
      this.closing = undefined;
      result.reject(error);
    });
    return result.promise;
  }

  private async initialize(): Promise<void> {
    this.abort.signal.throwIfAborted();
    const options: ForkOptions & Pick<SpawnOptions, "windowsHide"> = {
      execPath: process.execPath,
      execArgv: this.paths.execArgv ?? [],
      cwd: dirname(this.paths.brokerPath),
      env: {
        ...ptyBootstrapEnvironment(process.env),
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      },
      serialization: "json",
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      windowsHide: true,
    };
    const broker = fork(
      this.paths.brokerPath,
      [this.nonce],
      options,
    ) as ChildProcessWithoutNullStreams;
    this.broker = broker;
    this.bootstrapLifetime = new ChildProcessLifetime(broker);
    broker.stdout.setEncoding("utf8");
    broker.stdout.on("data", (data: string) => {
      for (const listener of this.dataListeners) listener(data);
    });
    // Native errors may contain argv/environment details. Control sends only
    // bounded codes; never forward the worker's diagnostic stream as account data.
    broker.stderr.resume();
    broker.on("message", (frame: unknown) => this.receive(frame));
    broker.on("error", () => this.fail(new Error("Windows PTY broker could not start.")));
    broker.once("close", () => {
      if (!this.closeRequested) this.fail(new Error("Windows PTY broker closed unexpectedly."));
    });
    for (const stream of [broker.stdin, broker.stdout, broker.stderr])
      stream.on("error", () => {
        if (!this.closeRequested) this.fail(new Error("Windows PTY broker pipe failed."));
      });
    this.job = new WindowsPtyJob({
      executable: this.paths.helperPath,
      broker,
      nonce: this.nonce,
      env: process.env,
      onFailure: (error) => this.fail(error),
    });
    await this.job.assignBroker(async ({ operationId, creationTicks, signal }) => {
      const ready = await this.waitFrame("ready", signal);
      if (ready.kind !== "ready") throw new Error("Windows PTY bootstrap identity differs.");
      const proof = this.waitFrame("proof", signal);
      this.send({
        version: PTY_BROKER_PROTOCOL_VERSION,
        nonce: this.nonce,
        kind: "prove",
        operationId,
        creationTicks,
        bootstrapId: ready.bootstrapId,
      });
      const frame = await proof;
      if (
        frame.kind !== "proof" ||
        frame.pid !== broker.pid ||
        frame.bootstrapId !== ready.bootstrapId ||
        frame.operationId !== operationId ||
        frame.creationTicks !== creationTicks
      )
        throw new Error("Windows PTY private process proof differs.");
    });
    this.abort.signal.throwIfAborted();
    const started = this.waitFrame("started", this.abort.signal);
    this.startSent = true;
    this.send({
      version: PTY_BROKER_PROTOCOL_VERSION,
      nonce: this.nonce,
      kind: "start",
      launch: {
        ...this.launch,
        options: {
          ...this.launch.options,
          cols: this.columns,
          rows: this.lines,
          handleFlowControl: this.flowControl,
        },
      },
    });
    await started;
  }

  private async retire(): Promise<void> {
    // Kick cancellation before joining startup: it may be held in private proof
    // or native ConPTY creation in the isolated worker, never in this process.
    const retiring = this.job?.close() ?? this.bootstrapLifetime?.stop();
    await this.starting.catch(() => {});
    await retiring;
    if (this.job && !this.job.exitConfirmed)
      throw new Error("Windows PTY job retirement remains unconfirmed.");
    await this.bootstrapLifetime?.closed;
    this.confirmed = true;
    try {
      const event = {
        exitCode: this.failure ? 1 : this.exitCode,
        ...(this.exitSignal !== undefined ? { signal: this.exitSignal } : {}),
      };
      for (const listener of this.exitListeners) listener(event);
    } finally {
      this.closedResult.resolve();
      this.waiters.clear();
      this.dataListeners.clear();
      this.exitListeners.clear();
    }
  }

  private waitFrame(kind: PtyBrokerReply["kind"], signal: AbortSignal): Promise<PtyBrokerReply> {
    signal.throwIfAborted();
    if (kind === "ready" && this.bootstrap) return Promise.resolve(this.bootstrap);
    const result = Promise.withResolvers<PtyBrokerReply>();
    const stop = () => {
      this.waiters.delete(frame);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      result.reject(signal.reason);
    };
    const frame = (value?: PtyBrokerReply, error?: Error) => {
      if (error) {
        stop();
        result.reject(error);
      } else if (value?.kind === kind) {
        stop();
        result.resolve(value);
      }
    };
    this.waiters.add(frame);
    signal.addEventListener("abort", abort, { once: true });
    return result.promise;
  }

  private send(frame: PtyBrokerRequest): void {
    if (this.closeRequested) return;
    const broker = this.broker;
    if (!broker?.connected) {
      this.fail(new Error("Windows PTY control channel is disconnected."));
      return;
    }
    const bytes = Buffer.byteLength(JSON.stringify(frame));
    if (this.controlBytes + bytes > PTY_BROKER_CONTROL_MAX_BYTES) {
      this.fail(new Error("Windows PTY control queue exceeds its limit."));
      return;
    }
    this.controlBytes += bytes;
    try {
      broker.send(frame, (error: Error | null) => {
        this.controlBytes -= bytes;
        if (error && !this.closeRequested) this.fail(new Error("Windows PTY control send failed."));
      });
    } catch {
      this.controlBytes -= bytes;
      this.fail(new Error("Windows PTY control send failed."));
    }
  }

  private receive(message: unknown): void {
    if (Buffer.byteLength(JSON.stringify(message)) > PTY_BROKER_CONTROL_MAX_BYTES) {
      this.fail(new Error("Windows PTY control frame exceeds its limit."));
      return;
    }
    const parsed = ptyBrokerReplySchema.safeParse(message);
    if (!parsed.success || parsed.data.nonce !== this.nonce) {
      this.fail(new Error("Windows PTY broker protocol or identity differs."));
      return;
    }
    const frame = parsed.data;
    if (frame.kind === "ready") {
      if (this.bootstrap || frame.pid !== this.broker?.pid) {
        this.fail(new Error("Windows PTY bootstrap identity differs."));
        return;
      }
      this.bootstrap = frame;
    } else if (frame.kind === "error") {
      this.fail(
        new Error(
          `Windows PTY broker refused ${frame.code}. Check the selected executable and working directory.`,
        ),
      );
      return;
    } else if (frame.kind === "started") {
      if (!this.startSent || this.started) {
        this.fail(new Error("Windows PTY startup reply is out of order."));
        return;
      }
      if (!this.closeRequested) {
        this.processId = frame.pid;
        this.started = true;
        this.readyResult.resolve();
        if (this.paused)
          this.send({ version: PTY_BROKER_PROTOCOL_VERSION, nonce: this.nonce, kind: "pause" });
        for (const bytes of this.pendingInput)
          this.broker!.stdin.write(bytes, (error) => {
            if (error && !this.closeRequested)
              this.fail(new Error("Windows PTY input pipe failed."));
          });
        this.pendingInput.length = 0;
        this.inputBytes = 0;
      }
    } else if (frame.kind === "exited") {
      if (!this.started) {
        this.fail(new Error("Windows PTY exited before its startup reply."));
        return;
      }
      this.exitCode = frame.exitCode;
      this.exitSignal = frame.signal;
      void this.close().catch(() => {});
    }
    for (const waiter of [...this.waiters]) waiter(frame);
  }

  private fail(error: Error): void {
    const report = !this.failure && !this.closeRequested;
    this.failure ??= error;
    this.readyResult.reject(error);
    for (const waiter of [...this.waiters]) waiter(undefined, error);
    void this.close().catch(() => {});
    if (report)
      for (const listener of this.dataListeners) listener(`\r\n[poracode] ${error.message}\r\n`);
  }
}
