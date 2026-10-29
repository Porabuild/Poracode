import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import { join } from "node:path";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import type { HeadlessRemoteHost, HeadlessRemoteHostOptions } from "./createHeadlessRemoteHost";
import { parseRunCli } from "./cliRun";
import { runStandaloneCli } from "./cliStandaloneRun";

const h = vi.hoisted(() => ({
  create:
    vi.fn<
      (
        options: HeadlessRemoteHostOptions,
      ) => Promise<Pick<HeadlessRemoteHost, "startLocalAdministration" | "dispose">>
    >(),
  connect: vi.fn<() => Promise<(command: HostAdminCommand) => Promise<unknown>>>(),
  resources: vi.fn<() => { wslHelpersDir: string }>(),
  layout: vi.fn<() => { libDir: string }>(),
}));
vi.mock("./createHeadlessRemoteHost", () => ({ createHeadlessRemoteHost: h.create }));
vi.mock("./cliAdmin", () => ({ connectHostAdministration: h.connect }));
vi.mock("./serverInstallLayout", () => ({
  resolveServerInstallLayout: h.layout,
  resolveServerResourceDirs: h.resources,
  WSL_HELPERS_DIR_ENV: "PORACODE_WSL_HELPERS_DIR",
}));

const build = {
  version: "1.0.0-test",
  sourceRevision: null,
  entrypointSha256: "a".repeat(64),
  root: "/fixture",
  layoutKind: "prefix" as const,
};
const metadata = {
  formatVersion: 1,
  scope: "controlled-run",
  runId: "187b821c-8453-4b8f-afd3-f5538851dabb",
  threadId: "saved",
};
const final = {
  type: "run.finished",
  state: "completed",
  historyCommitted: true,
  retirementConfirmed: true,
};
const args = [
  "run",
  "--standalone",
  "--project",
  "project",
  "--provider",
  "neutral",
  "--model",
  "model",
  "--approval-policy",
  "never",
  "--sandbox",
  "workspace-write",
  "Explain",
];
const priorExitCode = process.exitCode;
let output: string;
let exit: MockInstance<typeof process.exit>;

beforeEach(() => {
  vi.stubEnv("PORACODE_HEADLESS_SERVER", "0");
  h.create.mockReset();
  h.connect.mockReset();
  h.resources.mockReset();
  h.layout.mockReset();
  h.layout.mockReturnValue({ libDir: "/fixture/lib" });
  h.resources.mockReturnValue({ wslHelpersDir: "/fixture/resources/wsl" });
  output = "";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(((bytes: string, callback?: () => void) => {
    output += String(bytes);
    callback?.();
    return true;
  }) as typeof process.stdout.write);
  exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const completed = Promise.withResolvers<unknown>();
  h.connect.mockResolvedValue(async (command: HostAdminCommand) => {
    if (
      command.action === "run-prepare" ||
      command.action === "run-resume-prepare" ||
      command.action === "run-tool-events-prepare"
    )
      return metadata;
    if (command.action === "run-options" || command.action === "run-directory-options")
      return {
        formatVersion: 1,
        scope: "controlled-run-options",
        projectId: command.action === "run-options" ? command.projectId : "project",
        agentKind: command.agentKind,
        models: [{ id: "model", label: "Model", efforts: ["high"] }],
        approvalPolicies: [{ id: "never", label: "Never" }],
        sandboxModes: [{ id: "workspace-write", label: "Workspace write" }],
      };
    if (command.action === "run-start") return completed.promise;
    if (command.action === "run-read") {
      completed.resolve({ ...metadata, result: final });
      return {
        ...metadata,
        cursor: 0,
        nextCursor: 2,
        events: [{ type: "text.delta", itemId: "reply", text: "Hello", replace: false }, final],
        finished: true,
      };
    }
    if (command.action === "run-cancel") {
      completed.resolve({ ...metadata, result: final });
      return { ...metadata, retired: true };
    }
    throw new Error("Unexpected fixture command");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = priorExitCode;
});

function host() {
  const owned = {
    startLocalAdministration: vi.fn<() => Promise<void>>(async () => {}),
    dispose: vi.fn<() => Promise<void>>(async () => {}),
  };
  h.create.mockResolvedValue(owned);
  return owned;
}

it("owns one local task, keeps stdout parseable and joins host retirement before success", async () => {
  const owned = host();
  const held = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  owned.dispose.mockImplementation(async () => {
    entered.resolve();
    await held.promise;
  });
  const running = runStandaloneCli(
    "/fixture/profile",
    parseRunCli([...args, "--format", "json"])!,
    "/fixture/lib",
    build,
  );
  try {
    await entered.promise;
    expect(exit).not.toHaveBeenCalled();
    expect(owned.dispose).toHaveBeenCalledOnce();
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseDir: "/fixture/profile",
        localAdministrationOnly: true,
        supervisorPath: join("/fixture/lib", "supervisor.cjs"),
        buildIdentity: build,
      }),
    );
    expect(h.create.mock.calls[0]![0]).not.toHaveProperty("relayUrl");
    console.log("owned diagnostic");
    expect(console.error).toHaveBeenCalledWith("owned diagnostic");
    held.resolve();
    await running;
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(
      output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toHaveLength(2);
  } finally {
    held.resolve();
    await running;
  }
});

it("validates the prompt before creating, loading resources or connecting an owner", async () => {
  await runStandaloneCli(
    "/fixture/profile",
    parseRunCli([...args.slice(0, -1), " "])!,
    "/fixture/lib",
    build,
  );
  expect(h.create).not.toHaveBeenCalled();
  expect(h.layout).not.toHaveBeenCalled();
  expect(h.connect).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("refuses existing ownership without attaching, stopping or changing that owner", async () => {
  h.create.mockRejectedValue(new Error("Profile already owned"));
  await runStandaloneCli("/fixture/profile", parseRunCli(args)!, "/fixture/lib", build);
  expect(h.connect).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("cancels and joins held local startup before releasing the task lifetime", async () => {
  const owned = host();
  const entered = Promise.withResolvers<void>();
  const held = Promise.withResolvers<void>();
  const closing = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<void>();
  owned.startLocalAdministration.mockImplementation(async () => {
    entered.resolve();
    await held.promise;
  });
  owned.dispose.mockImplementation(async () => {
    closing.resolve();
    await held.promise;
    await retired.promise;
  });
  const running = runStandaloneCli("/fixture/profile", parseRunCli(args)!, "/fixture/lib", build);
  try {
    await entered.promise;
    process.emit("SIGINT");
    await closing.promise;
    expect(exit).not.toHaveBeenCalled();
    expect(h.create.mock.calls[0]![0].signal!.aborted).toBe(true);
    held.resolve();
    await Promise.resolve();
    expect(exit).not.toHaveBeenCalled();
    retired.resolve();
    await running;
    expect(h.connect).not.toHaveBeenCalled();
    expect(owned.dispose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  } finally {
    held.resolve();
    retired.resolve();
    await running;
  }
});
