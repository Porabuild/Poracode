import type { Readable, Writable } from "node:stream";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import {
  HOST_RUN_REQUEST_BYTES,
  hostRunRequestReadSchema,
  hostRunRequestReplySchema,
  type hostRunMetadataSchema,
  type hostRunPendingRequestSchema,
  type HostRunInteractiveCommand,
} from "@/shared/contracts/hostRun";
import type { z } from "zod";
import { promptCli, terminalText } from "./cliPrompts";

type PendingRequest = z.infer<typeof hostRunPendingRequestSchema>;
type Response = Extract<HostRunInteractiveCommand, { action: "run-request-respond" }>["response"];

/** One terminal prompt belongs to the current request token, never its replacement. */
export class CliRunInteraction {
  private active?: {
    token: string;
    controller: AbortController;
    pending: Promise<void>;
    submitting: boolean;
    done: boolean;
  };
  private closed = false;

  constructor(
    private readonly options: {
      metadata: z.infer<typeof hostRunMetadataSchema>;
      request(command: HostAdminCommand, signal?: AbortSignal): Promise<unknown>;
      signal: AbortSignal;
      input: Readable & {
        isTTY?: boolean;
        isRaw?: boolean;
        setRawMode?(enabled: boolean): unknown;
      };
      output: Writable;
      fail(error: Error): void;
    },
  ) {}

  async poll(): Promise<void> {
    if (this.closed) return;
    const { metadata, request, signal } = this.options;
    const page = hostRunRequestReadSchema.parse(
      await request({ action: "run-request-read", runId: metadata.runId }, signal),
    );
    this.assertIdentity(page);
    if (this.active?.submitting && !this.active.done) return;
    if (this.active && (this.active.done || this.active.token !== page.request?.requestToken)) {
      this.active.controller.abort(new Error("The request was resolved or replaced."));
      await this.active.pending;
      delete this.active;
    }
    signal.throwIfAborted();
    if (this.active || !page.request) return;
    const selected = page.request;
    const controller = new AbortController();
    const active = {
      token: selected.requestToken,
      controller,
      pending: Promise.resolve(),
      submitting: false,
      done: false,
    };
    this.active = active;
    active.pending = (async () => {
      try {
        const response = await this.answer(selected, AbortSignal.any([signal, controller.signal]));
        signal.throwIfAborted();
        controller.signal.throwIfAborted();
        active.submitting = true;
        const reply = hostRunRequestReplySchema.parse(
          await request(
            {
              action: "run-request-respond",
              runId: metadata.runId,
              requestToken: selected.requestToken,
              response,
            },
            signal,
          ),
        );
        this.assertIdentity(reply);
        if (reply.requestToken !== selected.requestToken)
          throw new Error("The owner confirmed a different request response.");
      } catch (error) {
        if (!signal.aborted && (active.submitting || !controller.signal.aborted))
          this.options.fail(
            error instanceof Error
              ? error
              : new Error("Interactive run input failed.", { cause: error }),
          );
      } finally {
        active.done = true;
      }
    })();
  }

  stop(): void {
    this.closed = true;
    this.active?.controller.abort(new Error("The run no longer needs terminal input."));
  }

  async join(): Promise<void> {
    await this.active?.pending;
  }

  private assertIdentity(value: { runId: string; threadId: string }): void {
    if (
      value.runId !== this.options.metadata.runId ||
      value.threadId !== this.options.metadata.threadId
    )
      throw new Error("The owner returned a different interactive run. No answer was submitted.");
  }

  private async answer(request: PendingRequest, signal: AbortSignal): Promise<Response> {
    const choices =
      request.payload.options ??
      (request.requestType === "tool_user_input"
        ? []
        : [
            { optionId: "allow", label: "Allow" },
            { optionId: "deny", label: "Deny" },
          ]);
    const context = [
      `\n${terminalText(request.requestType)}: ${terminalText(request.payload.summary)}`,
      ...(request.payload.details === undefined
        ? []
        : [`Details: ${terminalText(JSON.stringify(request.payload.details, null, 2))}`]),
      ...choices.map(
        (option, index) =>
          `${index + 1}. ${terminalText(option.label)}${option.description ? ` — ${terminalText(option.description)}` : ""}`,
      ),
    ].join("\n");
    let error = "";
    for (;;) {
      const value = await promptCli(
        `${context}\n${error}${choices.length ? `Choose ${request.payload.multiSelect ? "numbers separated by commas" : "a number"}, or j for a JSON response (Ctrl+C cancels): ` : "Enter j to provide a JSON response, or Ctrl+C to cancel: "}`,
        {
          input: this.options.input,
          output: this.options.output,
          signal,
        },
      );
      signal.throwIfAborted();
      if (value.trim().toLowerCase() === "j") {
        const raw = await promptCli("Response JSON (hidden; maximum 24 KiB): ", {
          input: this.options.input,
          output: this.options.output,
          secret: true,
          signal,
        });
        signal.throwIfAborted();
        if (Buffer.byteLength(raw) > HOST_RUN_REQUEST_BYTES) {
          error = "The response exceeds 24 KiB. Nothing was submitted.\n";
          continue;
        }
        try {
          return JSON.parse(raw) as Response;
        } catch {
          error = "Invalid JSON. Nothing was submitted.\n";
          continue;
        }
      }
      const numbers = value.trim().split(",");
      const indexes = numbers.map((number) => Number(number.trim()) - 1);
      if (
        !numbers.every((number) => /^[1-9]\d*$/u.test(number.trim())) ||
        (!request.payload.multiSelect && indexes.length !== 1) ||
        indexes.some(
          (index) => !Number.isSafeInteger(index) || index < 0 || index >= choices.length,
        ) ||
        new Set(indexes).size !== indexes.length
      ) {
        error = "Choose an advertised option or j; empty input does not approve.\n";
        continue;
      }
      const optionIds = indexes.map((index) => choices[index]!.optionId);
      return optionIds.length === 1
        ? { optionId: optionIds[0]! }
        : { optionId: optionIds[0]!, optionIds };
    }
  }
}
