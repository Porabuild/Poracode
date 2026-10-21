import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import {
  PTY_JOB_CONTROL_MAX_BYTES,
  ptyJobNonceSchema,
  ptyJobReplySchema,
  type PtyJobReply,
} from "@/shared/contracts/ptyJobOwner";

export interface PtyBrokerProof {
  operationId: string;
  creationTicks: string;
  signal: AbortSignal;
}

interface WindowsPtyJobOptions {
  /** Already admitted absolute helper path, never a PATH lookup or provider option. */
  executable: string;
  /** Private bootstrap child: it must not spawn a provider before assignment. */
  broker: ChildProcessWithoutNullStreams;
  nonce: string;
  /** Only OS bootstrap values are retained; credentials never enter the helper. */
  env: NodeJS.ProcessEnv;
  onFailure?: (error: Error) => void;
}

export function ptyBootstrapEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === "string" &&
      /^(?:path|systemroot|windir|comspec|pathext|temp|tmp|processor_architecture|number_of_processors|programfiles(?:\(x86\))?|programw6432|commonprogramfiles|os|userprofile|home|appdata|localappdata)$/iu.test(
        key,
      )
    )
      env[key] = value;
  }
  return env;
}

/** One kernel job, one captured bootstrap and one joined retirement operation. */
export class WindowsPtyJob {
  readonly nonce: string;
  private readonly helper: ChildProcessWithoutNullStreams;
  private readonly helperLifetime: ChildProcessLifetime;
  private readonly brokerLifetime: ChildProcessLifetime;
  private readonly abort = new AbortController();
  private readonly ready = Promise.withResolvers<void>();
  private phase: "ready" | "bound" | "active" = "ready";
  private pending:
    | {
        kind: "prepared-v1" | "assigned-v1";
        resolve: (reply: PtyJobReply) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  private carry = "";
  private starting: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private closeRequested = false;
  private assignmentRequested = false;
  private retired = false;
  private confirmed = false;
  private failure: Error | undefined;

  constructor(private readonly options: WindowsPtyJobOptions) {
    this.nonce = ptyJobNonceSchema.parse(options.nonce);
    this.brokerLifetime = new ChildProcessLifetime(options.broker);
    this.helper = spawn(options.executable, ["--pty-job-v1", this.nonce, String(process.pid)], {
      env: ptyBootstrapEnvironment(options.env),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.helperLifetime = new ChildProcessLifetime(this.helper);
    // Startup can fail before the caller asks for admission. Retain the same
    // rejecting promise without producing an unhandled rejection in that gap.
    void this.ready.promise.catch(() => {});
    this.helper.stdout.setEncoding("utf8");
    this.helper.stdout.on("data", (chunk: string) => this.read(chunk));
    this.helper.stderr.resume();
    for (const stream of [this.helper.stdin, this.helper.stdout, this.helper.stderr]) {
      stream.on("error", () => this.fail(new Error("Windows PTY job control pipe failed.")));
    }
    this.helper.on("error", () => this.fail(new Error("Windows PTY job helper could not start.")));
    this.helper.once("close", () => {
      if (!this.closeRequested || (this.assignmentRequested && !this.retired))
        this.fail(new Error("Windows PTY job retirement remains unconfirmed."));
    });
    options.broker.once("close", () => {
      if (!this.closeRequested)
        this.fail(new Error("Windows PTY bootstrap closed before joined retirement."));
    });
    options.broker.on("error", () =>
      this.fail(new Error("Windows PTY bootstrap could not start.")),
    );
    for (const stream of [options.broker.stdin, options.broker.stdout, options.broker.stderr]) {
      stream.on("error", () => this.fail(new Error("Windows PTY bootstrap pipe failed.")));
    }
  }

  get exitConfirmed(): boolean {
    return this.confirmed;
  }

  assignBroker(prove: (proof: PtyBrokerProof) => Promise<void>): Promise<void> {
    if (this.starting || this.closeRequested)
      return Promise.reject(new Error("Windows PTY job admission is already used or closing."));
    this.starting = this.admit(prove);
    // Keep custody of the original admission through failure and close. The
    // caller still receives its original error; close joins this exact task.
    void this.starting.catch((error: unknown) => {
      if (!this.closeRequested)
        this.fail(error instanceof Error ? error : new Error("Windows PTY job admission failed."));
    });
    return this.starting;
  }

  close(): Promise<void> {
    if (this.confirmed) return Promise.resolve();
    if (this.closing) return this.closing;
    const result = Promise.withResolvers<void>();
    this.closing = result.promise;
    this.closeRequested = true;
    this.abort.abort(new Error("Windows PTY job admission cancelled."));
    this.ready.reject(this.abort.signal.reason);
    void this.retire().then(result.resolve, (error: unknown) => {
      // An unconfirmed stop retains both handles and may be joined/retried by
      // the existing session retirement owner, never replaced by a new job.
      this.closing = undefined;
      result.reject(error);
    });
    return result.promise;
  }

  private async admit(prove: (proof: PtyBrokerProof) => Promise<void>): Promise<void> {
    await this.ready.promise;
    this.abort.signal.throwIfAborted();
    const broker = this.options.broker;
    if (!Number.isSafeInteger(broker.pid) || broker.pid! <= 0)
      throw new Error("Windows PTY bootstrap has no owned process identity.");
    const prepared = await this.request("prepared-v1", `prepare-v1 ${this.nonce} 1 ${broker.pid}`);
    if (prepared[0] !== "prepared-v1" || prepared[2] !== "1" || prepared[3] !== String(broker.pid))
      throw new Error("Windows PTY captured process identity differs.");
    await prove({ operationId: "1", creationTicks: prepared[4], signal: this.abort.signal });
    this.abort.signal.throwIfAborted();
    if (broker.exitCode !== null || broker.signalCode !== null)
      throw new Error("Windows PTY bootstrap exited before job assignment.");
    // Once sent, cancellation owes a kernel-empty ACK even if assignment's
    // reply is still queued. Never classify this race as an unassigned child.
    this.assignmentRequested = true;
    const assigned = await this.request("assigned-v1", `assign-v1 ${this.nonce} 1`);
    if (assigned[0] !== "assigned-v1" || assigned[2] !== "1" || assigned[3] !== String(broker.pid))
      throw new Error("Windows PTY job assignment identity differs.");
    this.abort.signal.throwIfAborted();
  }

  private async retire(): Promise<void> {
    const immediateStops: Promise<void>[] = [];
    if (this.assignmentRequested) {
      if (!this.helper.stdin.destroyed && !this.helper.stdin.writableEnded)
        this.helper.stdin.end(`close-v1 ${this.nonce}\n`);
    } else {
      // No assignment was sent, so the bootstrap is still outside the job.
      // Retire the actual captured ChildProcesses before claiming no effects.
      immediateStops.push(this.brokerLifetime.stop(), this.helperLifetime.stop());
    }
    const stops = await Promise.allSettled(immediateStops);
    await this.starting?.catch(() => {});
    const failed = stops.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    await Promise.all([this.helperLifetime.closed, this.brokerLifetime.closed]);
    if (this.assignmentRequested && !this.retired)
      throw new Error("Windows PTY job did not confirm kernel process retirement.");
    this.confirmed = true;
  }

  private request(kind: "prepared-v1" | "assigned-v1", command: string): Promise<PtyJobReply> {
    this.abort.signal.throwIfAborted();
    if (this.pending) throw new Error("Windows PTY job already has a pending control request.");
    const result = Promise.withResolvers<PtyJobReply>();
    const cleanup = () => {
      this.pending = undefined;
      this.abort.signal.removeEventListener("abort", cancelled);
    };
    const cancelled = () => {
      cleanup();
      result.reject(this.abort.signal.reason);
    };
    this.pending = {
      kind,
      resolve: (reply) => {
        cleanup();
        result.resolve(reply);
      },
      reject: (error) => {
        cleanup();
        result.reject(error);
      },
    };
    this.abort.signal.addEventListener("abort", cancelled, { once: true });
    this.write(command);
    return result.promise;
  }

  private write(command: string): void {
    try {
      this.helper.stdin.write(`${command}\n`, (error) => {
        if (error) this.fail(new Error("Windows PTY job control write failed."));
      });
    } catch {
      this.fail(new Error("Windows PTY job control write failed."));
    }
  }

  private read(chunk: string): void {
    this.carry += chunk;
    let newline: number;
    while ((newline = this.carry.indexOf("\n")) !== -1) {
      if (newline >= PTY_JOB_CONTROL_MAX_BYTES) {
        this.carry = "";
        this.fail(new Error("Windows PTY job control frame exceeds its limit."));
        return;
      }
      const line = this.carry.slice(0, newline);
      this.carry = this.carry.slice(newline + 1);
      const parsed = ptyJobReplySchema.safeParse(line.split(" "));
      if (!parsed.success || parsed.data[1] !== this.nonce) {
        this.fail(new Error("Windows PTY job control identity or protocol differs."));
        return;
      }
      this.reply(parsed.data);
    }
    if (this.carry.length >= PTY_JOB_CONTROL_MAX_BYTES) {
      this.carry = "";
      this.fail(new Error("Windows PTY job control frame exceeds its limit."));
    }
  }

  private reply(reply: PtyJobReply): void {
    if (reply[0] === "ready-v1" && this.phase === "ready") {
      this.phase = "bound";
      if (!this.closeRequested) this.write(`bind-v1 ${this.nonce}`);
      return;
    }
    if (reply[0] === "bound-v1" && this.phase === "bound") {
      this.phase = "active";
      this.ready.resolve();
      return;
    }
    if (reply[0] === "retired-v1" && this.closeRequested) {
      this.retired = true;
      return;
    }
    if (this.closeRequested && (reply[0] === "prepared-v1" || reply[0] === "assigned-v1")) return;
    if (reply[0] === "error-v1") {
      this.fail(new Error(`Windows PTY job refused ${reply[2]}.`));
      return;
    }
    if (this.pending?.kind === reply[0]) {
      this.pending.resolve(reply);
      return;
    }
    this.fail(new Error("Windows PTY job received an unexpected control reply."));
  }

  private fail(error: Error): void {
    this.ready.reject(error);
    this.pending?.reject(error);
    const report = !this.failure && (!this.closeRequested || this.assignmentRequested);
    if (!this.failure) {
      this.failure = error;
    }
    // The promise remains retained by this owner and is joined by close().
    void this.close().catch(() => {});
    if (report) this.options.onFailure?.(error);
  }
}
