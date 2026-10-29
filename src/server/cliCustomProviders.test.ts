import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  hostAdminRequest,
  hostAdminRequestSchema,
  hostAdminResultSchema,
} from "@/shared/hostAdminProtocol";
import { cliCommandHelp } from "./cliHelp";
import { parseCustomProviderCli, runCustomProviderCli } from "./cliCustomProviders";
const prompt = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<string>>());
vi.mock("./cliPrompts", async (importActual) => ({
  ...(await importActual<typeof import("./cliPrompts")>()),
  promptCli: prompt,
}));

afterEach(() => {
  vi.restoreAllMocks();
  prompt.mockReset();
});
const metadata = {
  id: "custom",
  kind: "acp-generic:custom",
  displayName: "Custom",
  enabled: true,
  revision: "ab".repeat(32),
  command: { binary: "owned-agent", argumentCount: 1, cwd: "project" },
  environmentNames: [],
  authMode: "none",
  models: [],
};
function setup() {
  mkdirSync(resolve("tmp/cli-custom-acp-20261021"), { recursive: true });
  const root = mkdtempSync(resolve("tmp/cli-custom-acp-20261021/cli-"));
  const definition = join(root, "definition.json");
  writeFileSync(definition, JSON.stringify({ binary: "owned-agent", args: ["hidden-argument"] }));
  const request = vi.fn<(input: Parameters<typeof hostAdminRequest>[0]) => Promise<unknown>>(
    async (input) => {
      if (input.action !== "custom-providers") throw Error("Wrong command domain");
      const command = input.command;
      return {
        version: 1,
        scope: "custom-native-acp",
        action: command.action,
        ...(command.action === "check-add"
          ? { id: command.id, checked: true }
          : command.action === "list"
            ? { agents: [metadata] }
            : command.action === "remove"
              ? { id: command.id, removed: true }
              : { agent: metadata }),
      };
    },
  );
  const connect = vi.fn<() => Promise<typeof request>>(async () => request);
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  return { definition, request, connect, output };
}

it("uses only closed admin16 while older envelopes and future custom versions refuse", () => {
  const command = { action: "custom-providers", command: { version: 1, action: "list" } } as const;
  expect(hostAdminRequest(command)).toEqual({ adminVersion: 16, command });
  for (let adminVersion = 1; adminVersion <= 15; adminVersion++)
    expect(hostAdminRequestSchema.safeParse({ adminVersion, command }).success).toBe(false);
  expect(hostAdminRequestSchema.safeParse({ adminVersion: 17, command }).success).toBe(false);
  expect(
    hostAdminRequestSchema.safeParse({
      adminVersion: 16,
      command: { ...command, command: { version: 2, action: "list" } },
    }).success,
  ).toBe(false);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 24, outcome: { ok: true, data: {} } }).success,
  ).toBe(true);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 25, outcome: { ok: true, data: {} } }).success,
  ).toBe(false);
  expect(hostAdminRequest({ action: "clients-list" }).adminVersion).toBe(1);
});

it("checks the exact definition before saving and keeps secret values out of stdout", async () => {
  const f = setup();
  await runCustomProviderCli(
    parseCustomProviderCli([
      "providers",
      "custom",
      "add",
      "custom",
      "--config-file",
      f.definition,
      "--json",
    ])!,
    f.connect,
  );
  expect(f.connect).toHaveBeenCalledOnce();
  expect(
    f.request.mock.calls.map(([input]) =>
      input.action === "custom-providers" ? input.command.action : "wrong",
    ),
  ).toEqual(["check-add", "add"]);
  expect(f.request.mock.calls[1]![0]).toMatchObject({
    command: { definition: { binary: "owned-agent", args: ["hidden-argument"] } },
  });
  expect(f.output.mock.calls.map(([value]) => String(value)).join("")).not.toContain(
    "hidden-argument",
  );
});

it("pins the inspected revision for configure and removal without reconnecting to another owner", async () => {
  const f = setup();
  await runCustomProviderCli(
    parseCustomProviderCli(["providers", "custom", "configure", "custom", "--disable", "--json"])!,
    f.connect,
  );
  expect(f.request.mock.calls[1]![0]).toMatchObject({
    command: { action: "configure", expectedRevision: metadata.revision, enabled: false },
  });
  f.request.mockClear();
  f.connect.mockClear();
  await runCustomProviderCli(
    parseCustomProviderCli(["providers", "custom", "remove", "custom", "--yes", "--json"])!,
    f.connect,
  );
  expect(f.connect).toHaveBeenCalledOnce();
  expect(f.request.mock.calls[1]![0]).toMatchObject({
    command: { action: "remove", expectedRevision: metadata.revision },
  });
});

it("refuses no-op edits, secret values in argv, WSL substitution and unconfirmed removal before connecting", async () => {
  const f = setup();
  for (const args of [
    ["configure", "custom"],
    ["add", "custom", "--token", "secret"],
    ["inspect", "custom", "--wsl", "Other"],
    ["add", "custom"],
  ])
    expect(() => parseCustomProviderCli(["providers", "custom", ...args])).toThrow(
      /explicitly|Unknown option|requires/u,
    );
  await expect(
    runCustomProviderCli(
      parseCustomProviderCli(["providers", "custom", "remove", "custom", "--json"])!,
      f.connect,
    ),
  ).rejects.toThrow("--yes");
  expect(f.connect).not.toHaveBeenCalled();
  expect(cliCommandHelp("providers", "custom")).toContain("local-admin v16");
});

it("prints no foreign-target response and does not save after an incompatible owner refusal", async () => {
  const f = setup();
  f.request.mockResolvedValueOnce({
    version: 1,
    scope: "custom-native-acp",
    action: "inspect",
    agent: { ...metadata, id: "foreign" },
  } as never);
  await expect(
    runCustomProviderCli(
      parseCustomProviderCli(["providers", "custom", "inspect", "custom", "--json"])!,
      f.connect,
    ),
  ).rejects.toThrow("different custom provider target");
  expect(f.output).not.toHaveBeenCalled();
  f.request.mockRejectedValueOnce(new Error("Unsupported local admin version"));
  await expect(
    runCustomProviderCli(
      parseCustomProviderCli([
        "providers",
        "custom",
        "add",
        "custom",
        "--config-file",
        f.definition,
        "--json",
      ])!,
      f.connect,
    ),
  ).rejects.toThrow("Unsupported local admin");
  expect(f.request.mock.calls.at(-1)![0]).toMatchObject({ command: { action: "check-add" } });
});

it("collects hidden values only after the owner's definition check and prints no entered value", async () => {
  const f = setup();
  const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stderrTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  try {
    f.request.mockImplementationOnce(async () => {
      expect(prompt).not.toHaveBeenCalled();
      return {
        version: 1,
        scope: "custom-native-acp",
        action: "check-add",
        id: "custom",
        checked: true,
      };
    });
    prompt.mockResolvedValueOnce("owned-private-input");
    const input = parseCustomProviderCli([
      "providers",
      "custom",
      "add",
      "custom",
      "--config-file",
      f.definition,
      "--prompt-env",
      "TOKEN",
    ])!;
    await runCustomProviderCli(input, f.connect);
    expect(prompt).toHaveBeenCalledWith("TOKEN (hidden; empty removes): ", { secret: true });
    expect(f.request.mock.calls[1]![0]).toMatchObject({
      command: { action: "add", environment: { TOKEN: "owned-private-input" } },
    });
    expect(f.output.mock.calls.map(([value]) => String(value)).join("")).not.toContain(
      "owned-private-input",
    );
    prompt.mockClear();
    f.request.mockClear();
    f.request.mockRejectedValueOnce(new Error("Persistence unavailable"));
    await expect(runCustomProviderCli(input, f.connect)).rejects.toThrow("Persistence unavailable");
    expect(prompt).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
  } finally {
    if (stdinTty) Object.defineProperty(process.stdin, "isTTY", stdinTty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    if (stderrTty) Object.defineProperty(process.stderr, "isTTY", stderrTty);
    else Reflect.deleteProperty(process.stderr, "isTTY");
  }
});
