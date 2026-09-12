import { beforeEach, vi } from "vitest";
import type {
  AgentCapability,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import type {
  AgentAdapter,
  CreateStructuredSessionInput,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "@/supervisor/agents/base";
import { SubagentRunManager } from "./SubagentRunManager";
import type { SubagentRunHost } from "./types";
const resolveAgentProjectLocation = vi.hoisted(() =>
  vi.fn<
    (
      adapter: AgentAdapter,
      location: ProjectLocation,
      executionEnvironment?: ThreadConfig["executionEnvironment"],
    ) => Promise<ProjectLocation>
  >(
    async (
      _adapter: AgentAdapter,
      location: ProjectLocation,
      _executionEnvironment?: ThreadConfig["executionEnvironment"],
    ) => location,
  ),
);

vi.mock("@/supervisor/agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/supervisor/agents/base")>()),
  resolveAgentProjectLocation,
}));

export const PARENT = "parent";
export const PROJECT: ProjectLocation = { kind: "posix", path: "/tmp/project" };

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export class FakeHandle implements StructuredSessionHandle {
  steerTurn?: NonNullable<StructuredSessionHandle["steerTurn"]>;
  launchOptions = {};
  listener: StructuredSessionListener | undefined;
  disposed = false;
  interrupted = false;
  startTurns: Array<{ prompt: string; config: ThreadConfig }> = [];
  resolvedRequests: Array<{ requestId: string | number; response: unknown }> = [];

  constructor(private readonly interruptError?: string) {}

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
  }
  async startTurn(prompt: string, config: ThreadConfig): Promise<void> {
    this.startTurns.push({ prompt, config });
  }
  async interruptTurn(): Promise<void> {
    this.interrupted = true;
    if (this.interruptError) this.listener?.onError(this.interruptError);
  }
  async resolveServerRequest(requestId: string | number, response: unknown): Promise<void> {
    this.resolvedRequests.push({ requestId, response });
  }
  async dispose(): Promise<void> {
    this.disposed = true;
  }

  emit(event: RuntimeEvent): void {
    this.listener?.onRuntimeEvent?.(event);
  }
  openRequest(requestId: string): void {
    this.emit({
      type: "request.opened",
      threadId: "child",
      requestId,
      requestType: "tool_call_approval",
      payload: { summary: "May I run this tool?" },
    });
  }
  completeTurn(state: "completed" | "failed" | "interrupted" | "cancelled"): void {
    this.emit({ type: "turn.completed", threadId: "child", turnId: "turn-1", state });
  }
  update(status: "idle" | "working"): void {
    this.listener?.onUpdate({ status, attention: "none" });
  }
}

interface Harness {
  manager: SubagentRunManager;
  handles: FakeHandle[];
  inputs: CreateStructuredSessionInput[];
  appended: Array<{ threadId: string; event: RuntimeEvent }>;
  mcpTargets: string[];
  mcpLocations: ProjectLocation[];
  releaseCreate: () => void;
}

export function makeHarness(options?: {
  providerLabel?: string;
  models?: Array<{ id: string; label: string }>;
  subProviders?: Array<{ id: string; label: string }>;
  modelSubProvider?: Record<string, string>;
  statusCapabilities?: AgentCapability | null;
  createFailures?: number;
  deferCreate?: boolean;
  interruptError?: string;
  baseSpawnEnv?: Record<string, string>;
  projectLocation?: ProjectLocation;
  executionEnvironment?: ThreadConfig["executionEnvironment"];
  windowsProjectExecution?: AgentAdapter["windowsProjectExecution"];
}): Harness {
  const handles: FakeHandle[] = [];
  const inputs: CreateStructuredSessionInput[] = [];
  const appended: Array<{ threadId: string; event: RuntimeEvent }> = [];
  const mcpTargets: string[] = [];
  const mcpLocations: ProjectLocation[] = [];
  let createFailures = options?.createFailures ?? 0;
  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });

  const adapter = {
    kind: "codex",
    label: options?.providerLabel ?? "Codex",
    ...(options?.windowsProjectExecution
      ? { windowsProjectExecution: options.windowsProjectExecution }
      : {}),
    ...(options?.baseSpawnEnv ? { baseSpawnEnv: options.baseSpawnEnv } : {}),
    capabilities: {
      models: options?.models ?? [{ id: "gpt-5.5", label: "GPT-5.5" }],
      ...(options?.subProviders ? { subProviders: options.subProviders } : {}),
      ...(options?.modelSubProvider ? { modelSubProvider: options.modelSubProvider } : {}),
      efforts: ["low", "high"],
      fastModels: ["gpt-5.5"],
      approvalPolicies: [
        { id: "on-request", label: "On Request" },
        { id: "never", label: "Full Access" },
      ],
      sandboxModes: [
        { id: "workspace-write", label: "Workspace Write" },
        { id: "danger-full-access", label: "Full Access" },
      ],
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      bypassPermissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    },
    createStructuredSession: async (input: CreateStructuredSessionInput) => {
      inputs.push(input);
      if (options?.deferCreate) await createGate;
      if (createFailures > 0) {
        createFailures -= 1;
        throw new Error("session launch failed");
      }
      const handle = new FakeHandle(options?.interruptError);
      handles.push(handle);
      return handle;
    },
  } as unknown as AgentAdapter;

  const host: SubagentRunHost = {
    getParentContext: (threadId) =>
      threadId === PARENT
        ? {
            projectLocation: options?.projectLocation ?? PROJECT,
            config: {
              model: "parent-model",
              ...(options?.executionEnvironment
                ? { executionEnvironment: options.executionEnvironment }
                : {}),
              approvalPolicy: "never",
              sandboxMode: "workspace-write",
              browserMcp: true,
              crossagentMcp: true,
              computerUse: true,
              chromeMcp: true,
            },
          }
        : undefined,
    resolveParentMcpAccess: async (_threadId, _identity, targetAgentKind, projectLocation) => {
      mcpTargets.push(targetAgentKind);
      mcpLocations.push(projectLocation);
      return {
        mcpServers: ["browser", "computer_use", "chrome"].map((name) => ({
          id: name,
          name,
          timeoutMs: 30_000,
          transport: {
            type: "http" as const,
            url: `http://${name}/mcp`,
            headers: { Authorization: `Bearer ${name}-token` },
          },
        })),
      };
    },
    appendRuntimeEvent: (threadId, event) => appended.push({ threadId, event }),
  };

  const hasStatusCapabilities = options?.statusCapabilities !== undefined;
  const statusCapabilities = options?.statusCapabilities;
  const manager = new SubagentRunManager({
    adapters: new Map([["codex" as never, adapter]]),
    ...(hasStatusCapabilities ? { getStatusCapabilities: () => statusCapabilities } : {}),
    host,
  });
  return { manager, handles, inputs, appended, mcpTargets, mcpLocations, releaseCreate };
}

beforeEach(() => {
  resolveAgentProjectLocation.mockImplementation(async (_adapter, location) => location);
});

export { resolveAgentProjectLocation };
