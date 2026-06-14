import { z } from "zod";
import { projectSchema, threadSchema } from "../../contracts";
import type { Project, ProjectNotes, Thread, ThreadContextUsage } from "../../contracts";
import { defineIpcProcedure, defineNoArgProcedure, definePayloadProcedure } from "../core";
import {
  dbDeleteProjectPayloadSchema,
  dbDeleteThreadPayloadSchema,
  dbGetCompletedTurnsPayloadSchema,
  dbGetProjectNotesPayloadSchema,
  dbGetRuntimeItemsPayloadSchema,
  dbGetThreadContextUsagePayloadSchema,
  dbReplaceCompletedTurnsPayloadSchema,
  dbReplaceRuntimeItemsPayloadSchema,
  dbReplaceRuntimeSnapshotPayloadSchema,
  dbSetProjectNotesPayloadSchema,
  dbStateKeySchema,
  dbStatePayloadSchema,
  dbSyncAllPayloadSchema,
  type PersistedCompletedTurn,
  type PersistedRuntimeItem,
} from "../schemas";

export const dbProcedures = {
  dbGetProjects: defineNoArgProcedure<Project[], "main-local">("dbGetProjects", "main-local"),
  dbGetThreads: defineNoArgProcedure<Thread[], "main-local">("dbGetThreads", "main-local"),
  dbGetState: defineIpcProcedure<[string], string, string | null, "main-local">(
    "dbGetState",
    "main-local",
    dbStateKeySchema,
    (key) => dbStateKeySchema.parse(key),
  ),
  dbSetState: defineIpcProcedure<
    [string, string],
    z.infer<typeof dbStatePayloadSchema>,
    void,
    "main-local"
  >("dbSetState", "main-local", dbStatePayloadSchema, (key, value) =>
    dbStatePayloadSchema.parse({ key, value }),
  ),
  dbUpsertProject: definePayloadProcedure<Project, void, "main-local">(
    "dbUpsertProject",
    "main-local",
    projectSchema,
  ),
  dbUpsertThread: definePayloadProcedure<Thread, void, "main-local">(
    "dbUpsertThread",
    "main-local",
    threadSchema,
  ),
  dbDeleteThread: defineIpcProcedure<
    [string],
    z.infer<typeof dbDeleteThreadPayloadSchema>,
    void,
    "main-local"
  >("dbDeleteThread", "main-local", dbDeleteThreadPayloadSchema, (threadId) =>
    dbDeleteThreadPayloadSchema.parse({ threadId }),
  ),
  dbDeleteProject: defineIpcProcedure<
    [string],
    z.infer<typeof dbDeleteProjectPayloadSchema>,
    void,
    "main-local"
  >("dbDeleteProject", "main-local", dbDeleteProjectPayloadSchema, (projectId) =>
    dbDeleteProjectPayloadSchema.parse({ projectId }),
  ),
  dbSyncAll: defineIpcProcedure<
    [Project[], Thread[], string],
    z.infer<typeof dbSyncAllPayloadSchema>,
    void,
    "main-local"
  >("dbSyncAll", "main-local", dbSyncAllPayloadSchema, (projects, threads, viewJson) =>
    dbSyncAllPayloadSchema.parse({ projects, threads, viewJson }),
  ),
  dbGetThreadRuntimeItems: defineIpcProcedure<
    [string],
    z.infer<typeof dbGetRuntimeItemsPayloadSchema>,
    PersistedRuntimeItem[],
    "main-local"
  >("dbGetThreadRuntimeItems", "main-local", dbGetRuntimeItemsPayloadSchema, (threadId) =>
    dbGetRuntimeItemsPayloadSchema.parse({ threadId }),
  ),
  dbReplaceThreadRuntimeItems: definePayloadProcedure<
    z.infer<typeof dbReplaceRuntimeItemsPayloadSchema>,
    void,
    "main-local"
  >("dbReplaceThreadRuntimeItems", "main-local", dbReplaceRuntimeItemsPayloadSchema),
  dbGetThreadCompletedTurns: defineIpcProcedure<
    [string],
    z.infer<typeof dbGetCompletedTurnsPayloadSchema>,
    PersistedCompletedTurn[],
    "main-local"
  >("dbGetThreadCompletedTurns", "main-local", dbGetCompletedTurnsPayloadSchema, (threadId) =>
    dbGetCompletedTurnsPayloadSchema.parse({ threadId }),
  ),
  dbReplaceThreadCompletedTurns: definePayloadProcedure<
    z.infer<typeof dbReplaceCompletedTurnsPayloadSchema>,
    void,
    "main-local"
  >("dbReplaceThreadCompletedTurns", "main-local", dbReplaceCompletedTurnsPayloadSchema),
  dbReplaceThreadRuntimeSnapshot: definePayloadProcedure<
    z.infer<typeof dbReplaceRuntimeSnapshotPayloadSchema>,
    void,
    "main-local"
  >("dbReplaceThreadRuntimeSnapshot", "main-local", dbReplaceRuntimeSnapshotPayloadSchema),
  dbGetThreadContextUsage: defineIpcProcedure<
    [string],
    z.infer<typeof dbGetThreadContextUsagePayloadSchema>,
    ThreadContextUsage | null,
    "main-local"
  >("dbGetThreadContextUsage", "main-local", dbGetThreadContextUsagePayloadSchema, (threadId) =>
    dbGetThreadContextUsagePayloadSchema.parse({ threadId }),
  ),
  dbGetProjectNotes: defineIpcProcedure<
    [string],
    z.infer<typeof dbGetProjectNotesPayloadSchema>,
    ProjectNotes | null,
    "main-local"
  >("dbGetProjectNotes", "main-local", dbGetProjectNotesPayloadSchema, (projectId) =>
    dbGetProjectNotesPayloadSchema.parse({ projectId }),
  ),
  dbSetProjectNotes: definePayloadProcedure<ProjectNotes, void, "main-local">(
    "dbSetProjectNotes",
    "main-local",
    dbSetProjectNotesPayloadSchema,
  ),
} as const;
