import type { Project, ProjectNotes, RemoteThreadCommand, Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../mcp/StreamableHttpMcpIngress";
import type { ScheduleService } from "../schedules/ScheduleService";
import type { CreateAppThreadRequest, CreateAppThreadResult } from "../threads/appThreadLauncher";
import { ThreadStateBroker } from "../threads/threadStateBroker";
import {
  APP_CONTROLS_MCP_INSTRUCTIONS,
  APP_CONTROLS_MCP_SERVER_INFO,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isKnownToolName,
  type AppControlsAppInfo,
  type AppControlsNotifyResult,
  type AppControlsSettingsGateway,
  type AppControlsSupervisorCaller,
  type AppControlsToolContext,
  type AppControlsUpdateCheck,
} from "./mcp/toolRegistry";

export type AppControlsMcpIngressInfo = StreamableHttpMcpIngressInfo;

/** Main-side seams the app-controls MCP server acts through. */
export interface AppControlsMcpIngressDeps {
  scheduleService: ScheduleService;
  getThread(threadId: string): Thread | null;
  getThreads(): Thread[];
  getProjects(): Project[];
  getProject(projectId: string): Project | null;
  getProjectNotes(projectId: string): ProjectNotes | null;
  directoryExists(path: string): boolean;
  applyProjectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult>;
  updateProject(project: Project): void;
  settings: AppControlsSettingsGateway;
  getAppInfo(): AppControlsAppInfo;
  supervisor: AppControlsSupervisorCaller;
  createThread(request: CreateAppThreadRequest): Promise<CreateAppThreadResult>;
  emitRemoteThreadCommand(command: RemoteThreadCommand): boolean | Promise<boolean>;
  updateThreadRow(threadId: string, mutate: (thread: Thread) => Thread): void;
  /** Bounded thread invalidation for host-local writes (optional for legacy embedders). */
  publishThreadsChanged?(threadIds: readonly string[]): void;
  /** Diagnostics sink for consumed background failures (optional). */
  reportError?(error: unknown): void;
  openThreadInUi(threadId: string): boolean;
  notifyUser(input: {
    title: string;
    body: string;
    threadId: string;
  }): AppControlsNotifyResult | Promise<AppControlsNotifyResult>;
  checkForUpdate(): Promise<AppControlsUpdateCheck>;
}

export class AppControlsMcpIngress {
  private readonly ingress: StreamableHttpMcpIngress<AppControlsToolContext>;
  /** Persistent live-status cache + wait surface, fed by {@link observeSupervisorEvent}. */
  private readonly threadStates = new ThreadStateBroker();
  private readonly calls = new Set<Promise<unknown>>();
  private disposed = false;
  private starting: Promise<AppControlsMcpIngressInfo> | null = null;
  private disposal: Promise<void> | null = null;

  constructor(deps: AppControlsMcpIngressDeps) {
    this.ingress = new StreamableHttpMcpIngress<AppControlsToolContext>({
      serverInfo: { ...APP_CONTROLS_MCP_SERVER_INFO },
      instructions: APP_CONTROLS_MCP_INSTRUCTIONS,
      tools: TOOLS,
      isKnownToolName,
      buildContext: (identity) =>
        this.disposed ? null : { ...deps, identity, threadStates: this.threadStates },
      dispatchTool: (name, args, context) => this.dispatch(() => dispatchTool(name, args, context)),
      formatToolResult,
    });
  }

  /** Wire into the supervisor event tap (main.ts / headless host `onEvent`). */
  observeSupervisorEvent(event: SupervisorEvent): void {
    this.threadStates.observe(event);
  }

  start(): Promise<AppControlsMcpIngressInfo> {
    if (this.disposed) return Promise.reject(new Error("App-controls ingress is shutting down."));
    this.starting ??= this.ingress
      .start()
      .then((info) => {
        if (this.disposed) throw new Error("App-controls ingress is shutting down.");
        return info;
      })
      .catch((error: unknown) => {
        this.starting = null;
        throw error;
      });
    return this.starting;
  }

  getInfo(): AppControlsMcpIngressInfo | null {
    return this.disposed ? null : this.ingress.getInfo();
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.threadStates.dispose();
    const ingressStop = this.ingress.dispose();
    this.disposal = Promise.allSettled([
      ingressStop,
      Promise.resolve(this.starting).catch(() => undefined),
      Promise.allSettled([...this.calls]),
    ]).then(([ingress]) => {
      if (ingress.status === "rejected") throw ingress.reason;
    });
    return this.disposal;
  }

  private dispatch(operation: () => Promise<unknown>): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("App-controls ingress is shutting down."));
    const result = Promise.withResolvers<unknown>();
    this.calls.add(result.promise);
    void result.promise.then(
      () => this.calls.delete(result.promise),
      () => this.calls.delete(result.promise),
    );
    void Promise.resolve()
      .then(() => {
        if (this.disposed) throw new Error("App-controls ingress is shutting down.");
        return operation();
      })
      .then(result.resolve, result.reject);
    return result.promise;
  }
}
