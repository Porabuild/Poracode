import { parseArgs } from "node:util";
import { resolve as resolvePath } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Readable, Writable } from "node:stream";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { terminalText } from "./cliPrompts";
import { CliRunInteraction } from "./cliRunInteraction";
import { deriveLocationFromPath } from "@/shared/createProject";
import { projectIdentityKey } from "@/shared/projectIdentity";
import type { HostProjectSummary } from "@/shared/contracts/hostProjects";
import {
  HOST_RUN_BUFFER_BYTES,
  hostRunPreparationCommandSchema,
  hostRunResumePreparationCommandSchema,
  hostRunCommandSchema,
  hostRunOptionsSchema,
  hostRunMetadataSchema,
  hostRunReadSchema,
  hostRunResultSchema,
  hostRunCancellationSchema,
  hostRunDirectoryPreparationCommandSchema,
  hostRunDirectoryOptionsCommandSchema,
  hostRunDirectoryPreparationSchema,
  hostRunDirectoryOptionsSchema,
  hostRunFilesPreparationCommandSchema,
  hostRunFilesResumeCommandSchema,
  hostRunFilesDirectoryCommandSchema,
  type HostRunFinished,
} from "@/shared/contracts/hostRun";

type AdminRequest = (command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>;
export function parseRunCli(args: readonly string[]) {
  if (args[0] !== "run") return null;
  const parsed = parseArgs({
    args: args.slice(1),
    strict: true,
    allowPositionals: true,
    options: {
      project: { type: "string" },
      directory: { type: "string" },
      session: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "approval-policy": { type: "string" },
      sandbox: { type: "string" },
      wsl: { type: "string" },
      "prompt-stdin": { type: "boolean" },
      format: { type: "string" },
      options: { type: "boolean" },
      standalone: { type: "boolean" },
      file: { type: "string", multiple: true },
      interactive: { type: "boolean" },
    },
  });
  if (
    parsed.positionals.length !== (parsed.values["prompt-stdin"] || parsed.values.options ? 0 : 1)
  )
    throw new Error("Supply one quoted prompt or --prompt-stdin. Run poracode run --help.");
  const format = parsed.values.format ?? "text";
  const standalone = parsed.values.standalone === true;
  const interactive = parsed.values.interactive === true;
  if (interactive && (parsed.values.options || parsed.values["prompt-stdin"]))
    throw new Error(
      "--interactive requires a quoted prompt and terminal input; remove --options and --prompt-stdin.",
    );
  const files = parsed.values.file?.map((path) => {
    if (!path.length) throw new Error("--file requires a native regular file path.");
    const absolute = resolvePath(path);
    if (deriveLocationFromPath(absolute, process.platform).kind === "wsl")
      throw new Error(
        "--file requires native files on this host; WSL file fallback is not supported.",
      );
    return absolute;
  });
  if (files && parsed.values.options)
    throw new Error(
      "--file is for a task, not --options. Inspect options without file arguments first.",
    );
  if (format !== "text" && format !== "json")
    throw new Error("Run format must be text or json (NDJSON).");
  if (parsed.values.session !== undefined) {
    if (
      (
        [
          "project",
          "directory",
          "provider",
          "model",
          "effort",
          "approval-policy",
          "sandbox",
          "wsl",
          "options",
        ] as const
      ).some((key) => parsed.values[key] !== undefined)
    )
      throw new Error(
        "run --session uses the saved session's exact project, provider, environment and configuration. Remove target/configuration overrides and --options.",
      );
    const command = files
      ? hostRunFilesResumeCommandSchema.omit({ prompt: true }).parse({
          action: "run-resume-files-prepare",
          threadId: parsed.values.session,
          files,
        })
      : hostRunResumePreparationCommandSchema.omit({ prompt: true }).parse({
          action: "run-resume-prepare",
          threadId: parsed.values.session,
        });
    return {
      options: false as const,
      command,
      prompt: parsed.positionals[0],
      format,
      standalone,
      interactive,
    };
  }
  if (
    parsed.values.options &&
    (["model", "effort", "approval-policy", "sandbox", "prompt-stdin"] as const).some(
      (key) => parsed.values[key] !== undefined,
    )
  )
    throw new Error(
      "run --options accepts the project/directory, provider, selected environment and output format only.",
    );
  if (parsed.values.directory !== undefined) {
    if (parsed.values.project !== undefined)
      throw new Error("Choose --directory or --project, not both.");
    if (!parsed.values.directory.length)
      throw new Error("Specify a directory path; use . for the current directory.");
    const directory = resolvePath(parsed.values.directory);
    if (
      parsed.values.wsl !== undefined ||
      deriveLocationFromPath(directory, process.platform).kind === "wsl"
    )
      throw new Error(
        "Controlled directory runs require a native directory. Use the selected WSL distro's supported terminal workflow; no project was registered or native fallback attempted.",
      );
    if (parsed.values.options) {
      const command = hostRunDirectoryOptionsCommandSchema.parse({
        action: "run-directory-options",
        directory,
        agentKind: parsed.values.provider,
      });
      return {
        options: true as const,
        command,
        prompt: undefined,
        format,
        standalone,
        interactive,
      };
    }
    const schema = files
      ? hostRunFilesDirectoryCommandSchema.omit({ prompt: true })
      : hostRunDirectoryPreparationCommandSchema.omit({ prompt: true });
    const command = schema.parse({
      action: files ? "run-directory-files-prepare" : "run-directory-prepare",
      ...(files ? { files } : {}),
      directory,
      agentKind: parsed.values.provider,
      model: parsed.values.model,
      ...(parsed.values.effort !== undefined ? { effort: parsed.values.effort } : {}),
      ...(parsed.values["approval-policy"] !== undefined
        ? { approvalPolicy: parsed.values["approval-policy"] }
        : {}),
      ...(parsed.values.sandbox !== undefined ? { sandboxMode: parsed.values.sandbox } : {}),
    });
    return {
      options: false as const,
      command,
      prompt: parsed.positionals[0],
      format,
      standalone,
      interactive,
    };
  }
  if (parsed.values.options) {
    const command = hostRunCommandSchema.parse({
      action: "run-options",
      projectId: parsed.values.project,
      agentKind: parsed.values.provider,
      ...(parsed.values.wsl !== undefined ? { wslDistro: parsed.values.wsl } : {}),
    });
    if (command.action !== "run-options") throw new Error("Invalid run options request.");
    return { options: true as const, command, prompt: undefined, format, standalone, interactive };
  }
  const schema = files
    ? hostRunFilesPreparationCommandSchema.omit({ prompt: true })
    : hostRunPreparationCommandSchema.omit({ prompt: true });
  const command = schema.parse({
    action: files ? "run-files-prepare" : "run-prepare",
    ...(files ? { files } : {}),
    projectId: parsed.values.project,
    agentKind: parsed.values.provider,
    model: parsed.values.model,
    ...(parsed.values.effort !== undefined ? { effort: parsed.values.effort } : {}),
    ...(parsed.values["approval-policy"] !== undefined
      ? { approvalPolicy: parsed.values["approval-policy"] }
      : {}),
    ...(parsed.values.sandbox !== undefined ? { sandboxMode: parsed.values.sandbox } : {}),
    ...(parsed.values.wsl !== undefined ? { wslDistro: parsed.values.wsl } : {}),
  });
  return {
    options: false as const,
    command,
    prompt: parsed.positionals[0],
    format,
    standalone,
    interactive,
  };
}

function readPrompt(input: Readable, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      bytes = 0;
    const cleanup = () => {
      input.off("data", data);
      input.off("close", closed);
      input.off("end", end);
      input.off("error", fail);
      signal.removeEventListener("abort", cancel);
      input.pause();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const cancel = () => fail(signal.reason);
    const closed = () => fail(new Error("Run prompt input closed before EOF."));
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 65_536) return fail(new Error("Run prompt stdin exceeds 64 KiB."));
      try {
        text += decoder.decode(chunk, { stream: true });
      } catch (error) {
        fail(error);
      }
    };
    const end = () => {
      try {
        text += decoder.decode();
        cleanup();
        resolve(text);
      } catch (error) {
        fail(error);
      }
    };
    input.on("data", data);
    input.once("end", end);
    input.on("error", fail);
    input.once("close", closed);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else input.resume();
  });
}

function assertDirectorySelection(directory: string, project: HostProjectSummary) {
  const options = { caseInsensitivePosix: process.platform === "darwin" };
  if (
    project.disabled ||
    projectIdentityKey({ location: project.location }, options) !==
      projectIdentityKey({ location: deriveLocationFromPath(directory, process.platform) }, options)
  )
    throw new Error(
      "The owner returned a different or disabled directory project. No run was started.",
    );
}

export async function runRunCli(
  input: NonNullable<ReturnType<typeof parseRunCli>>,
  connect: (signal: AbortSignal) => Promise<AdminRequest>,
  streams: { stdout: Writable; stdin: Readable; stderr?: Writable & { isTTY?: boolean } } = {
    stdout: process.stdout,
    stdin: process.stdin,
  },
  lifetime: { signal?: AbortSignal; finalize?: () => Promise<void> } = {},
) {
  const controller = new AbortController();
  const stderr = streams.stderr ?? process.stderr;
  if (input.interactive && (!(streams.stdin as { isTTY?: boolean }).isTTY || !stderr.isTTY))
    throw new Error(
      "--interactive requires terminal stdin and stderr. Use a noninteractive run for scripts.",
    );
  const { stdout } = streams;
  let outputError: Error | undefined;
  let rejectWrite: ((error: Error) => void) | undefined;
  let pendingOutput = Promise.resolve();
  const fail = (error: Error) => {
    outputError ??= error;
    rejectWrite?.(error);
    controller.abort(error);
  };
  const cancel = () => fail(new Error("CLI run cancelled."));
  const closed = () => fail(new Error("CLI run output closed unexpectedly."));
  const abortOutput = () => {
    if (rejectWrite) stdout.destroy(controller.signal.reason as Error);
  };
  stdout.on("error", fail);
  stdout.once("close", closed);
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  controller.signal.addEventListener("abort", abortOutput);
  const cancelLifetime = () =>
    fail(
      lifetime.signal?.reason instanceof Error
        ? lifetime.signal.reason
        : new Error("CLI run cancelled."),
    );
  lifetime.signal?.addEventListener("abort", cancelLifetime, { once: true });
  if (lifetime.signal?.aborted) cancelLifetime();
  const write = async (text: string) => {
    const joined = Promise.withResolvers<void>();
    pendingOutput = joined.promise;
    try {
      await new Promise<void>((resolve, reject) => {
        rejectWrite = reject;
        try {
          stdout.write(text, (error) => {
            joined.resolve();
            if (error) {
              fail(error);
              reject(error);
            } else resolve();
          });
        } catch (error) {
          joined.resolve();
          reject(error);
        }
      });
    } finally {
      rejectWrite = undefined;
    }
  };
  let request: AdminRequest | undefined;
  let active: ReturnType<typeof hostRunMetadataSchema.parse> | undefined;
  let start: Promise<ReturnType<typeof hostRunResultSchema.parse> | undefined> | undefined;
  let failure: unknown;
  const cleanupErrors: unknown[] = [];
  let interaction: CliRunInteraction | undefined;
  try {
    controller.signal.throwIfAborted();
    if (input.options) {
      request = await connect(controller.signal);
      const response = await request(input.command, controller.signal);
      let options: ReturnType<typeof hostRunOptionsSchema.parse>;
      if (input.command.action === "run-directory-options") {
        const directory = hostRunDirectoryOptionsSchema.parse(response);
        assertDirectorySelection(input.command.directory, directory.project);
        options = directory.options;
        if (options.projectId !== directory.project.id)
          throw new Error("The owner returned options for a different execution target.");
      } else {
        options = hostRunOptionsSchema.parse(response);
        if (options.projectId !== input.command.projectId)
          throw new Error("The owner returned options for a different execution target.");
      }
      if (options.agentKind !== input.command.agentKind)
        throw new Error("The owner returned options for a different execution target.");
      await write(
        input.format === "json"
          ? JSON.stringify(options) + "\n"
          : [
              "Models:",
              ...options.models.map(
                (model) =>
                  `  ${terminalText(model.id)}  ${terminalText(model.label)}${model.efforts.length ? ` (effort: ${model.efforts.map(terminalText).join(", ")})` : ""}`,
              ),
              "Approval policies:",
              ...options.approvalPolicies.map(
                (option) => `  ${terminalText(option.id)}  ${terminalText(option.label)}`,
              ),
              "Sandbox modes:",
              ...options.sandboxModes.map(
                (option) => `  ${terminalText(option.id)}  ${terminalText(option.label)}`,
              ),
            ].join("\n") + "\n",
      );
    } else {
      const prompt = input.prompt ?? (await readPrompt(streams.stdin, controller.signal));
      const command =
        input.command.action === "run-files-prepare"
          ? hostRunFilesPreparationCommandSchema.parse({ ...input.command, prompt })
          : input.command.action === "run-resume-files-prepare"
            ? hostRunFilesResumeCommandSchema.parse({ ...input.command, prompt })
            : input.command.action === "run-directory-files-prepare"
              ? hostRunFilesDirectoryCommandSchema.parse({ ...input.command, prompt })
              : input.command.action === "run-resume-prepare"
                ? hostRunResumePreparationCommandSchema.parse({ ...input.command, prompt })
                : input.command.action === "run-directory-prepare"
                  ? hostRunDirectoryPreparationCommandSchema.parse({ ...input.command, prompt })
                  : hostRunPreparationCommandSchema.parse({ ...input.command, prompt });
      request = await connect(controller.signal);
      const response = await request(
        input.interactive ? { action: "run-interactive-prepare", command } : command,
        controller.signal,
      );
      let prepared: ReturnType<typeof hostRunMetadataSchema.parse>;
      if (
        command.action === "run-directory-prepare" ||
        command.action === "run-directory-files-prepare"
      ) {
        const directory = hostRunDirectoryPreparationSchema.parse(response);
        assertDirectorySelection(command.directory, directory.project);
        prepared = directory.run;
      } else prepared = hostRunMetadataSchema.parse(response);
      if (
        (command.action === "run-resume-prepare" ||
          command.action === "run-resume-files-prepare") &&
        prepared.threadId !== command.threadId
      )
        throw new Error(
          "The owner returned a different saved session. No start or cancellation was submitted.",
        );
      active = prepared;
      const selected = active;
      const send = request;
      if (input.interactive)
        interaction = new CliRunInteraction({
          metadata: selected,
          request: send,
          signal: controller.signal,
          input: streams.stdin,
          output: stderr,
          fail,
        });
      const assertIdentity = (value: { runId: string; threadId: string }) => {
        if (value.runId !== selected.runId || value.threadId !== selected.threadId)
          throw new Error("The owner returned a different CLI run. No output was accepted.");
      };
      start = send({ action: "run-start", runId: selected.runId }, controller.signal)
        .then((value) => {
          const result = hostRunResultSchema.parse(value);
          assertIdentity(result);
          return result;
        })
        .catch((error: unknown) => {
          fail(error instanceof Error ? error : new Error("CLI run failed."));
          return undefined;
        });
      let cursor = 0;
      let final: HostRunFinished | undefined;
      const text = new Map<string, { value: string; bytes: number }>();
      let textBytes = 0;
      for (;;) {
        controller.signal.throwIfAborted();
        const page = hostRunReadSchema.parse(
          await send({ action: "run-read", runId: selected.runId, cursor }, controller.signal),
        );
        assertIdentity(page);
        if (page.cursor !== cursor || page.nextCursor !== cursor + page.events.length)
          throw new Error("CLI output cursor mismatch. Output was not accepted.");
        for (const event of page.events) {
          if (final) throw new Error("The owner sent output after CLI run completion.");
          if (input.format === "json")
            await write(JSON.stringify({ ...selected, ...event }) + "\n");
          if (event.type === "run.finished") final = event;
          if (input.format === "text" && event.type === "text.delta") {
            const before = text.get(event.itemId) ?? { value: "", bytes: 0 };
            const next = {
              value: event.replace ? event.text : before.value + event.text,
              bytes: (event.replace ? 0 : before.bytes) + Buffer.byteLength(event.text),
            };
            textBytes += next.bytes - before.bytes;
            if (textBytes > HOST_RUN_BUFFER_BYTES)
              throw new Error(
                "Text output exceeds 1 MiB. Use --format json to stream larger output.",
              );
            if (!text.has(event.itemId) && text.size >= 4_096)
              throw new Error(
                "Text output exceeds 4,096 items. Use --format json to stream larger output.",
              );
            text.set(event.itemId, next);
          }
        }
        cursor = page.nextCursor;
        if (page.finished) break;
        await interaction?.poll();
        await delay(50, undefined, { signal: controller.signal });
      }
      const result = await start;
      controller.signal.throwIfAborted();
      if (!result || !final || JSON.stringify(result.result) !== JSON.stringify(final))
        throw new Error("The CLI run did not confirm matching output, history and retirement.");
      if (input.format === "text" && text.size)
        await write([...text.values()].map((item) => item.value).join("\n") + "\n");
      if (final.state !== "completed" || !final.historyCommitted || !final.retirementConfirmed)
        throw new Error(
          `${final.error ?? `CLI run ended as ${final.state}.`} Run sessions inspect ${selected.threadId}.`,
        );
    }
  } catch (error) {
    failure = outputError ?? error;
    controller.abort(error);
  } finally {
    interaction?.stop();
    if (active && request) {
      try {
        const retired = hostRunCancellationSchema.parse(
          await request({ action: "run-cancel", runId: active.runId }),
        );
        if (retired.runId !== active.runId || retired.threadId !== active.threadId)
          cleanupErrors.push(new Error("CLI retirement returned a different run."));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await start;
    await interaction?.join();
    await pendingOutput;
    try {
      await lifetime.finalize?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    stdout.off("error", fail);
    stdout.off("close", closed);
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    controller.signal.removeEventListener("abort", abortOutput);
    lifetime.signal?.removeEventListener("abort", cancelLifetime);
  }
  failure ??= outputError;
  if (cleanupErrors.length)
    throw new AggregateError(
      failure === undefined ? cleanupErrors : [failure, ...cleanupErrors],
      "CLI run cleanup was not confirmed. Inspect the retained session and doctor output.",
      { cause: failure ?? cleanupErrors[0] },
    );
  if (failure !== undefined)
    throw failure instanceof Error ? failure : new Error("CLI run failed.", { cause: failure });
}
