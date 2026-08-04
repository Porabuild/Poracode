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
  emitRemoteThreadCommand(command: RemoteThreadCommand): boolean;
  updateThreadRow(threadId: string, mutate: (thread: Thread) => Thread): void;
  openThreadInUi(threadId: string): boolean;
  notifyUser(input: { title: string; body: string; threadId: string }): AppControlsNotifyResult;
  checkForUpdate(): Promise<AppControlsUpdateCheck>;
}

export class AppControlsMcpIngress {
  private readonly ingress: StreamableHttpMcpIngress<AppControlsToolContext>;
  /** Persistent live-status cache + wait surface, fed by {@link observeSupervisorEvent}. */
  private readonly threadStates = new ThreadStateBroker();

  constructor(deps: AppControlsMcpIngressDeps) {
    this.ingress = new StreamableHttpMcpIngress<AppControlsToolContext>({
      serverInfo: { ...APP_CONTROLS_MCP_SERVER_INFO },
      instructions: APP_CONTROLS_MCP_INSTRUCTIONS,
      tools: TOOLS,
      isKnownToolName,
      buildContext: (identity) => ({ ...deps, identity, threadStates: this.threadStates }),
      dispatchTool,
      formatToolResult,
    });
  }

  /** Wire into the supervisor event tap (main.ts / headless host `onEvent`). */
  observeSupervisorEvent(event: SupervisorEvent): void {
    this.threadStates.observe(event);
  }

  start(): Promise<AppControlsMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): AppControlsMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): void {
    this.ingress.dispose();
  }
}
