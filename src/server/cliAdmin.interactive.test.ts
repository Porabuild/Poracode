import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runAdminCli, parseAdminCli } from "./cliAdmin";
import { readEnvironmentStdin, readMcpDefinitionInput } from "./cliAdminInput";
import { mcpServerSchema } from "@/shared/contracts/mcpServer";
import { hostAdminRequestSchema } from "@/shared/hostAdminProtocol";

const mocks = vi.hoisted(() => ({
  request:
    vi.fn<
      (
        ...args: Parameters<typeof import("@/backend/ownership/hostControlClient").callHostControl>
      ) => Promise<unknown>
    >(),
  prompt: vi.fn<typeof import("./cliPrompts").promptCli>(),
}));
vi.mock("@/backend/ownership/hostControlClient", async (original) => ({
  ...(await original<typeof import("@/backend/ownership/hostControlClient")>()),
  callHostControl: mocks.request,
}));
vi.mock("./cliPrompts", async (original) => ({
  ...(await original<typeof import("./cliPrompts")>()),
  promptCli: mocks.prompt,
}));
const originalTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const fixtureRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  mocks.request.mockReset();
  mocks.prompt.mockReset();
  if (originalTty) Object.defineProperty(process.stdin, "isTTY", originalTty);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  for (const path of fixtureRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});
function terminal() {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
}

describe("interactive persisted session retirement", () => {
  it("requires the exact thread ID before contacting an owner", async () => {
    terminal();
    mocks.prompt.mockResolvedValueOnce("different-thread");
    await expect(
      runAdminCli(resolve("tmp/unused-session-profile"), ["sessions", "stop", "exact-thread"]),
    ).rejects.toThrow("cancelled");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("confirms an exact ID and retains the selected owner generation", async () => {
    terminal();
    mocks.prompt.mockResolvedValueOnce("exact-thread");
    host(() => ({
      formatVersion: 1,
      scope: "persisted-profile",
      threadId: "exact-thread",
      retired: true,
    }));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/unused-session-profile"), ["sessions", "stop", "exact-thread"]);
    expect(commands()).toEqual([{ action: "sessions-stop", threadId: "exact-thread" }]);
    expectPinned();
  });
});
const profileRevision = "ab".repeat(32);
function host(
  data: (command: Record<string, unknown>) => unknown,
  prepare?: (command: Record<string, unknown>) => unknown,
  checkAdd?: (command: Record<string, unknown>) => unknown,
) {
  let profiles: Array<{ id: string; driver?: string; displayName?: string }> = [];
  mocks.request.mockImplementation(async (_paths, operation, options) => {
    if (operation === "describe") return { ownerGeneration: "selected-owner" };
    const command = hostAdminRequestSchema.parse(options?.payload).command;
    let result: unknown;
    if (command.action === "providers-check-add") {
      result = checkAdd
        ? checkAdd(command)
        : { checked: true, profileId: command.profile.id, driver: command.profile.driver };
    } else if (command.action === "providers-prepare-configuration") {
      const selected = profiles.find((profile) => profile.id === command.instanceId);
      result = prepare
        ? prepare(command)
        : {
            profileId: command.instanceId,
            driver: selected?.driver ?? "fixture",
            ...(selected?.displayName !== undefined ? { displayName: selected.displayName } : {}),
            profileRevision,
          };
    } else {
      result = data(command);
      if (command.action === "providers-list")
        profiles = (result as { profiles?: typeof profiles }).profiles ?? [];
    }
    return {
      result: {
        adminVersion: hostAdminRequestSchema.parse(options?.payload).adminVersion,
        outcome: { ok: true, data: result },
      },
    };
  });
}
function commands() {
  return mocks.request.mock.calls
    .filter(([, operation]) => operation === "admin")
    .map(([, , options]) => hostAdminRequestSchema.parse(options?.payload).command);
}
function expectPinned() {
  expect(mocks.request.mock.calls.filter(([, operation]) => operation === "describe")).toHaveLength(
    1,
  );
  expect(
    mocks.request.mock.calls
      .filter(([, operation]) => operation === "admin")
      .every(([, , options]) => options?.expectedGeneration === "selected-owner"),
  ).toBe(true);
}
function jsonInputFile(value: unknown) {
  const scratch = resolve("tmp");
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, "cli-admin-input-"));
  fixtureRoots.push(directory);
  const file = join(directory, "input.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

describe("guided saved MCP creation", () => {
  const checked = {
    formatVersion: 1,
    scope: "saved-user",
    checked: true,
    serverId: "guided-id",
    name: "guided-id",
  };
  const checkCommand = { action: "mcp-check-add", serverId: "guided-id", name: "guided-id" };
  const result = { formatVersion: 2, scope: "saved-user", change: "add", serverId: "guided-id" };
  function answers(values: string[]) {
    mocks.prompt.mockImplementation(async () => {
      const value = values.shift();
      if (value === undefined) throw new Error("Unexpected fixture prompt");
      return value;
    });
  }

  it.each(["stdio", "http", "sse"] as const)(
    "collects canonical %s fields with hidden input and one pinned owner",
    async (type) => {
      terminal();
      const transport =
        type === "stdio"
          ? {
              type,
              command: "private-tool",
              args: ["private-arg"],
              env: { PRIVATE_KEY: "private-env" },
              cwd: "private-directory",
            }
          : {
              type,
              url: "https://fixture.test/private-endpoint?key=private-query",
              headers: { Authorization: "private-header" },
            };
      answers(
        type === "stdio"
          ? [
              "",
              type,
              "private-tool",
              '["private-arg"]',
              '{"PRIVATE_KEY":"private-env"}',
              "private-directory",
              "guided-id",
            ]
          : ["", type, transport.url!, '{"Authorization":"private-header"}', "guided-id"],
      );
      host((command) => (command.action === "mcp-check-add" ? checked : result));
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      await runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]);
      expect(commands()).toEqual([
        checkCommand,
        {
          action: "mcp-add",
          server: mcpServerSchema.parse({ id: "guided-id", name: "guided-id", transport }),
        },
      ]);
      expect(
        mocks.request.mock.calls
          .filter(([, op]) => op === "admin")
          .map(([, , options]) => hostAdminRequestSchema.parse(options?.payload).adminVersion),
      ).toEqual([9, 7]);
      expect(
        mocks.prompt.mock.calls.filter(([, options]) => options?.secret === true),
      ).toHaveLength(type === "stdio" ? 4 : 2);
      const text = [...output.mock.calls, ...stderr.mock.calls]
        .map(([value]) => String(value))
        .join("");
      for (const privateValue of [
        "private-tool",
        "private-arg",
        "private-env",
        "private-directory",
        "private-endpoint",
        "private-query",
        "private-header",
      ])
        expect(text).not.toContain(privateValue);
      expectPinned();
    },
  );

  it("asks for a missing ID, uses canonical blank defaults and requires exact confirmation", async () => {
    terminal();
    answers(["guided-id", "", "", "private-tool", "", "", "", "guided-id"]);
    host((command) => (command.action === "mcp-check-add" ? checked : result));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add"]);
    expect(commands()).toEqual([
      checkCommand,
      {
        action: "mcp-add",
        server: mcpServerSchema.parse({
          id: "guided-id",
          name: "guided-id",
          transport: { type: "stdio", command: "private-tool", args: [], env: {} },
        }),
      },
    ]);
    expectPinned();
  });

  it.each([true, false])(
    "refuses scripted/JSON guided input before contacting an owner (terminal: %s)",
    async (isTTY) => {
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: isTTY });
      await expect(
        runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", ...(isTTY ? ["--json"] : [])]),
      ).rejects.toThrow("requires a terminal without --json");
      expect(mocks.request).not.toHaveBeenCalled();
      expect(mocks.prompt).not.toHaveBeenCalled();
    },
  );

  it.each([
    "duplicate ID",
    "duplicate name",
    "storage unavailable",
    "Host control request invalid (400)",
  ])("stops before hidden input when the owner refuses creation (%s)", async (reason) => {
    terminal();
    answers([""]);
    host(() => {
      throw new Error(reason);
    });
    const error = await runAdminCli(resolve("tmp/guided-profile"), [
      "mcp",
      "add",
      "guided-id",
    ]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(reason);
    expect((error as Error).message).toContain("local-admin v9");
    expect(commands()).toEqual([checkCommand]);
    expect(mocks.prompt.mock.calls.some(([, options]) => options?.secret)).toBe(false);
    expectPinned();
  });

  it.each([
    { serverId: "another-id" },
    { name: "another-name" },
    { checked: false },
    { formatVersion: 2 },
    { privateCredential: "synthetic-private" },
  ])(
    "refuses a mismatched/private/future creation check before hidden input (%j)",
    async (changed) => {
      terminal();
      answers([""]);
      host(() => ({ ...checked, ...changed }));
      await expect(
        runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
      ).rejects.toThrow(Error);
      expect(commands()).toEqual([checkCommand]);
      expect(mocks.prompt.mock.calls.some(([, options]) => options?.secret)).toBe(false);
      expectPinned();
    },
  );

  it("does not submit a definition after hidden entry is cancelled", async () => {
    terminal();
    host(() => checked);
    mocks.prompt
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("http")
      .mockRejectedValueOnce(new Error("fixture input cancelled"));
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
    ).rejects.toThrow("input cancelled");
    expect(commands()).toEqual([checkCommand]);
  });

  it.each(["poracode", "bad name"])(
    "refuses a reserved/invalid name before collecting private values (%s)",
    async (name) => {
      terminal();
      answers([name]);
      host(() => checked);
      await expect(
        runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
      ).rejects.toThrow("non-reserved MCP name");
      expect(commands()).toEqual([]);
      expect(mocks.prompt.mock.calls.some(([, options]) => options?.secret)).toBe(false);
    },
  );

  it("refuses an unknown transport before collecting private values", async () => {
    terminal();
    answers(["", "unsupported"]);
    host(() => checked);
    await expect(
      runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
    ).rejects.toThrow("Choose stdio, http or sse");
    expect(commands()).toEqual([checkCommand]);
    expect(mocks.prompt.mock.calls.some(([, options]) => options?.secret)).toBe(false);
  });

  it.each([
    "private-not-json",
    '{"Authorization":"«redacted»"}',
    JSON.stringify({ Authorization: "x".repeat(65_537) }),
  ])("rejects invalid/private input without exposing it or sending a write", async (headers) => {
    terminal();
    answers(["", "http", "https://fixture.test/private-endpoint", headers]);
    host(() => checked);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    let error: unknown;
    try {
      await runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(headers);
    expect(stderr.mock.calls.map(([value]) => String(value)).join("")).not.toContain(headers);
    expect(commands()).toEqual([checkCommand]);
  });

  it("requires exact save confirmation without submitting a definition", async () => {
    terminal();
    answers(["", "http", "https://fixture.test/mcp", "", "different-id"]);
    host(() => checked);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
    ).rejects.toThrow("creation cancelled");
    expect(commands()).toEqual([checkCommand]);
  });

  it("retains the original owner generation through entry and refuses a changed owner without retry", async () => {
    terminal();
    answers(["", "http", "https://fixture.test/mcp", "", "guided-id"]);
    host((command) => {
      if (command.action === "mcp-check-add") return checked;
      throw new Error("fixture owner generation changed");
    });
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/guided-profile"), ["mcp", "add", "guided-id"]),
    ).rejects.toThrow("generation changed");
    expect(output).not.toHaveBeenCalled();
    expect(commands().map((command) => command.action)).toEqual(["mcp-check-add", "mcp-add"]);
    expectPinned();
  });
});

describe("complete saved MCP definitions", () => {
  const definition = {
    id: "exact-id",
    name: "fixture-server",
    transport: {
      type: "http",
      url: "https://fixture.test/deployment/mcp",
      headers: { Authorization: "synthetic-secret" },
    },
  };
  const preparation = {
    id: definition.id,
    name: definition.name,
    enabled: true,
    transport: "http",
    timeoutMs: 30_000,
    disabledToolCount: 0,
    serverRevision: profileRevision,
  };

  it.each(["file", "stdin"] as const)(
    "adds a bounded %s definition through v7 without printing transport values",
    async (source) => {
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
      const args =
        source === "file" ? ["--config-file", jsonInputFile(definition)] : ["--config-stdin"];
      if (source === "stdin") {
        const iterator = Readable.from([Buffer.from(JSON.stringify(definition))])[
          Symbol.asyncIterator
        ]();
        vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() => iterator);
      }
      const result = {
        formatVersion: 2,
        scope: "saved-user",
        change: "add",
        serverId: definition.id,
      };
      host(() => result);
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await runAdminCli(resolve("tmp/explicit-profile"), [
        "mcp",
        "add",
        definition.id,
        ...args,
        "--json",
      ]);
      expect(commands()).toEqual([
        { action: "mcp-add", server: mcpServerSchema.parse(definition) },
      ]);
      expect(
        mocks.request.mock.calls
          .filter(([, operation]) => operation === "admin")
          .map(([, , options]) => hostAdminRequestSchema.parse(options?.payload).adminVersion),
      ).toEqual([7]);
      expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(result)}\n`);
      expect(mocks.prompt).not.toHaveBeenCalled();
      expectPinned();
    },
  );

  it("captures a full replacement before confirmation and pins preparation and commit to one generation", async () => {
    terminal();
    const file = jsonInputFile(definition);
    host((command) =>
      command.action === "mcp-prepare-configuration"
        ? preparation
        : { formatVersion: 2, scope: "saved-user", change: "configure", serverId: definition.id },
    );
    mocks.prompt.mockImplementationOnce(async () => {
      writeFileSync(
        file,
        JSON.stringify({
          ...definition,
          transport: { type: "stdio", command: "unselected-command" },
        }),
      );
      return definition.id;
    });
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "mcp",
      "configure",
      definition.id,
      "--config-file",
      file,
    ]);
    expect(commands()).toEqual([
      { action: "mcp-prepare-configuration", serverId: definition.id },
      {
        action: "mcp-configure-checked",
        server: mcpServerSchema.parse(definition),
        expectedServerRevision: profileRevision,
      },
    ]);
    expect(mocks.prompt.mock.calls[0]![0]).toContain("Omitted optional values take their defaults");
    expect(output.mock.calls.flat().join("")).not.toContain("synthetic-secret");
    expectPinned();
  });

  it("requires explicit script replacement confirmation before reading input or contacting an owner", async () => {
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "mcp",
        "configure",
        definition.id,
        "--config-file",
        "does-not-exist.json",
        "--json",
      ]),
    ).rejects.toThrow("--yes");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("uses guarded replacement with --yes and JSON without prompting", async () => {
    host((command) =>
      command.action === "mcp-prepare-configuration"
        ? preparation
        : { formatVersion: 2, scope: "saved-user", change: "configure", serverId: definition.id },
    );
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "mcp",
      "configure",
      definition.id,
      "--config-file",
      jsonInputFile(definition),
      "--yes",
      "--json",
    ]);
    expect(commands().map((command) => command.action)).toEqual([
      "mcp-prepare-configuration",
      "mcp-configure-checked",
    ]);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expectPinned();
  });

  it.each(["cancelled", "wrong-target", "unsupported-owner"])(
    "submits no definition after %s preparation/confirmation",
    async (reason) => {
      terminal();
      host(() => {
        if (reason === "unsupported-owner") throw new Error("fixture unsupported owner");
        return { ...preparation, ...(reason === "wrong-target" ? { id: "other-id" } : {}) };
      });
      mocks.prompt.mockResolvedValue("other-id");
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), [
          "mcp",
          "configure",
          definition.id,
          "--config-file",
          jsonInputFile(definition),
        ]),
      ).rejects.toThrow(Error);
      expect(commands()).toEqual([
        { action: "mcp-prepare-configuration", serverId: definition.id },
      ]);
      expect(mocks.prompt).toHaveBeenCalledTimes(reason === "cancelled" ? 1 : 0);
      expectPinned();
    },
  );

  it.each([
    { formatVersion: 3 },
    { serverId: "other-id" },
    { change: "configure" },
    { headers: { Authorization: "synthetic-never-print" } },
  ])(
    "refuses unknown/private or mismatched definition acknowledgements without retry (%j)",
    async (extra) => {
      host(() => ({
        formatVersion: 2,
        scope: "saved-user",
        change: "add",
        serverId: definition.id,
        ...extra,
      }));
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const failure = await runAdminCli(resolve("tmp/explicit-profile"), [
        "mcp",
        "add",
        definition.id,
        "--config-file",
        jsonInputFile(definition),
        "--json",
      ]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain("synthetic-");
      expect(output).not.toHaveBeenCalled();
      expect(commands()).toHaveLength(1);
    },
  );
});

describe("interactive provider administration", () => {
  it("retains the selected profile configuration when its file changes during profile selection", async () => {
    terminal();
    const original = { homeDir: "~/.fixture-selected-profile" };
    const file = jsonInputFile(original);
    host((command) =>
      command.action === "providers-list"
        ? { profiles: [{ id: "work", driver: "codex", displayName: "Work" }] }
        : { saved: true, profileId: "work" },
    );
    mocks.prompt
      .mockImplementationOnce(async () => {
        writeFileSync(file, JSON.stringify({ homeDir: "~/.fixture-other-profile" }));
        return "1";
      })
      .mockResolvedValueOnce("synthetic-secret");
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "--config-file",
      file,
      "--prompt-env",
      "KEY",
    ]);
    expect(commands().at(-1)).toEqual({
      action: "providers-configure-checked",
      instanceId: "work",
      expectedProfileRevision: profileRevision,
      config: original,
      environment: { KEY: "synthetic-secret" },
    });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ homeDir: "~/.fixture-other-profile" });
    expect(output.mock.calls.flat().join("")).not.toContain("synthetic-secret");
    expectPinned();
  });
  it("requires the exact untrimmed MCP ID before removal and pins its owner", async () => {
    terminal();
    const serverId = " exact id ";
    host(() => ({ formatVersion: 1, scope: "saved-user", change: "remove", serverId }));
    mocks.prompt.mockResolvedValueOnce(serverId);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), ["mcp", "remove", serverId]);
    expect(commands()).toEqual([{ action: "mcp-remove", serverId }]);
    expect(mocks.prompt.mock.calls[0]![0]).toContain("Type its exact ID");
    expectPinned();
  });

  it.each(["", "other-id", "exact id"])(
    "cancels MCP removal on a different typed ID without owner contact (%s)",
    async (answer) => {
      terminal();
      mocks.prompt.mockResolvedValueOnce(answer);
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), ["mcp", "remove", " exact id "]),
      ).rejects.toThrow("cancelled");
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );

  it("propagates closed-input MCP removal cancellation without contacting the owner", async () => {
    terminal();
    const closed = new Error("fixture input closed");
    mocks.prompt.mockRejectedValueOnce(closed);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["mcp", "remove", "exact-id"]),
    ).rejects.toBe(closed);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    ["login", "--credential"],
    ["logout", "--method"],
    ["methods", "--method"],
    ["methods", "--credential"],
  ])(
    "refuses irrelevant auth %s flag %s before provider discovery or prompts",
    async (action, flag) => {
      terminal();
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), ["auth", action, flag, "fixture-id"]),
      ).rejects.toThrow(Error);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(mocks.prompt).not.toHaveBeenCalled();
    },
  );

  it("collects hidden values only for the explicit existing profile and uses its sealed writer", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list"
        ? { profiles: [{ id: "work" }, { id: "other" }] }
        : { profileId: "work", saved: true },
    );
    mocks.prompt
      .mockResolvedValueOnce("synthetic-secret")
      .mockResolvedValueOnce("synthetic-endpoint");
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "work",
      "--prompt-env",
      "FIXTURE_KEY",
      "--prompt-env",
      "FIXTURE_URL",
    ]);
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
      {
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: profileRevision,
        environment: { FIXTURE_KEY: "synthetic-secret", FIXTURE_URL: "synthetic-endpoint" },
      },
    ]);
    expect(mocks.prompt.mock.calls).toEqual([
      ["FIXTURE_KEY (hidden): ", { secret: true }],
      ["FIXTURE_URL (hidden): ", { secret: true }],
    ]);
    expect(output.mock.calls.flat().join("")).not.toContain("synthetic-");
    expect(errors.mock.calls.flat().join("")).not.toContain("synthetic-");
    expectPinned();
  });

  it("submits a new profile's hidden environment with sensitivity metadata", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list" ? { profiles: [] } : { profileId: "work", saved: true },
    );
    mocks.prompt.mockResolvedValue("synthetic-secret");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "add",
      "work",
      "--driver",
      "cursor",
      "--prompt-env",
      "CURSOR_API_KEY",
    ]);
    expect(commands()).toEqual([
      {
        action: "providers-check-add",
        profile: { id: "work", driver: "cursor", displayName: "work" },
        environmentNames: ["CURSOR_API_KEY"],
      },
      {
        action: "providers-add",
        profile: {
          id: "work",
          driver: "cursor",
          displayName: "work",
          environment: { CURSOR_API_KEY: { value: "synthetic-secret", sensitive: true } },
        },
      },
    ]);
    expectPinned();
  });

  it("refuses creation preflight errors or unsupported owners before asking for any key", async () => {
    terminal();
    const refused = new Error("fixture config/owner refusal");
    host(
      () => {
        throw new Error("No mutation expected");
      },
      undefined,
      () => {
        throw refused;
      },
    );
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "add",
        "work",
        "--driver",
        "cursor",
        "--prompt-env",
        "CURSOR_API_KEY",
      ]),
    ).rejects.toBe(refused);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(commands().map((command) => command.action)).toEqual(["providers-check-add"]);
    expect(
      mocks.request.mock.calls
        .filter(([, operation]) => operation === "admin")
        .map(([, , options]) => hostAdminRequestSchema.parse(options?.payload).adminVersion),
    ).toEqual([5]);
    expectPinned();
  });

  it("keeps the checked config target if its input file changes during hidden key entry", async () => {
    terminal();
    const scratch = resolve("tmp");
    mkdirSync(scratch, { recursive: true });
    const path = mkdtempSync(join(scratch, "cli-profile-config-"));
    fixtureRoots.push(path);
    const file = join(path, "profile.json");
    const original = { homeDir: "~/.fixture-selected-profile" };
    const replaced = { homeDir: "~/.fixture-different-profile" };
    writeFileSync(file, JSON.stringify(original));
    host(() => ({ saved: true, profileId: "work" }));
    mocks.prompt.mockImplementationOnce(async () => {
      writeFileSync(file, JSON.stringify(replaced));
      return "synthetic-secret";
    });
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "add",
      "work",
      "--driver",
      "codex",
      "--config-file",
      file,
      "--prompt-env",
      "KEY",
    ]);
    expect(commands()).toEqual([
      {
        action: "providers-check-add",
        profile: { id: "work", driver: "codex", displayName: "work", config: original },
        environmentNames: ["KEY"],
      },
      {
        action: "providers-add",
        profile: {
          id: "work",
          driver: "codex",
          displayName: "work",
          config: original,
          environment: { KEY: { value: "synthetic-secret", sensitive: true } },
        },
      },
    ]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(replaced);
    expect(output.mock.calls.flat().join("")).not.toContain("synthetic-secret");
    expectPinned();
  });

  it("cancels new-profile key entry without adding the checked intent", async () => {
    terminal();
    const cancelled = new Error("fixture secret entry cancelled");
    host(() => {
      throw new Error("No mutation expected");
    });
    mocks.prompt.mockRejectedValueOnce(cancelled);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "add",
        "work",
        "--driver",
        "cursor",
        "--prompt-env",
        "CURSOR_API_KEY",
      ]),
    ).rejects.toBe(cancelled);
    expect(commands().map((command) => command.action)).toEqual(["providers-check-add"]);
  });

  it("refuses a creation check for a different target before collecting values", async () => {
    terminal();
    host(
      () => {
        throw new Error("No mutation expected");
      },
      undefined,
      () => ({ checked: true, profileId: "other", driver: "cursor" }),
    );
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "add",
        "work",
        "--driver",
        "cursor",
        "--prompt-env",
        "CURSOR_API_KEY",
      ]),
    ).rejects.toThrow("requested profile/driver");
    expect(mocks.prompt).not.toHaveBeenCalled();
  });

  it("does not submit partial values when a later prompt is cancelled", async () => {
    terminal();
    host(() => ({ profiles: [{ id: "work" }] }));
    const cancelled = new Error("Fixture prompt cancelled");
    mocks.prompt.mockResolvedValueOnce("synthetic-secret").mockRejectedValueOnce(cancelled);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "ONE",
        "--prompt-env",
        "TWO",
      ]),
    ).rejects.toBe(cancelled);
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
    ]);
  });

  it("preserves valid shell environment names that match object prototype properties", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list" ? { profiles: [{ id: "work" }] } : { saved: true },
    );
    mocks.prompt.mockResolvedValue("synthetic-secret");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "work",
      "--prompt-env",
      "constructor",
    ]);
    const command = commands().find((entry) => entry.action === "providers-configure-checked")!;
    expect(Object.hasOwn(command.environment!, "constructor")).toBe(true);
    expect(command.environment!["constructor"]).toBe("synthetic-secret");
  });

  it("refuses a missing exact profile before asking for any secret", async () => {
    terminal();
    host(() => ({ profiles: [{ id: "other" }] }));
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
      ]),
    ).rejects.toThrow("no other profile");
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(commands()).toEqual([{ action: "providers-list" }]);
  });

  it.each(["", "x".repeat(16_385)])(
    "rejects an empty or over-limit secret before mutation",
    async (value) => {
      terminal();
      host(() => ({ profiles: [{ id: "work" }] }));
      mocks.prompt.mockResolvedValue(value);
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), [
          "providers",
          "configure",
          "work",
          "--prompt-env",
          "FIXTURE_KEY",
        ]),
      ).rejects.toThrow("Nothing was saved");
      expect(commands()).toEqual([
        { action: "providers-list" },
        { action: "providers-prepare-configuration", instanceId: "work" },
      ]);
    },
  );

  it("requires explicit script input before contacting an owner", async () => {
    terminal();
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
        "--json",
      ]),
    ).rejects.toThrow("--env-file");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    ["--prompt-env", "BAD-NAME"],
    ["--prompt-env", "__proto__"],
    ["--prompt-env", "KEY", "--prompt-env", "KEY"],
    ["--prompt-env", "KEY", "--env-file", "fixture.json"],
    ["--env-stdin", "--env-file", "fixture.json"],
    ["--env-stdin", "--prompt-env", "KEY"],
  ])("rejects conflicting or invalid secret sources (%j)", (...flags) => {
    expect(() => parseAdminCli(["providers", "configure", "work", ...flags])).toThrow(Error);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("guides profile selection and hidden values on one pinned owner without echoing metadata secrets", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list"
        ? {
            profiles: [
              {
                id: "work",
                driver: "fixture",
                displayName: "Work\u001b[2J",
                enabled: false,
                secret: "never-print-this",
              },
              { id: "other" },
            ],
          }
        : { profileId: "work", saved: true },
    );
    mocks.prompt
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("FIXTURE_KEY, FIXTURE_URL")
      .mockResolvedValueOnce("synthetic-secret")
      .mockResolvedValueOnce("synthetic-endpoint");
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]);
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
      {
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: profileRevision,
        environment: { FIXTURE_KEY: "synthetic-secret", FIXTURE_URL: "synthetic-endpoint" },
      },
    ]);
    expect(mocks.prompt.mock.calls.slice(-2)).toEqual([
      ["FIXTURE_KEY (hidden): ", { secret: true }],
      ["FIXTURE_URL (hidden): ", { secret: true }],
    ]);
    const displayed = errors.mock.calls.flat().join("");
    expect(displayed).toContain("\\u001b");
    expect(displayed).not.toContain("\u001b");
    expect(displayed).toContain("disabled");
    for (const value of ["synthetic-secret", "synthetic-endpoint", "never-print-this"]) {
      expect(displayed).not.toContain(value);
      expect(output.mock.calls.flat().join("")).not.toContain(value);
    }
    expectPinned();
  });

  it("guides names for an explicit saved profile without switching to another profile", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list"
        ? { profiles: [{ id: "other" }, { id: "work" }] }
        : { saved: true, profileId: "work" },
    );
    mocks.prompt.mockResolvedValueOnce("FIXTURE_KEY").mockResolvedValueOnce("synthetic-secret");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure", "work"]);
    expect(mocks.prompt.mock.calls[0]![0]).toContain("Environment variable names");
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
      {
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: profileRevision,
        environment: { FIXTURE_KEY: "synthetic-secret" },
      },
    ]);
    expectPinned();
  });

  it("selects a profile for an explicit non-secret edit without asking for environment values", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list"
        ? { profiles: [{ id: "work" }, { id: "other" }] }
        : { saved: true, profileId: "other" },
    );
    mocks.prompt.mockResolvedValueOnce("2");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "--name",
      "Renamed",
    ]);
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "other" },
      {
        action: "providers-configure-checked",
        instanceId: "other",
        expectedProfileRevision: profileRevision,
        displayName: "Renamed",
      },
    ]);
    expect(mocks.prompt).toHaveBeenCalledExactlyOnceWith("Profile number: ");
    expectPinned();
  });

  it.each(["", "BAD-NAME", "DUP,DUP", "__proto__"])(
    "rejects invalid guided names before collecting values (%s)",
    async (names) => {
      terminal();
      host(() => ({ profiles: [{ id: "work" }] }));
      mocks.prompt.mockResolvedValueOnce(names);
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure", "work"]),
      ).rejects.toThrow(Error);
      expect(mocks.prompt).toHaveBeenCalledTimes(1);
      expect(commands()).toEqual([
        { action: "providers-list" },
        { action: "providers-prepare-configuration", instanceId: "work" },
      ]);
    },
  );

  it("cancels a guided profile interaction without submitting earlier secret values", async () => {
    terminal();
    host(() => ({ profiles: [{ id: "work" }] }));
    const cancelled = new Error("fixture cancelled second secret");
    mocks.prompt
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("ONE,TWO")
      .mockResolvedValueOnce("synthetic-secret")
      .mockRejectedValueOnce(cancelled);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]),
    ).rejects.toBe(cancelled);
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
    ]);
    expectPinned();
  });

  it("refuses an empty inventory or invalid selection instead of choosing a different profile", async () => {
    terminal();
    host(() => ({ profiles: [] }));
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]),
    ).rejects.toThrow("No saved provider profiles");
    expect(mocks.prompt).not.toHaveBeenCalled();
    host(() => ({ profiles: [{ id: "work" }] }));
    mocks.prompt.mockResolvedValueOnce("99");
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]),
    ).rejects.toThrow("Invalid profile selection");
    expect(commands().every((command) => command.action === "providers-list")).toBe(true);
  });

  it.each([false, true])(
    "requires an explicit profile ID for scripts/JSON before owner contact (%s)",
    async (json) => {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: json,
      });
      await expect(
        runAdminCli(resolve("tmp/explicit-profile"), [
          "providers",
          "configure",
          ...(json ? ["--json"] : []),
        ]),
      ).rejects.toThrow("Specify a profile ID");
      expect(mocks.request).not.toHaveBeenCalled();
      expect(mocks.prompt).not.toHaveBeenCalled();
    },
  );

  it("preserves explicit JSON profile edits without adding discovery or terminal prompts", async () => {
    terminal();
    host(() => ({ saved: true, profileId: "work" }));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "work",
      "--name",
      "Renamed",
      "--json",
    ]);
    expect(commands()).toEqual([
      { action: "providers-configure", instanceId: "work", displayName: "Renamed" },
    ]);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expectPinned();
  });

  it("does not let an unrelated legacy ID prevent selection of a supported profile", async () => {
    terminal();
    host((command) =>
      command.action === "providers-list"
        ? { profiles: [{ id: "legacy invalid/id" }, { id: "work" }] }
        : { profileId: "work", saved: true },
    );
    mocks.prompt
      .mockResolvedValueOnce("2")
      .mockResolvedValueOnce("FIXTURE_KEY")
      .mockResolvedValueOnce("synthetic-secret");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]);
    expect(commands().at(-1)).toEqual({
      action: "providers-configure-checked",
      instanceId: "work",
      expectedProfileRevision: profileRevision,
      environment: { FIXTURE_KEY: "synthetic-secret" },
    });
    expectPinned();
  });

  it("refuses an unsupported selected legacy ID before asking for environment names or values", async () => {
    terminal();
    host(() => ({ profiles: [{ id: "legacy invalid/id" }, { id: "work" }] }));
    mocks.prompt.mockResolvedValueOnce("1");
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["providers", "configure"]),
    ).rejects.toThrow("selected profile ID");
    expect(mocks.prompt).toHaveBeenCalledExactlyOnceWith("Profile number: ");
    expect(commands()).toEqual([{ action: "providers-list" }]);
  });

  it("requires a supported owner before collecting any profile key", async () => {
    terminal();
    const refused = new Error("Fixture owner refuses local-admin v3");
    host(
      () => ({ profiles: [{ id: "work" }] }),
      () => {
        throw refused;
      },
    );
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
      ]),
    ).rejects.toBe(refused);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(commands()).toEqual([
      { action: "providers-list" },
      { action: "providers-prepare-configuration", instanceId: "work" },
    ]);
    expect(
      mocks.request.mock.calls
        .filter(([, operation]) => operation === "admin")
        .map(([, , options]) => hostAdminRequestSchema.parse(options?.payload).adminVersion),
    ).toEqual([1, 3]);
    expectPinned();
  });

  it.each([
    { profileId: "other", driver: "fixture", displayName: "Work" },
    { profileId: "work", driver: "different", displayName: "Work" },
    { profileId: "work", driver: "fixture", displayName: "Different" },
  ])("refuses changed prepared metadata before asking for secrets (%j)", async (metadata) => {
    terminal();
    host(
      () => ({ profiles: [{ id: "work", driver: "fixture", displayName: "Work" }] }),
      () => ({ ...metadata, profileRevision }),
    );
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
      ]),
    ).rejects.toThrow("selected profile changed");
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(commands()).toHaveLength(2);
    expectPinned();
  });

  it("prepares before hidden input and never retries a checked-write conflict through legacy configure", async () => {
    terminal();
    const conflict = new Error("The selected profile changed during configuration");
    host((command) => {
      if (command.action === "providers-list") return { profiles: [{ id: "work" }] };
      throw conflict;
    });
    mocks.prompt.mockImplementationOnce(async () => {
      expect(commands().at(-1)).toEqual({
        action: "providers-prepare-configuration",
        instanceId: "work",
      });
      return "synthetic-secret";
    });
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), [
        "providers",
        "configure",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
      ]),
    ).rejects.toBe(conflict);
    expect(commands().map((command) => command.action)).toEqual([
      "providers-list",
      "providers-prepare-configuration",
      "providers-configure-checked",
    ]);
    expect(
      commands().find((entry) => entry.action === "providers-configure-checked")
        ?.expectedProfileRevision,
    ).toBe(profileRevision);
    expectPinned();
  });

  it("selects an advertised method on the same exact provider/runtime/WSL target", async () => {
    terminal();
    host((command) =>
      command.action === "auth-methods"
        ? {
            terminalLogin: false,
            terminalPreferred: false,
            methods: [
              { id: "browser", name: "Browser", type: "agent" },
              { id: "device", name: "Device", type: "agent" },
            ],
          }
        : { authenticated: true },
    );
    mocks.prompt.mockResolvedValue("2");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "auth",
      "login",
      "fixture:work",
      "--runtime",
      "cli",
      "--wsl",
      "Ubuntu",
    ]);
    expect(commands()).toEqual([
      { action: "auth-methods", agentKind: "fixture:work", runtime: "cli", wslDistro: "Ubuntu" },
      {
        action: "auth-login",
        agentKind: "fixture:work",
        runtime: "cli",
        wslDistro: "Ubuntu",
        methodId: "device",
      },
    ]);
    expectPinned();
  });

  it.each([true, undefined])(
    "preserves preferred/older terminal routing (%s)",
    async (preference) => {
      terminal();
      host((command) =>
        command.action === "auth-methods"
          ? {
              terminalLogin: true,
              ...(preference !== undefined ? { terminalPreferred: preference } : {}),
              methods: [
                { id: "browser", name: "Browser", type: "agent" },
                { id: "device", name: "Device", type: "agent" },
              ],
            }
          : { authenticated: true },
      );
      vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await runAdminCli(resolve("tmp/explicit-profile"), ["auth", "login", "fixture"]);
      expect(mocks.prompt).not.toHaveBeenCalled();
      expect(commands().at(-1)).toEqual({ action: "auth-login", agentKind: "fixture" });
      expectPinned();
    },
  );

  it("does not start provider authentication for an environment-only method", async () => {
    terminal();
    host(() => ({
      terminalLogin: false,
      terminalPreferred: false,
      methods: [
        { id: "key", name: "API key", type: "env_var", variables: [{ name: "FIXTURE_KEY" }] },
        { id: "browser", name: "Browser", type: "agent" },
      ],
    }));
    mocks.prompt.mockResolvedValue("1");
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["auth", "login", "fixture"]),
    ).rejects.toThrow("--prompt-env FIXTURE_KEY");
    expect(commands()).toEqual([{ action: "auth-methods", agentKind: "fixture" }]);
  });

  it("keeps explicit script login free of interactive discovery and prompts", async () => {
    host(() => ({ authenticated: true }));
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "auth",
      "login",
      "fixture",
      "--method",
      "device",
      "--json",
    ]);
    expect(commands()).toEqual([
      { action: "auth-login", agentKind: "fixture", methodId: "device" },
    ]);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual({
      authenticated: true,
      agentKind: "fixture",
    });
  });

  it("preserves supported structured inventory fields and refuses unknown fields without printing them", async () => {
    const result = {
      formatVersion: 1,
      environment: { kind: "native" },
      observation: { source: "saved-cache", state: "missing", version: null },
      configurationScope: "host",
      providers: [],
      profiles: [],
    };
    host(() => result);
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), ["providers", "list", "--json"]);
    expect(output).toHaveBeenCalledOnce();
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(result);
    expect(mocks.prompt).not.toHaveBeenCalled();
    output.mockClear();
    host(() => ({ ...result, futureMetadata: { hint: "must-not-print" } }));
    await expect(
      runAdminCli(resolve("tmp/explicit-profile"), ["providers", "list", "--json"]),
    ).rejects.toThrow("Unrecognized key");
    expect(output).not.toHaveBeenCalled();
  });

  it("accepts piped JSON through the same owner/profile command without prompting or echoing values", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const iterator = Readable.from([Buffer.from('{"FIXTURE_KEY":"synthetic-piped-secret"}')])[
      Symbol.asyncIterator
    ]();
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() => iterator);
    host(() => ({ profileId: "work", saved: true }));
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "work",
      "--env-stdin",
      "--json",
    ]);
    expect(commands()).toEqual([
      {
        action: "providers-configure",
        instanceId: "work",
        environment: { FIXTURE_KEY: "synthetic-piped-secret" },
      },
    ]);
    expect(output).toHaveBeenCalledExactlyOnceWith('{"profileId":"work","saved":true}\n');
    expect(mocks.prompt).not.toHaveBeenCalled();
    expectPinned();
  });

  it("does not contact an owner for malformed piped JSON", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const iterator = Readable.from([Buffer.from("synthetic-secret-invalid-json")])[
      Symbol.asyncIterator
    ]();
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() => iterator);
    const failure = await runAdminCli(resolve("tmp/explicit-profile"), [
      "providers",
      "configure",
      "work",
      "--env-stdin",
      "--json",
    ]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("synthetic-secret");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("bounded MCP definition input", () => {
  it("decodes split UTF-8 and applies canonical defaults", async () => {
    const raw = {
      id: "exact-id",
      name: "fixture",
      description: "synthetic-🔑",
      transport: { type: "stdio", command: "fixture" },
    };
    const bytes = Buffer.from(JSON.stringify(raw));
    const split = bytes.indexOf(Buffer.from("🔑")) + 1;
    await expect(
      readMcpDefinitionInput(
        Readable.from([bytes.subarray(0, split), bytes.subarray(split)]),
        raw.id,
      ),
    ).resolves.toEqual(mcpServerSchema.parse(raw));
  });

  it.each([
    "synthetic-private-invalid-json",
    "[]",
    '{"id":"other-id"}',
    '{"id":"exact-id","name":"fixture","transport":{"type":"http","url":"https://fixture.test","headers":{"Authorization":"«redacted»"}}}',
  ])("rejects unsupported/masked input without returning private values (%s)", async (raw) => {
    const failure = await readMcpDefinitionInput(
      Readable.from([Buffer.from(raw)]),
      "exact-id",
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("synthetic-private");
  });

  it("retires oversized iterators and preserves I/O failure causes without exposing them", async () => {
    let retired = false;
    const oversized = (async function* () {
      try {
        yield Buffer.alloc(65_537, 32);
      } finally {
        retired = true;
      }
    })();
    await expect(readMcpDefinitionInput(oversized, "exact-id", "file")).rejects.toThrow(
      "65536 bytes",
    );
    expect(retired).toBe(true);
    const cause = new Error("synthetic-private-file-detail");
    const broken = (async function* () {
      yield Buffer.from('{"id":');
      throw cause;
    })();
    const failure = await readMcpDefinitionInput(broken, "exact-id").catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ cause });
    expect(String(failure)).not.toContain("synthetic-private");
    await expect(
      readMcpDefinitionInput(Readable.from([Buffer.from([255])]), "exact-id"),
    ).rejects.toThrow("UTF-8");
  });
});

describe("bounded environment JSON input", () => {
  it("reads split Unicode JSON without changing values", async () => {
    const bytes = Buffer.from('{"FIXTURE_KEY":"synthetic-🔑"}');
    const split = bytes.length - 3;
    await expect(
      readEnvironmentStdin(Readable.from([bytes.subarray(0, split), bytes.subarray(split)])),
    ).resolves.toEqual({ FIXTURE_KEY: "synthetic-🔑" });
  });

  it.each(["", "[]", '{"KEY":42}', '{"BAD-NAME":"value"}', '{"__proto__":"value"}', "null"])(
    "refuses malformed/unsupported environment input without echoing its values (%s)",
    async (text) => {
      await expect(readEnvironmentStdin(Readable.from([Buffer.from(text)]))).rejects.toThrow(
        "nothing was saved",
      );
    },
  );

  it("bounds pipe bytes and individual values", async () => {
    await expect(readEnvironmentStdin(Readable.from([Buffer.alloc(65_537, 32)]))).rejects.toThrow(
      "65536 bytes",
    );
    await expect(
      readEnvironmentStdin(
        Readable.from([Buffer.from(JSON.stringify({ KEY: "x".repeat(16_385) }))]),
      ),
    ).rejects.toThrow("16384 characters");
    await expect(
      readEnvironmentStdin(
        Readable.from([
          Buffer.concat([Buffer.from('{"KEY":"'), Buffer.from([255]), Buffer.from('"}')]),
        ]),
      ),
    ).rejects.toThrow("JSON object");
  });

  it("retains a stream failure as the cause without printing it as an input value", async () => {
    const failure = new Error("synthetic-sensitive-stream-detail");
    const input = (async function* () {
      yield Buffer.from('{"KEY":');
      throw failure;
    })();
    const error = await readEnvironmentStdin(input).catch((value: unknown) => value);
    expect(error).toMatchObject({ cause: failure });
    expect(String(error)).not.toContain("synthetic-sensitive");
  });
});
