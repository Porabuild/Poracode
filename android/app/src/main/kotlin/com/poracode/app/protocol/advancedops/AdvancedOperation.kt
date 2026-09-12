package com.poracode.app.protocol.advancedops

enum class AdvancedOwnerKind(val wireName: String) {
    Thread("thread"),
    ProjectLocation("projectLocation"),
    Location("location"),
}

enum class AdvancedResultKind(val wireName: String) { Json("json"), Omitted("omitted") }

enum class AdvancedCallKind { Read, Mutation }

private const val STANDARD_TIMEOUT_MS = 60_000L
private const val GENERATION_TIMEOUT_MS = 5 * 60_000L

/** Stable names and policy for the final generic remote-v3 Android procedures. */
enum class AdvancedOperation(
    val wireName: String,
    val scope: String,
    val owner: AdvancedOwnerKind,
    val resultKind: AdvancedResultKind,
    val callKind: AdvancedCallKind,
    val timeoutMs: Long = STANDARD_TIMEOUT_MS,
) {
    CreateFileCheckpoint(
        "createFileCheckpoint",
        "session:operate",
        AdvancedOwnerKind.Thread,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
    ),
    FinalizeFileCheckpoint(
        "finalizeFileCheckpoint",
        "session:operate",
        AdvancedOwnerKind.Thread,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
    ),
    SubagentSubscribe(
        "subagentSubscribe",
        "session:read",
        AdvancedOwnerKind.Thread,
        AdvancedResultKind.Json,
        AdvancedCallKind.Read,
    ),
    SubagentUnsubscribe(
        "subagentUnsubscribe",
        "session:read",
        AdvancedOwnerKind.Thread,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    StageThreadInput(
        "stageThreadInput",
        "session:operate",
        AdvancedOwnerKind.Thread,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    WorkflowGetRun(
        "workflowGetRun",
        "session:read",
        AdvancedOwnerKind.Location,
        AdvancedResultKind.Json,
        AdvancedCallKind.Read,
    ),
    WorkflowAgentChat(
        "workflowAgentChat",
        "session:read",
        AdvancedOwnerKind.Location,
        AdvancedResultKind.Json,
        AdvancedCallKind.Read,
    ),
    ReadAbsoluteFile(
        "readAbsoluteFile",
        "projects:manage",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Read,
    ),
    ReadExternalFile(
        "readExternalFile",
        "projects:manage",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Read,
    ),
    WriteExternalFile(
        "writeExternalFile",
        "projects:manage",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
    ),
    CreateProjectEntry(
        "createProjectEntry",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    RenameProjectEntry(
        "renameProjectEntry",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    MoveProjectEntry(
        "moveProjectEntry",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    DeleteProjectEntry(
        "deleteProjectEntry",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Omitted,
        AdvancedCallKind.Mutation,
    ),
    GenerateCommitMessage(
        "generateCommitMessage",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
        GENERATION_TIMEOUT_MS,
    ),
    GenerateTitle(
        "generateTitle",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
        GENERATION_TIMEOUT_MS,
    ),
    GeneratePrSummary(
        "generatePrSummary",
        "session:operate",
        AdvancedOwnerKind.ProjectLocation,
        AdvancedResultKind.Json,
        AdvancedCallKind.Mutation,
        GENERATION_TIMEOUT_MS,
    ),
    ;

    companion object {
        const val DEFAULT_TIMEOUT_MS = 60_000L
        const val LONG_TIMEOUT_MS = 5 * 60_000L
    }
}
