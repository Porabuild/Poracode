import { STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { beforeEach, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "@/supervisor/agents/base";

// In-memory filesystem: the real status service cannot touch profiles/keys.
const memory = vi.hoisted(() => ({
  path: "/owned-in-memory/status-cache.json",
  cache: undefined as string | undefined,
  writes: [] as string[],
  unlinks: 0,
  failUnlink: false,
  failWrite: false,
  cli: vi.fn<() => never>(() => {
    throw new Error("No subprocess/probe is allowed");
  }),
}));

vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  const requireOwned = (path: unknown) => {
    if (path !== memory.path) throw new Error("Unexpected filesystem access");
  };
  return {
    ...actual,
    readFile: vi.fn<(path: unknown) => Promise<string>>(async (path: unknown) => {
      requireOwned(path);
      if (memory.cache === undefined)
        throw Object.assign(new Error("Cache absent"), { code: "ENOENT" });
      return memory.cache;
    }),
    writeFile: vi.fn<(path: unknown, data: unknown) => Promise<void>>(
      async (path: unknown, data: unknown) => {
        requireOwned(path);
        if (memory.failWrite) throw new Error("Owned cache write failed");
        if (typeof data !== "string") throw new Error("Expected UTF-8 cache text");
        memory.cache = data;
        memory.writes.push(data);
      },
    ),
    unlink: vi.fn<(path: unknown) => Promise<void>>(async (path: unknown) => {
      requireOwned(path);
      memory.unlinks++;
      if (memory.failUnlink) throw new Error("Owned cache unlink failed");
      memory.cache = undefined;
    }),
  };
});
vi.mock("node:child_process", () => ({ execFile: memory.cli }));
vi.mock("@/supervisor/agents/base", () => ({
  primeExecutablePathCache: vi.fn<() => Promise<void>>(async () => undefined),
  invalidateExecutablePathCache: vi.fn<() => void>(),
  getWindowsSystemCommand: vi.fn<(name: string) => string>((name: string) => name),
}));
vi.mock("@/supervisor/agents/claude/fastModeCache", () => ({
  clearFastModeCache: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock("@/supervisor/runtime/supervisorSharedSettings", async () => {
  const { normalizeSharedSettings } = await import("@/shared/settings");
  return {
    readSupervisorSharedSettings: vi.fn<() => ReturnType<typeof normalizeSharedSettings>>(() =>
      normalizeSharedSettings({}),
    ),
  };
});

import { AgentStatusService } from "@/supervisor/runtime/agentStatusService";

const FAST = "acp-generic:ready-fixture";
const SLOW = "acp-generic:deferred-fixture";
const DISTRO = "OwnedUbuntu";
const nativeEnv = process.platform === "win32" ? "windows" : "posix";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const capabilities: AgentStatus["capabilities"] = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

function status(kind: string, model: string): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: { ...capabilities, models: [{ id: model, label: model }] },
  };
}

function adapter(kind: string, detectInstall: AgentAdapter["detectInstall"]): AgentAdapter {
  return {
    kind,
    label: kind,
    capabilities: { ...capabilities, slashCommands: [] },
    detectInstall,
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
  } as unknown as AgentAdapter;
}

function setup(adapters: AgentAdapter[], onEvent?: (event: SupervisorEvent) => void) {
  const events: SupervisorEvent[] = [];
  const firstNativeReady = deferred<void>();
  const registry = new Map(adapters.map((entry) => [entry.kind, entry]));
  const service = new AgentStatusService({
    adapters: registry,
    settingsPath: "/unused-mocked/settings.json",
    statusCachePath: memory.path,
    emit(event) {
      events.push(event);
      onEvent?.(event);
      if (
        event.type === "agent-detected" &&
        event.status.kind === FAST &&
        event.status.envKind === nativeEnv
      ) {
        firstNativeReady.resolve();
      }
    },
  });
  return { service, events, firstNativeReady, registry };
}

function activeDetection(service: AgentStatusService): Promise<unknown> {
  const pending: unknown = Reflect.get(service, "pendingDetection");
  if (!(pending instanceof Promise)) throw new Error("Expected an active owned detection");
  return pending;
}

function modelIds(response: { windows: AgentStatus[] }, kind = FAST) {
  return response.windows
    .find((entry) => entry.kind === kind)
    ?.capabilities.models.map((model) => model.id);
}

beforeEach(() => {
  memory.cache = undefined;
  memory.writes.length = 0;
  memory.unlinks = 0;
  memory.failUnlink = false;
  memory.failWrite = false;
  memory.cli.mockClear();
});

function seedBaseline() {
  memory.cache = JSON.stringify({
    version: STATUS_CACHE_VERSION,
    windows: [
      { ...status(FAST, "baseline-fast"), envKind: nativeEnv },
      { ...status(SLOW, "baseline-slow"), envKind: nativeEnv },
    ],
    wsl: [{ ...status(SLOW, "unrelated-wsl"), envKind: "wsl", envDistro: "OtherDistro" }],
  });
}

export {
  memory,
  FAST,
  SLOW,
  DISTRO,
  nativeEnv,
  deferred,
  status,
  adapter,
  setup,
  activeDetection,
  modelIds,
  seedBaseline,
};
