import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runAdminCli } from "./cliAdmin";
import { cliCommandHelp } from "./cliHelp";
import { parsePluginCatalogCli } from "./cliPluginCatalog";
import { hostAdminRequestSchema, type HostAdminCommand } from "@/shared/hostAdminProtocol";
import { hostAdminCatalogCommandSchema } from "@/shared/contracts/hostPluginCatalog";
const control = vi.hoisted(() =>
  vi.fn<
    (
      ...args: Parameters<typeof import("@/backend/ownership/hostControlClient").callHostControl>
    ) => Promise<unknown>
  >(),
);
const prompt = vi.hoisted(() => vi.fn<typeof import("./cliPrompts").promptCli>());
vi.mock("@/backend/ownership/hostControlClient", async (original) => ({
  ...(await original<typeof import("@/backend/ownership/hostControlClient")>()),
  callHostControl: control,
}));
vi.mock("./cliPrompts", async (original) => ({
  ...(await original<typeof import("./cliPrompts")>()),
  promptCli: prompt,
}));
const originalTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
afterEach(() => {
  vi.restoreAllMocks();
  control.mockReset();
  prompt.mockReset();
  if (originalTty) Object.defineProperty(process.stdin, "isTTY", originalTty);
  else Reflect.deleteProperty(process.stdin, "isTTY");
});
const catalogId = randomUUID(),
  digest = "ab".repeat(32);
const inspection = {
  catalogId,
  entryName: "notes",
  digest,
  revision: "local",
  name: "notes",
  version: "1.0.0",
  hostSupported: true,
  defaultEnabled: false,
  skills: ["summarize"],
  mcpServers: [],
  diagnostics: [],
};
function fixture(change?: (command: HostAdminCommand, result: unknown) => unknown) {
  const output: string[] = [],
    errors: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk, encoding, callback) => {
    output.push(String(chunk));
    const done = typeof encoding === "function" ? encoding : callback;
    done?.();
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk, encoding, callback) => {
    errors.push(String(chunk));
    const done = typeof encoding === "function" ? encoding : callback;
    done?.();
    return true;
  });
  control.mockImplementation(async (_paths, operation, options) => {
    if (operation === "describe") return { ownerGeneration: "exact-selected-owner" };
    const request = hostAdminRequestSchema.parse(options?.payload),
      command = hostAdminCatalogCommandSchema.parse(request.command);
    const result = {
      formatVersion: 1,
      scope: "global",
      command,
      catalogs: [
        {
          id: catalogId,
          name: "Example",
          source: { type: "local", path: resolve("fixture") },
          revision: "local",
          refreshedAt: 1,
          entryCount: 1,
        },
      ],
      installations: [],
      ...("entryName" in command ? { inspection } : {}),
    };
    return {
      result: {
        adminVersion: request.adminVersion,
        outcome: { ok: true, data: change ? change(command, result) : result },
      },
    };
  });
  return {
    output,
    errors,
    commands: () =>
      control.mock.calls
        .filter((call) => call[1] === "admin")
        .map((call) => hostAdminRequestSchema.parse(call[2]?.payload)),
  };
}
it("routes v12 package review/install through one described generation and prints structured metadata", async () => {
  const f = fixture();
  await runAdminCli(resolve("fixture-profile"), [
    "plugins",
    "install",
    catalogId,
    "notes",
    "--review-digest",
    digest,
    "--yes",
    "--json",
  ]);
  expect(control.mock.calls.filter((call) => call[1] === "describe")).toHaveLength(1);
  expect(f.commands()).toEqual([
    { adminVersion: 12, command: { action: "package-inspect", catalogId, entryName: "notes" } },
    {
      adminVersion: 12,
      command: { action: "package-install", catalogId, entryName: "notes", reviewDigest: digest },
    },
  ]);
  expect(
    control.mock.calls
      .filter((call) => call[1] === "admin")
      .every((call) => call[2]?.expectedGeneration === "exact-selected-owner"),
  ).toBe(true);
  expect(JSON.parse(f.output.join(""))).toMatchObject({
    formatVersion: 1,
    scope: "global",
    command: { action: "package-install" },
  });
});
it.each(
  [
    ["plugins", "install", catalogId, "notes", "--json"],
    ["plugins", "install", catalogId, "notes", "--yes", "--json"],
    ["plugins", "remove", "notes", "--json"],
    ["plugins", "catalogs", "add", "--url", "https://user:secret@fixture.invalid/repo", "--yes"],
    ["plugins", "catalogs", "add", "--path", "fixture", "--url", "https://fixture.invalid/repo"],
    ["plugins", "catalogs", "add", "--path", "fixture", "--ref", "main"],
    ["plugins", "update", catalogId, "notes", "--review-digest", "invalid", "--yes"],
    ["plugins", "disable", "notes", "--account", randomUUID()],
  ].map((args) => ({ args })),
)("refuses incomplete or cross-domain flags before contact: $args", async ({ args }) => {
  fixture();
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
  await expect(runAdminCli(resolve("fixture-profile"), args)).rejects.toThrow(
    /--yes|digest|credentials|Usage:|Unknown option/u,
  );
  expect(control).not.toHaveBeenCalled();
});
it("confirms the reviewed entry interactively and cancels a mismatched name before install", async () => {
  const f = fixture();
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  prompt.mockResolvedValue("different");
  await expect(
    runAdminCli(resolve("fixture-profile"), ["plugins", "install", catalogId, "notes"]),
  ).rejects.toThrow("cancelled");
  expect(f.commands().map((value) => value.command.action)).toEqual(["package-inspect"]);
  expect(f.errors.join("")).toContain("Review digest: " + digest);
  expect(f.output).toEqual([]);
  prompt.mockResolvedValue("notes");
  await runAdminCli(resolve("fixture-profile"), ["plugins", "install", catalogId, "notes"]);
  expect(f.commands().at(-1)?.command).toMatchObject({
    action: "package-install",
    reviewDigest: digest,
  });
});
it("refuses a changed digest without a mutation or retry", async () => {
  const f = fixture();
  await expect(
    runAdminCli(resolve("fixture-profile"), [
      "plugins",
      "update",
      catalogId,
      "notes",
      "--review-digest",
      "0".repeat(64),
      "--yes",
      "--json",
    ]),
  ).rejects.toThrow("changed after review");
  expect(f.commands()).toHaveLength(1);
  expect(f.output).toEqual([]);
});
it.each([
  { formatVersion: 2 },
  { command: { action: "catalogs-list" } },
  { inspection: { ...inspection, name: "other" } },
  { secret: "never-print" },
])(
  "refuses future/private/mismatched review replies without printing or installing: %j",
  async (extra) => {
    const f = fixture((_command, result) => ({ ...(result as object), ...extra }));
    await expect(
      runAdminCli(resolve("fixture-profile"), [
        "plugins",
        "install",
        catalogId,
        "notes",
        "--review-digest",
        digest,
        "--yes",
        "--json",
      ]),
    ).rejects.toThrow(/Invalid|Unrecognized|different/u);
    expect(f.commands()).toHaveLength(1);
    expect(f.output).toEqual([]);
  },
);
it("keeps credential-bearing repository URLs out of a forged catalog reply", async () => {
  const f = fixture((_command, result) => ({
    ...(result as object),
    catalogs: [
      {
        id: catalogId,
        name: "Private",
        source: { type: "git", url: "https://user:secret@fixture.invalid/repo" },
        revision: "x",
        refreshedAt: 1,
        entryCount: 0,
      },
    ],
  }));
  await expect(
    runAdminCli(resolve("fixture-profile"), ["plugins", "catalogs", "list", "--json"]),
  ).rejects.toThrow("credential-free HTTPS");
  expect(f.output).toEqual([]);
});
it("preserves output callback errors and removes its active stream listener", async () => {
  const f = fixture(),
    error = new Error("Controlled catalog output failure");
  const before = process.stdout.listenerCount("error");
  vi.spyOn(process.stdout, "write").mockImplementationOnce((_chunk, encoding, callback) => {
    const done = typeof encoding === "function" ? encoding : callback;
    done?.(error);
    process.stdout.emit("error", error);
    return false;
  });
  await expect(
    runAdminCli(resolve("fixture-profile"), ["plugins", "catalogs", "list", "--json"]),
  ).rejects.toBe(error);
  expect(process.stdout.listenerCount("error")).toBe(before);
  expect(f.commands()).toHaveLength(1);
});
it("refuses a mismatched enable result instead of claiming the requested policy", async () => {
  const f = fixture((_command, result) => ({
    ...(result as object),
    pluginState: { pluginName: "different", enabled: true },
  }));
  await expect(
    runAdminCli(resolve("fixture-profile"), ["plugins", "enable", "notes", "--yes", "--json"]),
  ).rejects.toThrow("did not confirm");
  expect(f.output).toEqual([]);
});

it("provides command-specific help and resolves local sources before forwarding", () => {
  expect(cliCommandHelp("plugins", "catalogs")).toContain("local-admin v12");
  expect(cliCommandHelp("plugins", "install")).toContain("--review-digest");
  expect(parsePluginCatalogCli(["plugins", "catalogs", "add", "--path", "relative"])).toMatchObject(
    { command: { action: "catalogs-add", source: { type: "local", path: resolve("relative") } } },
  );
});
