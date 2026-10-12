import type { DevinModelFamily } from "./models";
import type { prepareOneShot, spawnAgent } from "../../oneShotSpawn";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cachedForKey: vi.fn<() => DevinModelFamily[]>(() => []),
  key: vi.fn<() => string>(() => "k"),
  loadForKey: vi.fn<() => Promise<DevinModelFamily[]>>(),
  volatileScope: vi.fn<() => Promise<string>>(async () => "vol:fixed"),
  defaultScope: vi.fn<() => Promise<{ generation: string; volatileGeneration: string }>>(
    async () => ({ generation: "gen-default", volatileGeneration: "vol:default" }),
  ),
  spawn: vi.fn<typeof spawnAgent>().mockResolvedValue("OK"),
  prepare: vi.fn<typeof prepareOneShot>(),
}));
vi.mock("./modelCatalog", () => ({
  cachedDevinModelsForKey: mocks.cachedForKey,
  devinModelCatalogKey: mocks.key,
  loadDevinModelsForKey: mocks.loadForKey,
}));
vi.mock("./volatileCatalog", () => ({
  resolveDevinVolatileCatalogScope: mocks.volatileScope,
  resolveDevinDefaultCatalogScope: mocks.defaultScope,
}));
vi.mock("../../oneShotSpawn", () => ({ prepareOneShot: mocks.prepare }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/bin/devin" }));
import { runDevinOneShot as runOneShotForOwner } from "./oneShot";
import { createDevinTerminalLaunch } from "./terminalLaunch";
const terminalOwner = { agentKind: "devin", presentationMode: "terminal" as const };
const runDevinOneShot = (
  input: Parameters<typeof runOneShotForOwner>[0],
  settings?: Parameters<typeof runOneShotForOwner>[1],
) => runOneShotForOwner(input, settings, terminalOwner);

import type { DevinAdapterContexts } from "./adapterContext";
import { DevinCatalogUnavailableError } from "./launchContext";

const location = { kind: "posix" as const, path: "/project" };

const representativeCatalog: DevinModelFamily[] = [
  {
    id: "representative",
    label: "Family",
    variants: [
      { id: "representative", effort: "medium", fast: false, thinking: false, context: "default" },
      { id: "opaque-priority", effort: "high", fast: true, thinking: false, context: "default" },
    ],
  },
];

it("loads a cold catalog before resolving utility effort and Fast", async () => {
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockResolvedValue(representativeCatalog);
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", effort: "high", fast: true },
      prompt: "title",
    }),
  ).resolves.toBe("OK");
  // The base/default lane keys the scoped native default view (static
  // generation + volatile scope), not a bare location.
  expect(mocks.key).toHaveBeenCalledWith({
    location,
    generation: "gen-default",
    volatileGeneration: "vol:default",
  });
  expect(mocks.loadForKey).toHaveBeenCalledWith(
    "k",
    location,
    "/bin/devin",
    undefined,
    undefined,
    undefined,
  );
  expect(mocks.prepare).toHaveBeenCalledWith(
    location,
    expect.objectContaining({
      args: expect.arrayContaining(["--model", "opaque-priority"]),
      isolateCwd: true,
    }),
  );
});

it("keys a profile lane by the profile generation and the volatile scope", async () => {
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockResolvedValue(representativeCatalog);
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await runDevinOneShot(
    { location, selection: { model: "representative" }, prompt: "title" },
    {
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
    },
  );
  expect(mocks.volatileScope).toHaveBeenCalledWith(
    expect.objectContaining({ instanceId: "w", configGeneration: "gen" }),
    undefined,
  );
  expect(mocks.key).toHaveBeenCalledWith({
    location,
    generation: expect.stringContaining("gen"),
    volatileGeneration: "vol:fixed",
  });
});

it("degrades a volatile-scope failure to no catalog without touching any cache key", async () => {
  // A failed scope resolution must never fall back to a key that omits the
  // credential/config/org dimensions — such a key could be shared with an
  // entry another credential/org/policy state cached.
  mocks.defaultScope.mockRejectedValue(new Error("config unreadable"));
  mocks.volatileScope.mockRejectedValue(new Error("credential unreadable"));
  mocks.loadForKey.mockRejectedValue(new Error("catalog down"));
  mocks.cachedForKey.mockReturnValue([]);
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  // Without explicit controls the raw id passes through.
  await expect(
    runDevinOneShot({ location, selection: { model: "swe-1-6-fast" }, prompt: "title" }),
  ).resolves.toBe("OK");
  expect(mocks.key).not.toHaveBeenCalled();
  expect(mocks.loadForKey).not.toHaveBeenCalled();
  expect(mocks.cachedForKey).not.toHaveBeenCalled();
  expect(mocks.prepare.mock.calls[0]?.[1].args).toContain("swe-1-6-fast");
  // With explicit controls the missing catalog fails visibly instead of
  // silently downgrading the requested variant.
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", effort: "high" },
      prompt: "title",
    }),
  ).rejects.toThrowError(DevinCatalogUnavailableError);
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  // The same degrade holds for a profile lane whose volatile scope fails.
  mocks.key.mockClear();
  await runDevinOneShot(
    { location, selection: { model: "swe-1-6-fast" }, prompt: "title" },
    {
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
    },
  );
  expect(mocks.key).not.toHaveBeenCalled();
  expect(mocks.loadForKey).not.toHaveBeenCalled();
});

it("falls back to the raw model id when the catalog fails without explicit controls", async () => {
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockRejectedValue(new Error("catalog down"));
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await expect(
    runDevinOneShot({ location, selection: { model: "swe-1-6-fast" }, prompt: "title" }),
  ).resolves.toBe("OK");
  const spec = mocks.prepare.mock.calls[0]?.[1];
  expect(spec?.args).toContain("swe-1-6-fast");
});

it("fails visibly instead of silently downgrading explicit effort on catalog failure", async () => {
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockRejectedValue(new Error("catalog down"));
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", effort: "high" },
      prompt: "title",
    }),
  ).rejects.toThrowError(DevinCatalogUnavailableError);
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it("declares cloud profiles unsupported for utility one-shots", async () => {
  // No qualified cloud-safe utility path exists, and a plain local spawn
  // would silently run the utility against the DEFAULT local account.
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await expect(
    runDevinOneShot(
      { location, selection: { model: "swe-1-6-fast" }, prompt: "title" },
      {
        instanceId: "cloudy",
        label: "Devin cloudy",
        auth: { kind: "default" },
        runtimeTarget: "cloud",
        configGeneration: "gen",
      },
    ),
  ).rejects.toMatchObject({ code: "cloud-oneshot-unsupported" });
  expect(mocks.prepare).not.toHaveBeenCalled();
  // No catalog work happens for a rejected cloud utility.
  expect(mocks.volatileScope).not.toHaveBeenCalled();
  expect(mocks.key).not.toHaveBeenCalled();
});

it("propagates a profile context resolution failure instead of running the default account", async () => {
  // A broken profile must never quietly fall back to the native default
  // login: utilities would consume the wrong credentials and misattribute
  // usage.
  await expect(
    runDevinOneShot(
      { location, selection: { model: "swe-1-6-fast" }, prompt: "title" },
      {
        instanceId: "broken",
        label: "Devin broken",
        auth: { kind: "default" },
        runtimeTarget: "local",
        configGeneration: "gen",
        configPath: "relative/path.json",
      },
    ),
  ).rejects.toMatchObject({ code: "invalid-config-path" });
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it("resolves the complete tuple warm, including present thinking and context carriers", async () => {
  // The full utility selection reaches variant resolution: empty/false/default
  // carriers stay present and land on the plain sibling; a present carrier
  // with no matching variant refuses visibly instead of being dropped.
  mocks.cachedForKey.mockReturnValue(representativeCatalog);
  // Earlier tests poison the default-lane scope mocks on purpose; restore the
  // resolvable scope this warm-resolution fixture needs.
  mocks.defaultScope.mockResolvedValue({
    generation: "gen-default",
    volatileGeneration: "vol:default",
  });
  mocks.volatileScope.mockResolvedValue("vol:fixed");
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await expect(
    runDevinOneShot({
      location,
      selection: {
        model: "representative",
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "",
      },
      prompt: "title",
    }),
  ).resolves.toBe("OK");
  expect(mocks.prepare.mock.calls[0]?.[1].args).toContain("representative");

  // thinking:true has no variant in this catalog — a visible refusal, never a
  // silent reduction to the thinking:false sibling.
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", thinking: true },
      prompt: "title",
    }),
  ).rejects.toThrow("Unsupported model configuration");
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
});

it("refuses a cold catalog when the selection carries present thinking or context", async () => {
  // The conservative gate covers every present carrier of the full selection,
  // including a nonempty "default" context and a false thinking seed.
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockRejectedValue(new Error("catalog down"));
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", thinking: false },
      prompt: "title",
    }),
  ).rejects.toThrowError(DevinCatalogUnavailableError);
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", contextSize: "default" },
      prompt: "title",
    }),
  ).rejects.toThrowError(DevinCatalogUnavailableError);
  // An empty context string inherits and needs nothing cold.
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "representative", contextSize: "" },
      prompt: "title",
    }),
  ).resolves.toBe("OK");
  expect(mocks.prepare.mock.calls[0]?.[1].args).toContain("representative");
});

it("refuses controls on an implicit utility model before catalog or spawn effects", async () => {
  vi.clearAllMocks();
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "", effort: "high", fast: true, thinking: true, contextSize: "1m" },
      prompt: "title",
    }),
  ).rejects.toMatchObject({
    name: "UnsupportedOneShotControlError",
    axes: ["effort", "fast", "thinking", "contextSize"],
  });
  expect(mocks.defaultScope).not.toHaveBeenCalled();
  expect(mocks.loadForKey).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("refuses unmapped controls for a raw model absent from a warm utility catalog", async () => {
  vi.clearAllMocks();
  mocks.defaultScope.mockResolvedValue({ generation: "gen", volatileGeneration: "vol" });
  mocks.cachedForKey.mockReturnValue(representativeCatalog);
  await expect(
    runDevinOneShot({
      location,
      selection: { model: "unknown", effort: "high", fast: true },
      prompt: "title",
    }),
  ).rejects.toMatchObject({ name: "UnsupportedOneShotControlError", axes: ["effort", "fast"] });
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("checks the terminal utility selection before context access and maps all known controls", async () => {
  vi.clearAllMocks();
  mocks.cachedForKey.mockReturnValue(representativeCatalog);
  const contextFor = vi.fn<DevinAdapterContexts["contextFor"]>().mockResolvedValue(undefined);
  const catalogScope = vi
    .fn<DevinAdapterContexts["catalogScope"]>()
    .mockResolvedValue({ location, generation: "gen", volatileGeneration: "vol" });
  const contexts = {
    contextFor,
    catalogScope,
    executableFor: () => "/bin/devin",
  } as unknown as DevinAdapterContexts;
  const discovery = {} as Parameters<typeof createDevinTerminalLaunch>[1];
  const builder = createDevinTerminalLaunch(
    contexts,
    discovery,
    terminalOwner.agentKind,
  ).buildOneShotCommand;
  const selection = Object.freeze({
    model: "representative",
    effort: "high",
    fast: true,
    thinking: false,
    contextSize: "default",
  });
  await expect(
    builder(selection.model, "low", "prompt", location, true, { selection }),
  ).rejects.toThrow("positional arguments disagree");
  await expect(
    builder("", "high", "prompt", location, true, {
      selection: { model: "", effort: "high", fast: true },
    }),
  ).rejects.toMatchObject({ name: "UnsupportedOneShotControlError", axes: ["effort", "fast"] });
  expect(contextFor).not.toHaveBeenCalled();
  expect(catalogScope).not.toHaveBeenCalled();
  const command = await builder(
    selection.model,
    selection.effort,
    "prompt",
    location,
    selection.fast,
    { selection },
  );
  expect(command?.args).toContain("opaque-priority");
  await expect(
    builder("unknown", "high", "prompt", location, true, {
      selection: { model: "unknown", effort: "high", fast: true },
    }),
  ).rejects.toMatchObject({ name: "UnsupportedOneShotControlError", axes: ["effort", "fast"] });
});

it("CLI print keeps the original catalog attempt and consumes only its actual owner's cold evidence", async () => {
  vi.clearAllMocks();
  mocks.cachedForKey.mockReturnValue([]);
  mocks.loadForKey.mockRejectedValue(new Error("catalog down"));
  mocks.prepare.mockResolvedValue({
    spec: { command: "devin", args: [], cwd: "/tmp" },
    spawn: mocks.spawn,
  });
  const owner = { agentKind: "devin:profile-a", presentationMode: "terminal" as const };
  const inertValues = { effort: "", fast: false, thinking: false, contextSize: "default" };
  const selection = {
    model: "opaque-member",
    ...inertValues,
    selectionBinding: {
      version: 1 as const,
      kind: "family-member" as const,
      owner,
      model: "opaque-member",
      inertValues,
    },
  };
  const before = structuredClone(selection);
  await expect(
    runOneShotForOwner({ location, selection, prompt: "title" }, undefined, owner),
  ).resolves.toBe("OK");
  expect(mocks.loadForKey).toHaveBeenCalledTimes(1);
  expect(mocks.prepare.mock.calls[0]?.[1].args).toContain("opaque-member");
  expect(selection).toEqual(before);
  vi.clearAllMocks();
  await expect(
    runOneShotForOwner({ location, selection, prompt: "title" }, undefined, terminalOwner),
  ).rejects.toThrow(DevinCatalogUnavailableError);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it("Terminal builder and no-executable rewrite use the full independently registered profile kind", async () => {
  const contexts = {
    contextFor: vi.fn<DevinAdapterContexts["contextFor"]>().mockResolvedValue(undefined),
    catalogScope: vi
      .fn<DevinAdapterContexts["catalogScope"]>()
      .mockResolvedValue({ location, generation: "gen", volatileGeneration: "vol" }),
    executableFor: () => undefined,
    discoveryScope: () => undefined,
  } as unknown as DevinAdapterContexts;
  const discovery = {
    ready: vi
      .fn<Parameters<typeof createDevinTerminalLaunch>[1]["ready"]>()
      .mockResolvedValue(undefined),
  } as unknown as Parameters<typeof createDevinTerminalLaunch>[1];
  const owner = { agentKind: "devin:profile-a", presentationMode: "terminal" as const };
  const inertValues = { effort: "default", fast: false, thinking: false, contextSize: "default" };
  const selection = {
    model: "opaque-member",
    ...inertValues,
    selectionBinding: {
      version: 1 as const,
      kind: "family-member" as const,
      owner,
      model: "opaque-member",
      inertValues,
    },
  };
  const profile = createDevinTerminalLaunch(contexts, discovery, owner.agentKind);
  const command = await profile.buildOneShotCommand(
    selection.model,
    selection.effort,
    "title",
    location,
    selection.fast,
    { selection },
  );
  expect(command?.args).toContain(selection.model);
  const args = ["--model", selection.model];
  await expect(profile.rewriteLaunchArgsForConfig(args, selection, location)).resolves.toEqual(
    args,
  );
  const other = createDevinTerminalLaunch(contexts, discovery, "devin:profile-b");
  await expect(
    other.buildOneShotCommand(
      selection.model,
      selection.effort,
      "title",
      location,
      selection.fast,
      { selection },
    ),
  ).rejects.toThrow(DevinCatalogUnavailableError);
  await expect(other.rewriteLaunchArgsForConfig(args, selection, location)).rejects.toThrow(
    DevinCatalogUnavailableError,
  );
  expect(selection).toHaveProperty("fast", false);
  expect(selection.selectionBinding.inertValues).toEqual(inertValues);
});
