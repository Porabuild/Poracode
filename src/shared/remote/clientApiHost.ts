import { z } from "zod";
import {
  remoteHostDescribeSchema,
  UNKNOWN_HOST_SERVICE_CAPABILITIES,
  type HostServiceCapabilities,
} from "@/shared/hostControlProtocol";
import {
  remoteAgentSlashCommandsSchema,
  remoteAgentStatusesSchema,
  remoteBrowserStateSchema,
  remoteHostUpdateStateSchema,
  remoteSettingsSchema,
  remoteSchedulesResponseSchema,
  remoteScheduleRunsResponseSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
  type RemoteAgentSlashCommands,
  type RemoteAgentStatuses,
  type RemoteBrowserCommand,
  type RemoteBrowserState,
  type RemoteHostUpdateState,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteScheduleCommand,
  type RemoteShellSnapshot,
  type RemoteThreadListPage,
} from "@/shared/remote";
import {
  profileCoreStatsSchema,
  profileDevicesResponseSchema,
  profileIdentityResponseSchema,
  profileTokenStatsSchema,
  providerUsageResponseSchema,
  prWatchSchema,
  projectNotesSchema,
  type ProfileCoreStats,
  type ProfileDevicesResponse,
  type ProfileIdentity,
  type ProfileIdentityResponse,
  type ProfileStatsRequest,
  type ProfileTokenStats,
  type PrWatch,
  type PrWatchAgentSync,
  type PrWatchInput,
  type PrWatchKey,
  type ProjectNotes,
  type ProviderUsageResponse,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRun,
} from "@/shared/contracts";
import { RemoteClientAuth } from "./clientAuth";
import { RemoteClientError } from "./clientErrors";
import { parseExactOptionalResponse, parseResponse } from "./clientParse";

const settingsResponseSchema = z.object({ settings: remoteSettingsSchema });
const browserStateResponseSchema = z.object({ state: remoteBrowserStateSchema });
const attachmentUploadResponseSchema = z.object({ path: z.string().min(1) });
const projectNotesResponseSchema = z.object({ notes: projectNotesSchema.nullable() });
const prWatchResponseSchema = z.object({ watch: prWatchSchema.nullable() });

export abstract class RemoteClientHostApi extends RemoteClientAuth {
  /**
   * Shell snapshot. Without options the historical full thread list is
   * fetched. With `threadListPageLimit` (Gate 4 hazard #3) the request bounds
   * the thread list and this method transparently pages the remainder from
   * the thread-list route until the host reports the end, resolving with the
   * complete assembled snapshot so callers keep a single unchanged contract.
   * A host that predates the pagination ignores the query parameter and
   * returns no `threadsNextCursor`, which ends the loop after one response.
   */
  async snapshot(options: { threadListPageLimit?: number } = {}): Promise<RemoteShellSnapshot> {
    const limit = options.threadListPageLimit;
    let snapshot = parseResponse(
      remoteShellSnapshotSchema,
      await this.requestJson(
        limit === undefined ? "/api/snapshot" : `/api/snapshot?threadLimit=${limit}`,
      ),
      "snapshot",
    );
    let cursor: string | null = snapshot.threadsNextCursor ?? null;
    if (cursor === null) return snapshot;
    const threads = [...snapshot.threads];
    const runtimeSummariesByThread = { ...snapshot.runtimeSummariesByThread };
    let gitSummariesByThread = snapshot.gitSummariesByThread;
    // The host advances the cursor strictly past returned rows, so a repeated
    // cursor can only mean a misbehaving peer; refuse it instead of looping.
    const seenCursors = new Set<string>();
    while (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new RemoteClientError(
          "The server repeated a thread-list cursor; the thread list may be incomplete.",
          502,
          "thread_list_cursor_loop",
        );
      }
      seenCursors.add(cursor);
      const nextCursor: string = cursor;
      const page: RemoteThreadListPage = parseResponse(
        remoteThreadListPageSchema,
        await this.requestJson(
          `/api/threads?limit=${limit}&cursor=${encodeURIComponent(nextCursor)}`,
        ),
        "thread list page",
      );
      threads.push(...page.threads);
      Object.assign(runtimeSummariesByThread, page.runtimeSummariesByThread);
      if (page.gitSummariesByThread) {
        gitSummariesByThread = { ...(gitSummariesByThread ?? {}), ...page.gitSummariesByThread };
      }
      cursor = page.nextCursor ?? null;
    }
    return {
      ...snapshot,
      threads,
      runtimeSummariesByThread,
      ...(gitSummariesByThread !== undefined ? { gitSummariesByThread } : {}),
      threadsNextCursor: null,
    };
  }

  async agentStatuses(options: { omitSlashCommands?: boolean } = {}): Promise<RemoteAgentStatuses> {
    // WS3-A payload split: slash-command catalogs dominate this response, so
    // clients that fetch them lazily pass omitSlashCommands to skip them.
    const path = options.omitSlashCommands
      ? "/api/agent-statuses?slashCommands=0"
      : "/api/agent-statuses";
    return parseResponse(remoteAgentStatusesSchema, await this.requestJson(path), "agent statuses");
  }

  /** One agent's slash-command catalog (WS3-A lazy fetch partner). */
  async agentSlashCommands(kind: string): Promise<RemoteAgentSlashCommands> {
    return parseResponse(
      remoteAgentSlashCommandsSchema,
      await this.requestJson(`/api/agents/${encodeURIComponent(kind)}/slash-commands`),
      "agent slash commands",
    );
  }

  async hostUpdateState(): Promise<RemoteHostUpdateState> {
    return parseResponse(
      remoteHostUpdateStateSchema,
      await this.requestJson("/api/host-update"),
      "host update",
    );
  }

  async checkHostUpdate(): Promise<RemoteHostUpdateState> {
    return parseResponse(
      remoteHostUpdateStateSchema,
      await this.requestJson("/api/host-update/check", { method: "POST", body: {} }),
      "host update",
    );
  }

  async installHostUpdate(): Promise<void> {
    await this.requestJson("/api/host-update/install", { method: "POST", body: {} });
  }

  /**
   * V6 C.2: host-declared service capabilities. A host without the route
   * (protocol 12 old-reader) fails closed to the unknown set.
   */
  async describeHost(): Promise<HostServiceCapabilities> {
    try {
      return parseResponse(
        remoteHostDescribeSchema,
        await this.requestJson("/api/host/describe"),
        "host describe",
      ).capabilities;
    } catch (error) {
      if (error instanceof RemoteClientError && error.status === 404) {
        return UNKNOWN_HOST_SERVICE_CAPABILITIES;
      }
      throw error;
    }
  }

  /** Provider usage snapshots validated against the collector-owned wire schema. */
  async providerUsage(): Promise<ProviderUsageResponse> {
    return parseResponse(
      providerUsageResponseSchema,
      await this.requestJson("/api/provider-usage"),
      "provider usage",
    );
  }

  async projectNotes(projectId: string): Promise<ProjectNotes | null> {
    const result = parseResponse(
      projectNotesResponseSchema,
      await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/notes`),
      "project notes",
    );
    return result.notes;
  }

  async setProjectNotes(notes: ProjectNotes): Promise<void> {
    const { projectId, ...body } = notes;
    await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
      method: "POST",
      body,
    });
  }

  /** Remote-editable desktop settings (the AI helpers). */
  async settings(): Promise<RemoteSettings> {
    const result = parseResponse(
      settingsResponseSchema,
      await this.requestJson("/api/settings"),
      "settings",
    );
    return result.settings;
  }

  async updateSettings(patch: RemoteSettingsPatch): Promise<RemoteSettings> {
    const result = parseResponse(
      settingsResponseSchema,
      await this.requestJson("/api/settings", { method: "POST", body: patch }),
      "settings",
    );
    return result.settings;
  }

  async uploadAttachment(input: {
    readonly threadId: string;
    readonly fileName: string;
    readonly data: Uint8Array;
  }): Promise<string> {
    const url = new URL("/api/files/attachment", "http://poracode.invalid");
    url.searchParams.set("threadId", input.threadId);
    url.searchParams.set("name", input.fileName);
    const result = parseResponse(
      attachmentUploadResponseSchema,
      await this.requestJson(`${url.pathname}${url.search}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        rawBody: input.data,
      }),
      "attachment upload",
    );
    return result.path;
  }

  async schedules(): Promise<ScheduledTask[]> {
    const result = parseResponse(
      remoteSchedulesResponseSchema,
      await this.requestJson("/api/schedules"),
      "schedules",
    );
    return result.schedules;
  }

  private async scheduleCommand(
    command: RemoteScheduleCommand,
  ): Promise<ScheduledTask | undefined> {
    const result = parseResponse(
      remoteSchedulesResponseSchema,
      await this.requestJson("/api/schedules/command", { method: "POST", body: command }),
      "schedule command",
    );
    return result.schedule;
  }

  async createSchedule(task: ScheduledTaskInput): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "create", task });
    if (!schedule) throw new Error("The desktop did not return the created schedule.");
    return schedule;
  }

  async updateSchedule(id: string, task: ScheduledTaskInput): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "update", id, task });
    if (!schedule) throw new Error("The desktop did not return the updated schedule.");
    return schedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleCommand({ kind: "delete", id });
  }

  async runScheduleNow(id: string): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "run", id });
    if (!schedule) throw new Error("The desktop did not return the running schedule.");
    return schedule;
  }

  async scheduleRuns(id: string): Promise<ScheduledTaskRun[]> {
    const query = new URLSearchParams({ id });
    const result = parseResponse(
      remoteScheduleRunsResponseSchema,
      await this.requestJson(`/api/schedules/runs?${query.toString()}`),
      "schedule runs",
    );
    return result.runs;
  }

  async getPrWatch(input: PrWatchKey): Promise<PrWatch | null> {
    const query = new URLSearchParams({
      projectId: input.projectId,
      prNumber: String(input.prNumber),
    });
    const result = parseResponse(
      prWatchResponseSchema,
      await this.requestJson(`/api/pr-watches?${query.toString()}`),
      "PR automation",
    );
    return result.watch;
  }

  async checkPrWatch(input: PrWatchKey): Promise<void> {
    await this.requestJson("/api/pr-watches/check", { method: "POST", body: input });
  }

  async upsertPrWatch(input: PrWatchInput): Promise<PrWatch> {
    const result = parseResponse(
      prWatchResponseSchema,
      await this.requestJson("/api/pr-watches", { method: "POST", body: input }),
      "PR automation",
    );
    if (!result.watch) throw new Error("The desktop did not return the PR automation state.");
    return result.watch;
  }

  async deletePrWatch(input: PrWatchKey): Promise<void> {
    await this.requestJson("/api/pr-watches", { method: "DELETE", body: input });
  }

  async syncPrWatchAgent(input: PrWatchAgentSync): Promise<void> {
    await this.requestJson("/api/pr-watches/agent", { method: "POST", body: input });
  }

  /**
   * Profile: local usage stats + identity, computed on the paired desktop's
   * SQLite store. Response shapes are typed contracts with no runtime schema
   * (like {@link providerUsage}), so only a light shape check. The stats
   * blobs carry many more keys than the check names, so they must stay
   * looseObject — a plain z.object would strip everything unnamed.
   */
  async profileDevices(): Promise<ProfileDevicesResponse> {
    return parseExactOptionalResponse<ProfileDevicesResponse>(
      profileDevicesResponseSchema,
      await this.requestJson("/api/profile/devices"),
      "profile devices",
    );
  }

  async profileCoreStats(req: ProfileStatsRequest): Promise<ProfileCoreStats> {
    return parseExactOptionalResponse<ProfileCoreStats>(
      profileCoreStatsSchema,
      await this.requestJson("/api/profile/core-stats", { method: "POST", body: req }),
      "profile stats",
    );
  }

  async profileTokenStats(req: ProfileStatsRequest): Promise<ProfileTokenStats> {
    return parseExactOptionalResponse<ProfileTokenStats>(
      profileTokenStatsSchema,
      await this.requestJson("/api/profile/token-stats", { method: "POST", body: req }),
      "profile token stats",
    );
  }

  async setProfileIdentity(identity: ProfileIdentity): Promise<ProfileIdentityResponse> {
    return parseExactOptionalResponse<ProfileIdentityResponse>(
      profileIdentityResponseSchema,
      await this.requestJson("/api/profile/identity", { method: "POST", body: identity }),
      "profile identity",
    );
  }

  async browserState(): Promise<RemoteBrowserState> {
    const result = parseResponse(
      browserStateResponseSchema,
      await this.requestJson("/api/browser/state"),
      "browser state",
    );
    return result.state;
  }

  /** Tab mutation (create/close/activate/navigate/…); returns the new state. */
  async browserCommand(command: RemoteBrowserCommand): Promise<RemoteBrowserState> {
    const result = parseResponse(
      browserStateResponseSchema,
      await this.requestJson("/api/browser/command", { method: "POST", body: command }),
      "browser state",
    );
    return result.state;
  }
}
