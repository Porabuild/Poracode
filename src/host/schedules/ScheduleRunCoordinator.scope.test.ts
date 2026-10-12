import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project, ScheduledTask } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { nativeBindingEnv } from "@/host/db/runtimeItems.testFixtures";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbGetThreads,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db/projectsThreads";
import { dbGetSchedule, dbUpsertSchedule } from "@/host/db/schedules";
import { dbAdmitScheduleExecution } from "@/host/db/scheduleExecutionAdmission";
import { readWorkspaceLaunchSelection } from "@/host/threads/workspaceLaunchScope";
import { ScheduleRunCoordinator, type ScheduleRunCoordinatorDeps } from "./ScheduleRunCoordinator";

const date = "2026-01-01T00:00:00.000Z";
const project: Project = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Work",
  location: { kind: "posix", path: "/old" },
  createdAt: date,
};
const task: ScheduledTask = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: project.id,
  name: "Task",
  prompt: "Prompt",
  agentKind: "fixture:profile",
  config: { model: "opaque", effort: "", fast: false, thinking: false, contextSize: "default" },
  recurrence: { kind: "hourly", minute: 0 },
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
  createdAt: date,
  updatedAt: date,
};
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  dbUpsertProject(project, 0);
  dbUpsertSchedule(task);
});
afterEach(() => {
  closeDatabase();
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});

it.each(["relocated", "deleted"] as const)(
  "refuses a %s project after permission lookup before thread/run/launch effects",
  async (change) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const startThread = vi.fn<ScheduleRunCoordinatorDeps["startThread"]>(async (payload) => {
      // If this regression returns, exercise the actual guard that allowed the
      // fresh unscoped row. No real provider is launched by this fixture.
      readWorkspaceLaunchSelection(payload);
      throw new Error("Unexpected native launch");
    });
    const insertRun = vi.fn<ScheduleRunCoordinatorDeps["insertRun"]>();
    const publish = vi.fn<NonNullable<ScheduleRunCoordinatorDeps["publishThreadsChanged"]>>();
    const mirror = vi.fn<ScheduleRunCoordinatorDeps["sendThreadCommand"]>(() => false);
    const coordinator = new ScheduleRunCoordinator({
      startThread,
      admitScheduleExecution: dbAdmitScheduleExecution,
      getProject: dbGetProject,
      ensureHomeProject: () => project,
      getAgentStatuses: async () => {
        entered.resolve();
        await release.promise;
        return { windows: [], wsl: [], fromCache: false };
      },
      getSharedSettings: () => defaultSharedSettings,
      upsertThread: dbUpsertThread,
      deleteThread: dbDeleteThread,
      threadExists: (id) => dbGetThread(id) !== null,
      sendThreadCommand: mirror,
      publishThreadsChanged: publish,
      insertRun,
      updateRun: () => {},
    });
    try {
      const completion = coordinator.runScheduleAsThread(dbGetSchedule(task.id)!);
      const refused = completion.catch((error: unknown) => error);
      await entered.promise;
      if (change === "relocated")
        dbUpdateProject({ ...project, location: { kind: "posix", path: "/new" } });
      else dbDeleteProject(project.id);
      release.resolve();
      await expect(refused).resolves.toEqual(
        expect.objectContaining({ message: expect.stringContaining("changed or was removed") }),
      );
      expect(dbGetThreads()).toEqual([]);
      expect(insertRun).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(mirror).not.toHaveBeenCalled();
      expect(startThread).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await coordinator.dispose();
    }
  },
);
