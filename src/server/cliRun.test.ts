import { Readable, Writable } from "node:stream";
import { resolve } from "node:path";
import { deriveLocationFromPath } from "@/shared/createProject";
import { expect, it, vi } from "vitest";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import {
  hostAdminRequest,
  hostAdminRequestSchema,
  hostAdminResultSchema,
} from "@/shared/hostAdminProtocol";
import {
  hostRunEventSchema,
  type HostRunEvent,
  type HostRunFinished,
} from "@/shared/contracts/hostRun";
import { parseServerCliCommand } from "./cliParse";
import { cliCommandHelp } from "./cliHelp";
import { parseRunCli, runRunCli } from "./cliRun";

const metadata = {
  formatVersion: 1,
  scope: "controlled-run",
  runId: "187b821c-8453-4b8f-afd3-f5538851dabb",
  threadId: "thread",
};
const final: HostRunFinished = {
  type: "run.finished",
  state: "completed",
  historyCommitted: true,
  retirementConfirmed: true,
};
const args = ["run", "--project", "project", "--provider", "neutral", "--model", "model"];

it.each([
  [args, "run-files-prepare"],
  [
    ["run", "--directory", ".", "--provider", "neutral", "--model", "model"],
    "run-directory-files-prepare",
  ],
  [["run", "--session", "thread"], "run-resume-files-prepare"],
] as const)("sends repeated native file paths under closed v21 for %s", async (target, action) => {
  const f = fixture();
  const input = parseRunCli([
    ...target,
    "--file",
    "first file.txt",
    "--file",
    "second.txt",
    "Explain files",
  ])!;
  await runRunCli(input, f.connect, f);
  const command = f.request.mock.calls[0]![0];
  expect(command).toMatchObject({
    action,
    files: [resolve("first file.txt"), resolve("second.txt")],
    prompt: "Explain files",
  });
  expect(hostAdminRequest(command).adminVersion).toBe(21);
  expect(f.output()).toBe("Hello\n");
});

it("rejects empty, excessive, WSL or options-only file selections before connecting", () => {
  for (const extra of [
    ["--file", "", "Explain"],
    [...Array.from({ length: 17 }, () => ["--file", "same.txt"]).flat(), "Explain"],
    ["--file", "\\\\wsl.localhost\\Selected\\file.txt", "Explain"],
    ["--file", "file.txt", "--options"],
  ])
    expect(() => parseRunCli([...args, ...extra])).toThrow(/native|16|for a task/u);
  expect(() =>
    parseRunCli([
      "run",
      "--session",
      "thread",
      "--model",
      "other",
      "--file",
      "file.txt",
      "Continue",
    ]),
  ).toThrow("saved session's exact");
  expect(
    parseRunCli([
      ...args,
      ...Array.from({ length: 16 }, () => ["--file", "same.txt"]).flat(),
      "Explain",
    ])!.command,
  ).toMatchObject({ files: Array(16).fill(resolve("same.txt")) });
});

it("negotiates opt-in interaction before preparation and keeps scripts noninteractive", async () => {
  expect(parseRunCli([...args, "Explain"])!.interactive).toBe(false);
  for (const conflict of [["--options"], ["--prompt-stdin"]])
    expect(() => parseRunCli([...args, "--interactive", ...conflict])).toThrow("quoted prompt");
  const f = fixture();
  const original = f.request.getMockImplementation()!;
  f.request.mockImplementation((command, signal) =>
    original(command.action === "run-interactive-prepare" ? command.command : command, signal),
  );
  const input = Object.assign(new Readable({ read() {} }), { isTTY: true });
  const stderr = Object.assign(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    { isTTY: true },
  );
  await runRunCli(parseRunCli([...args, "--interactive", "Explain"])!, f.connect, {
    ...f,
    stdin: input,
    stderr,
  });
  const command = f.request.mock.calls[0]![0];
  expect(command).toMatchObject({
    action: "run-interactive-prepare",
    command: { action: "run-prepare", prompt: "Explain" },
  });
  expect(hostAdminRequest(command).adminVersion).toBe(23);
  expect(f.output()).toBe("Hello\n");
});

it("refuses nonterminal interaction before connecting or consuming input", async () => {
  const f = fixture();
  await expect(
    runRunCli(parseRunCli([...args, "--interactive", "Explain"])!, f.connect, f),
  ).rejects.toThrow("terminal stdin and stderr");
  expect(f.connect).not.toHaveBeenCalled();
  expect(f.stdout.listenerCount("error")).toBe(0);
});

it("validates a file continuation's exact saved identity before sending start or cancellation", async () => {
  const f = fixture();
  f.request.mockResolvedValue({ ...metadata, threadId: "foreign" });
  await expect(
    runRunCli(
      parseRunCli(["run", "--session", "thread", "--file", "file.txt", "Continue"])!,
      f.connect,
      f,
    ),
  ).rejects.toThrow("different saved session");
  expect(f.request).toHaveBeenCalledOnce();
});

it("keeps standalone lifetime local to the CLI and leaves both admin envelopes unchanged", () => {
  const fresh = parseRunCli([...args, "--standalone", "Explain"])!;
  if (fresh.options) throw new Error("Expected a fresh run");
  expect(fresh.standalone).toBe(true);
  expect(hostAdminRequest({ ...fresh.command, prompt: fresh.prompt! }).adminVersion).toBe(15);
  const saved = parseRunCli(["run", "--standalone", "--session", "thread", "Continue"])!;
  if (saved.options) throw new Error("Expected a saved run");
  expect(saved.standalone).toBe(true);
  expect(hostAdminRequest({ ...saved.command, prompt: saved.prompt! }).adminVersion).toBe(19);
  expect(parseRunCli([...args, "Explain"])!.standalone).toBe(false);
  expect(parseRunCli([...args, "--", "--standalone"])!.standalone).toBe(false);
});
function fixture(
  events: HostRunEvent[] = [
    { type: "text.delta", itemId: "reply", text: "Hello", replace: false },
    final,
  ],
) {
  const completed = Promise.withResolvers<unknown>();
  let output = "";
  const stdout = new Writable({
    write(bytes, _encoding, callback) {
      output += bytes.toString();
      callback();
    },
  });
  const request = vi.fn<(command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>>(
    async (command) => {
      if (
        command.action === "run-prepare" ||
        command.action === "run-resume-prepare" ||
        command.action === "run-files-prepare" ||
        command.action === "run-resume-files-prepare"
      )
        return metadata;
      const project = (directory: string) => ({
        id: "project",
        name: "Fixture",
        location: deriveLocationFromPath(directory, process.platform),
        disabled: false,
        createdAt: "2026-10-21T00:00:00Z",
      });
      if (
        command.action === "run-directory-prepare" ||
        command.action === "run-directory-files-prepare"
      )
        return {
          formatVersion: 1,
          scope: "controlled-directory-run",
          project: project(command.directory),
          created: true,
          run: metadata,
        };
      if (command.action === "run-options" || command.action === "run-directory-options") {
        const options = {
          formatVersion: 1,
          scope: "controlled-run-options",
          projectId: command.action === "run-options" ? command.projectId : "project",
          agentKind: command.agentKind,
          models: [{ id: "model", label: "Model", efforts: ["high"] }],
          approvalPolicies: [],
          sandboxModes: [],
        };
        return command.action === "run-options"
          ? options
          : {
              formatVersion: 1,
              scope: "controlled-directory-run",
              project: project(command.directory),
              created: false,
              options,
            };
      }
      if (command.action === "run-start") return completed.promise;
      if (command.action === "run-cancel") {
        completed.resolve({ ...metadata, result: final });
        return { ...metadata, retired: true };
      }
      if (command.action === "run-read") {
        completed.resolve({
          ...metadata,
          result: events.find((event) => event.type === "run.finished") ?? final,
        });
        return {
          ...metadata,
          cursor: command.cursor,
          nextCursor: command.cursor + events.length,
          events,
          finished: true,
        };
      }
      throw new Error("Unexpected fixture request");
    },
  );
  const connect = vi.fn<() => Promise<typeof request>>(async () => request);
  return { request, connect, stdout, stdin: Readable.from([]), output: () => output };
}

it("joins the owned lifetime before retiring output listeners and preserves late stream failure", async () => {
  const f = fixture();
  const entered = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<void>();
  const before = f.stdout.listenerCount("error");
  const running = runRunCli(parseRunCli([...args, "Explain"])!, f.connect, f, {
    finalize: async () => {
      entered.resolve();
      await joined.promise;
    },
  });
  const outcome = running.catch((error: unknown) => error);
  try {
    await entered.promise;
    expect(f.stdout.listenerCount("error")).toBe(before + 1);
    f.stdout.emit("error", new Error("late output failure"));
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    joined.resolve();
    expect(await outcome).toMatchObject({ message: "late output failure" });
    expect(f.stdout.listenerCount("error")).toBe(before);
  } finally {
    joined.resolve();
    await outcome;
  }
});

it("cancels held stdin through the owner lifetime before connecting and joins finalization", async () => {
  const f = fixture();
  const stdin = new Readable({ read() {} });
  const owner = new AbortController();
  const finalize = vi.fn<() => Promise<void>>(async () => {});
  const running = runRunCli(
    parseRunCli([...args, "--prompt-stdin"])!,
    f.connect,
    { ...f, stdin },
    {
      signal: owner.signal,
      finalize,
    },
  );
  const outcome = running.catch((error: unknown) => error);
  owner.abort(new Error("owner stopped"));
  expect(await outcome).toMatchObject({ message: "owner stopped" });
  expect(f.connect).not.toHaveBeenCalled();
  expect(finalize).toHaveBeenCalledOnce();
  expect(stdin.listenerCount("error")).toBe(0);
});

it("reports owned finalization failures for options as well as runs", async () => {
  const f = fixture();
  await expect(
    runRunCli(
      parseRunCli(["run", "--options", "--project", "project", "--provider", "neutral"])!,
      f.connect,
      f,
      {
        finalize: async () => {
          throw new Error("owned join failed");
        },
      },
    ),
  ).rejects.toThrow("cleanup was not confirmed");
});

it("selects deliberate closed local v15 while preserving every earlier request envelope", () => {
  const input = parseRunCli([...args, "Explain"])!;
  const command = { ...input.command, prompt: input.prompt! };
  expect(hostAdminRequest(command)).toEqual({ adminVersion: 15, command });
  for (let version = 1; version <= 14; version++)
    expect(hostAdminRequestSchema.safeParse({ adminVersion: version, command }).success).toBe(
      false,
    );
  expect(hostAdminRequest({ action: "clients-list" }).adminVersion).toBe(1);
  expect(hostAdminRequestSchema.safeParse({ adminVersion: 20, command }).success).toBe(false);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 24, outcome: { ok: true, data: {} } }).success,
  ).toBe(false);
  expect(
    hostAdminRequestSchema.safeParse({
      adminVersion: 15,
      command: { ...command, credentialKey: "foreign" },
    }).success,
  ).toBe(false);
  expect(parseServerCliCommand([...args, "Explain"])).toBe("admin");
  expect(parseServerCliCommand(["run", "--help"])).toBe("help");
  expect(cliCommandHelp("run")).toContain("local-admin v15");
});

it("continues an exact session through a distinct closed admin version while earlier envelopes stay unchanged", async () => {
  const f = fixture();
  await runRunCli(parseRunCli(["run", "--session", "thread", "Continue"])!, f.connect, f);
  const command = f.request.mock.calls[0]![0];
  expect(command).toEqual({ action: "run-resume-prepare", threadId: "thread", prompt: "Continue" });
  expect(hostAdminRequest(command)).toEqual({ adminVersion: 19, command });
  for (let version = 1; version <= 18; version++)
    expect(hostAdminRequestSchema.safeParse({ adminVersion: version, command }).success).toBe(
      false,
    );
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 19, outcome: { ok: true, data: metadata } })
      .success,
  ).toBe(true);
  for (const change of [
    { model: "other" },
    { runtime: "other" },
    { credentialKey: "private" },
    { extra: true },
  ])
    expect(
      hostAdminRequestSchema.safeParse({ adminVersion: 19, command: { ...command, ...change } })
        .success,
    ).toBe(false);
  expect(f.output()).toBe("Hello\n");
  expect(cliCommandHelp("run")).toContain("local-admin v19");
});

it("runs from an explicit directory through closed v20 without a client-side registration transaction", async () => {
  const f = fixture();
  const input = parseRunCli([
    "run",
    "--directory",
    ".",
    "--provider",
    "neutral",
    "--model",
    "model",
    "Explain",
  ])!;
  await runRunCli(input, f.connect, f);
  const command = f.request.mock.calls[0]![0];
  expect(command).toEqual({
    action: "run-directory-prepare",
    directory: resolve("."),
    agentKind: "neutral",
    model: "model",
    prompt: "Explain",
  });
  expect(hostAdminRequest(command)).toEqual({ adminVersion: 20, command });
  expect(f.request.mock.calls.some(([c]) => c.action === "projects-add")).toBe(false);
  expect(f.output()).toBe("Hello\n");
  expect(f.connect).toHaveBeenCalledOnce();
});

it("accepts directory options only for the echoed exact project/provider", async () => {
  const f = fixture();
  await runRunCli(
    parseRunCli([
      "run",
      "--directory",
      "folder with space",
      "--options",
      "--provider",
      "neutral",
      "--format",
      "json",
    ])!,
    f.connect,
    f,
  );
  expect(f.request.mock.calls[0]![0]).toEqual({
    action: "run-directory-options",
    directory: resolve("folder with space"),
    agentKind: "neutral",
  });
  expect(JSON.parse(f.output())).toMatchObject({
    formatVersion: 1,
    scope: "controlled-run-options",
    projectId: "project",
    agentKind: "neutral",
  });
});

it.each(["foreign-location", "disabled", "future-format"])(
  "refuses invalid directory preparation without starting/cancelling another run: %s",
  async (change) => {
    const f = fixture();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (command, signal) => {
      const value = await original(command, signal);
      if (command.action !== "run-directory-prepare") return value;
      const result = value as {
        formatVersion: number;
        project: { id: string; disabled: boolean; location: unknown };
      };
      if (change === "foreign-location")
        result.project.location = deriveLocationFromPath(resolve("elsewhere"), process.platform);
      if (change === "disabled") result.project.disabled = true;
      if (change === "future-format") result.formatVersion = 2;
      return result;
    });
    await expect(
      runRunCli(
        parseRunCli([
          "run",
          "--directory",
          ".",
          "--provider",
          "neutral",
          "--model",
          "model",
          "Explain",
        ])!,
        f.connect,
        f,
      ),
    ).rejects.toThrow(Error);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.output()).toBe("");
  },
);

it.each([
  [
    "run",
    "--directory",
    ".",
    "--project",
    "project",
    "--provider",
    "neutral",
    "--model",
    "model",
    "Explain",
  ],
  ["run", "--directory", "", "--provider", "neutral", "--model", "model", "Explain"],
  [
    "run",
    "--directory",
    ".",
    "--wsl",
    "Selected",
    "--provider",
    "neutral",
    "--model",
    "model",
    "Explain",
  ],
  ["run", "--directory", ".", "--session", "saved", "Explain"],
  ["run", "--directory", ".", "--options", "--provider", "neutral", "--model", "model"],
])("rejects contradictory directory targets before connecting: %j", (...input) => {
  expect(() => parseRunCli(input)).toThrow(Error);
});

it.each([
  ["--project", "project"],
  ["--provider", "provider"],
  ["--model", "model"],
  ["--effort", "high"],
  ["--approval-policy", "allow"],
  ["--sandbox", "off"],
  ["--wsl", "Other"],
  ["--options"],
])("rejects continuation target/configuration overrides before connecting: %j", (...override) => {
  expect(() =>
    parseRunCli([
      "run",
      "--session",
      "thread",
      ...override,
      ...(override[0] === "--options" ? [] : ["Continue"]),
    ]),
  ).toThrow("saved session's exact");
});

it("reads continuation from bounded stdin and does not adopt or cancel a malformed owner's different saved session", async () => {
  const f = fixture();
  f.stdin = Readable.from([Buffer.from("Continue 世界")]);
  await runRunCli(
    parseRunCli(["run", "--session", "thread", "--prompt-stdin", "--format", "json"])!,
    f.connect,
    f,
  );
  expect(f.request.mock.calls[0]![0]).toEqual({
    action: "run-resume-prepare",
    threadId: "thread",
    prompt: "Continue 世界",
  });
  const mismatched = fixture();
  mismatched.request.mockResolvedValueOnce({ ...metadata, threadId: "foreign" });
  await expect(
    runRunCli(
      parseRunCli(["run", "--session", "thread", "Continue"])!,
      mismatched.connect,
      mismatched,
    ),
  ).rejects.toThrow("different saved session");
  expect(mismatched.request).toHaveBeenCalledOnce();
  expect(mismatched.output()).toBe("");
});

it("refuses an unsupported continuation owner before any run start", async () => {
  const f = fixture();
  f.request.mockRejectedValueOnce(new Error("Unsupported local-admin version 19"));
  await expect(
    runRunCli(parseRunCli(["run", "--session", "thread", "Continue"])!, f.connect, f),
  ).rejects.toThrow("Unsupported local-admin version 19");
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.output()).toBe("");
});

it("preserves authoritative replacement semantics in text and versioned JSON output", async () => {
  const events: HostRunEvent[] = [
    { type: "text.delta", itemId: "reply", text: "old", replace: false },
    { type: "text.delta", itemId: "reply", text: "New 世界", replace: true },
    final,
  ];
  const text = fixture(events);
  await runRunCli(parseRunCli([...args, "Explain"])!, text.connect, text);
  expect(text.output()).toBe("New 世界\n");
  const json = fixture(events);
  await runRunCli(parseRunCli([...args, "--format", "json", "Explain"])!, json.connect, json);
  expect(
    json
      .output()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual(events.map((event) => ({ ...metadata, ...event })));
  expect(json.request.mock.calls.at(-1)?.[0]).toEqual({
    action: "run-cancel",
    runId: metadata.runId,
  });
});

it("reads a bounded UTF-8 stdin prompt before contacting the owner", async () => {
  const f = fixture();
  f.stdin = Readable.from([Buffer.from("Explain 世界")]);
  await runRunCli(parseRunCli([...args, "--prompt-stdin"])!, f.connect, f);
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({ prompt: "Explain 世界" });
});

it("prints the selected runtime's options without preparing or starting a task", async () => {
  const f = fixture();
  await runRunCli(
    parseRunCli([
      "run",
      "--options",
      "--project",
      "project",
      "--provider",
      "neutral",
      "--format",
      "json",
    ])!,
    f.connect,
    f,
  );
  expect(JSON.parse(f.output())).toMatchObject({
    scope: "controlled-run-options",
    models: [{ id: "model", efforts: ["high"] }],
  });
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.request.mock.calls[0]?.[0]).toEqual({
    action: "run-options",
    projectId: "project",
    agentKind: "neutral",
  });
  expect(() => parseRunCli([...args, "--options"])).toThrow("accepts the project");
});

it.each(["", " ", "/clear"])(
  "refuses a turnless prompt before any owner effects (%j)",
  async (prompt) => {
    const f = fixture();
    await expect(runRunCli(parseRunCli([...args, prompt])!, f.connect, f)).rejects.toThrow(
      "plain prompt",
    );
    expect(f.connect).not.toHaveBeenCalled();
  },
);

it("refuses malformed or excess stdin and releases its listeners", async () => {
  const f = fixture();
  f.stdin = Readable.from([Buffer.from([0xff])]);
  await expect(runRunCli(parseRunCli([...args, "--prompt-stdin"])!, f.connect, f)).rejects.toThrow(
    "encoded data",
  );
  expect(f.connect).not.toHaveBeenCalled();
  expect(f.stdin.listenerCount("data")).toBe(0);
  expect(f.stdin.listenerCount("error")).toBe(0);
  const excess = fixture();
  excess.stdin = Readable.from([Buffer.alloc(65_537)]);
  await expect(
    runRunCli(parseRunCli([...args, "--prompt-stdin"])!, excess.connect, excess),
  ).rejects.toThrow("64 KiB");
  expect(excess.connect).not.toHaveBeenCalled();
});

it("stops on output error, joins exact cancellation and waits for the pending write callback", async () => {
  const f = fixture(),
    writing = Promise.withResolvers<void>();
  let callback!: (error?: Error | null) => void;
  f.stdout = new Writable({
    write(_bytes, _encoding, done) {
      callback = done;
      writing.resolve();
    },
  });
  let settled = false;
  const run = runRunCli(parseRunCli([...args, "--format", "json", "Explain"])!, f.connect, f).catch(
    (error) => {
      settled = true;
      return error;
    },
  );
  await writing.promise;
  f.stdout.emit("error", new Error("EPIPE fixture"));
  await vi.waitFor(() =>
    expect(f.request.mock.calls.some(([command]) => command.action === "run-cancel")).toBe(true),
  );
  expect(settled).toBe(false);
  callback(new Error("EPIPE fixture"));
  expect(await run).toMatchObject({ message: "EPIPE fixture" });
  expect(f.stdout.listenerCount("error")).toBe(0);
});

it("rejects another run's output before printing and still retires its captured run", async () => {
  const f = fixture(),
    original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (command, signal) => {
    const value = await original(command, signal);
    return command.action === "run-read" ? { ...(value as object), threadId: "foreign" } : value;
  });
  await expect(
    runRunCli(parseRunCli([...args, "--format", "json", "Explain"])!, f.connect, f),
  ).rejects.toThrow("different CLI run");
  expect(f.output()).toBe("");
  expect(f.request.mock.calls.at(-1)?.[0]).toEqual({ action: "run-cancel", runId: metadata.runId });
});

it("does not report success without both durable history and runtime retirement", async () => {
  const f = fixture([{ ...final, historyCommitted: false }]);
  await expect(runRunCli(parseRunCli([...args, "Explain"])!, f.connect, f)).rejects.toThrow(
    "sessions inspect thread",
  );
  expect(hostRunEventSchema.safeParse({ ...final, accountToken: "private" }).success).toBe(false);
});
