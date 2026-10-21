import { createInterface } from "node:readline/promises";
import { Writable, type Readable } from "node:stream";
import { finished } from "node:stream/promises";

export async function promptCli(
  question: string,
  options: {
    secret?: boolean;
    signal?: AbortSignal;
    input?: Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?(enabled: boolean): unknown };
    output?: Writable;
  } = {},
): Promise<string> {
  options.signal?.throwIfAborted();
  const input = options.input ?? process.stdin;
  const output: Writable = options.output ?? process.stderr;
  if (!input.isTTY)
    throw new Error(
      "This prompt requires an interactive terminal. Use explicit flags for scripts.",
    );
  if (options.secret && !input.setRawMode)
    throw new Error(
      "Hidden input is unavailable on this terminal. Use the command's supported private file/stdin input; nothing was saved.",
    );
  const controller = new AbortController();
  const priorRaw = input.isRaw === true;
  const priorFlowing = input.readableFlowing;
  let failure: unknown;
  let closing = false;
  const pendingOutput: Promise<void>[] = [];
  const fail = (error: unknown) => {
    failure ??= error;
    controller.abort(failure);
  };
  const cancel = () => fail(new Error("Input cancelled; nothing was saved."));
  const abort = () => fail(options.signal?.reason);
  const eof = () => {
    if (!closing) fail(new Error("Input closed before the prompt completed; nothing was saved."));
  };
  const outputClosed = () => fail(new Error("Prompt output closed before completion."));
  const relay = new Writable({
    write(chunk, encoding, callback) {
      if (options.secret) callback();
      else output.write(chunk, encoding, callback);
    },
  });
  const writeLabel = (text: string) => {
    pendingOutput.push(
      new Promise<void>((resolve) => {
        try {
          output.write(text, (error) => {
            if (error) fail(error);
            resolve();
          });
        } catch (error) {
          fail(error);
          resolve();
        }
      }),
    );
  };
  input.on("error", fail);
  output.on("error", fail);
  output.once("close", outputClosed);
  relay.on("error", fail);
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  options.signal?.addEventListener("abort", abort, { once: true });
  let prompt: ReturnType<typeof createInterface> | undefined;
  let answer: string | undefined;
  const cleanupErrors: unknown[] = [];
  try {
    if (options.signal?.aborted) abort();
    controller.signal.throwIfAborted();
    prompt = createInterface({ input, output: relay, terminal: true, historySize: 0 });
    prompt.on("SIGINT", cancel);
    prompt.on("close", eof);
    prompt.on("error", fail);
    if (options.secret && !input.isRaw)
      throw new Error("Hidden input could not disable terminal echo; nothing was saved.");
    if (options.secret) writeLabel(question);
    answer = await prompt.question(options.secret ? "" : question, { signal: controller.signal });
    if (options.secret) writeLabel("\n");
  } catch (error) {
    failure ??= error;
  } finally {
    closing = true;
    try {
      prompt?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    relay.end();
    try {
      await finished(relay, { cleanup: true });
    } catch (error) {
      failure ??= error;
    }
    await Promise.all(pendingOutput);
    if (output.errored) {
      try {
        await finished(output, { readable: false, cleanup: true });
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      if (input.setRawMode && input.isRaw !== priorRaw) input.setRawMode(priorRaw);
      if (priorFlowing) input.resume();
      else input.pause();
    } catch (error) {
      cleanupErrors.push(error);
    }
    input.off("error", fail);
    output.off("error", fail);
    output.off("close", outputClosed);
    relay.off("error", fail);
    prompt?.off("SIGINT", cancel);
    prompt?.off("close", eof);
    prompt?.off("error", fail);
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    options.signal?.removeEventListener("abort", abort);
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      failure === undefined ? cleanupErrors : [failure, ...cleanupErrors],
      "Terminal cleanup was not confirmed.",
      { cause: failure ?? cleanupErrors[0] },
    );
  if (failure !== undefined)
    throw failure instanceof Error ? failure : new Error("Prompt failed.", { cause: failure });
  return answer!;
}

export function terminalText(value: string): string {
  return value.replace(
    /[\p{Cc}\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
