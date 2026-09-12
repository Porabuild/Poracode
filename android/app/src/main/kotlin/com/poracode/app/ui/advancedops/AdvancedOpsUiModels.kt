package com.poracode.app.ui.advancedops

import com.poracode.app.protocol.advancedops.AbsoluteFileResult
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.ExternalFileResult
import com.poracode.app.protocol.advancedops.FileCheckpoint
import com.poracode.app.protocol.advancedops.WorkflowAgentChatResult
import com.poracode.app.protocol.advancedops.WorkflowRunResult
import com.poracode.app.session.advancedops.AdvancedMutationOutcome
import com.poracode.app.session.advancedops.GenerationOptions
import com.poracode.app.session.advancedops.ProjectEntryType
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

enum class AdvancedAction(val operation: AdvancedOperation, val fields: List<AdvancedField>) {
    CreateCheckpoint(AdvancedOperation.CreateFileCheckpoint, listOf(AdvancedField.CheckpointItemId)),
    FinalizeCheckpoint(
        AdvancedOperation.FinalizeFileCheckpoint,
        listOf(AdvancedField.CheckpointItemId, AdvancedField.BaseCheckpointItemId),
    ),
    SubscribeSubagent(AdvancedOperation.SubagentSubscribe, listOf(AdvancedField.ParentItemId)),
    UnsubscribeSubagent(AdvancedOperation.SubagentUnsubscribe, listOf(AdvancedField.ParentItemId)),
    StageThreadInput(
        AdvancedOperation.StageThreadInput,
        listOf(AdvancedField.Prompt, AdvancedField.SegmentsJson),
    ),
    WorkflowRun(
        AdvancedOperation.WorkflowGetRun,
        listOf(
            AdvancedField.ManifestPath,
            AdvancedField.TranscriptDirectory,
            AdvancedField.IncludeAgentChats,
        ),
    ),
    WorkflowAgentChat(
        AdvancedOperation.WorkflowAgentChat,
        listOf(
            AdvancedField.ThreadId,
            AdvancedField.TranscriptDirectory,
            AdvancedField.AgentId,
            AdvancedField.AgentFinished,
        ),
    ),
    ReadAbsoluteFile(AdvancedOperation.ReadAbsoluteFile, listOf(AdvancedField.AbsolutePath)),
    ReadExternalFile(AdvancedOperation.ReadExternalFile, listOf(AdvancedField.AbsolutePath)),
    WriteExternalFile(
        AdvancedOperation.WriteExternalFile,
        listOf(AdvancedField.AbsolutePath, AdvancedField.Content, AdvancedField.BaseModifiedAt),
    ),
    CreateProjectEntry(
        AdvancedOperation.CreateProjectEntry,
        listOf(AdvancedField.Path, AdvancedField.Directory),
    ),
    RenameProjectEntry(
        AdvancedOperation.RenameProjectEntry,
        listOf(AdvancedField.Path, AdvancedField.NextName),
    ),
    MoveProjectEntry(
        AdvancedOperation.MoveProjectEntry,
        listOf(AdvancedField.Path, AdvancedField.NextParentPath),
    ),
    DeleteProjectEntry(AdvancedOperation.DeleteProjectEntry, listOf(AdvancedField.Path)),
    GenerateCommitMessage(AdvancedOperation.GenerateCommitMessage, AdvancedField.generation),
    GenerateTitle(
        AdvancedOperation.GenerateTitle,
        listOf(AdvancedField.Prompt) + AdvancedField.generation,
    ),
    GeneratePrSummary(
        AdvancedOperation.GeneratePrSummary,
        listOf(AdvancedField.Branch, AdvancedField.BaseBranch) + AdvancedField.generation,
    ),
}

enum class AdvancedField(val kind: Kind, val optional: Boolean = false) {
    CheckpointItemId(Kind.Text),
    BaseCheckpointItemId(Kind.Text),
    ParentItemId(Kind.Text),
    Prompt(Kind.LongText),
    SegmentsJson(Kind.LongText, optional = true),
    ManifestPath(Kind.Text),
    TranscriptDirectory(Kind.Text, optional = true),
    IncludeAgentChats(Kind.Boolean),
    ThreadId(Kind.Text),
    AgentId(Kind.Text),
    AgentFinished(Kind.Boolean),
    AbsolutePath(Kind.Text),
    Content(Kind.LongText),
    BaseModifiedAt(Kind.Decimal),
    Path(Kind.Text),
    Directory(Kind.Boolean),
    NextName(Kind.Text),
    NextParentPath(Kind.Text, optional = true),
    AgentKind(Kind.Text),
    Model(Kind.Text, optional = true),
    Effort(Kind.Text, optional = true),
    Fast(Kind.Boolean),
    Language(Kind.Text, optional = true),
    Branch(Kind.Text),
    BaseBranch(Kind.Text),
    ;

    enum class Kind { Text, LongText, Decimal, Boolean }

    companion object {
        val generation = listOf(AgentKind, Model, Effort, Fast, Language)
    }
}

sealed interface AdvancedInput {
    val action: AdvancedAction

    data class CreateCheckpoint(val checkpointItemId: String) : AdvancedInput {
        override val action = AdvancedAction.CreateCheckpoint
    }
    data class FinalizeCheckpoint(
        val checkpointItemId: String,
        val baseCheckpointItemId: String,
    ) : AdvancedInput { override val action = AdvancedAction.FinalizeCheckpoint }
    data class Subscribe(val parentItemId: String) : AdvancedInput {
        override val action = AdvancedAction.SubscribeSubagent
    }
    data class Unsubscribe(val parentItemId: String) : AdvancedInput {
        override val action = AdvancedAction.UnsubscribeSubagent
    }
    data class StageInput(val prompt: String, val segments: JsonArray?) : AdvancedInput {
        override val action = AdvancedAction.StageThreadInput
    }
    data class WorkflowRun(
        val manifestPath: String,
        val transcriptDirectory: String?,
        val includeAgentChats: Boolean,
    ) : AdvancedInput { override val action = AdvancedAction.WorkflowRun }
    data class WorkflowChat(
        val threadId: String,
        val transcriptDirectory: String,
        val agentId: String,
        val agentFinished: Boolean,
    ) : AdvancedInput { override val action = AdvancedAction.WorkflowAgentChat }
    data class ReadAbsolute(val absolutePath: String) : AdvancedInput {
        override val action = AdvancedAction.ReadAbsoluteFile
    }
    data class ReadExternal(val absolutePath: String) : AdvancedInput {
        override val action = AdvancedAction.ReadExternalFile
    }
    data class WriteExternal(
        val absolutePath: String,
        val content: String,
        val baseModifiedAtMs: Double,
    ) : AdvancedInput { override val action = AdvancedAction.WriteExternalFile }
    data class CreateEntry(val path: String, val type: ProjectEntryType) : AdvancedInput {
        override val action = AdvancedAction.CreateProjectEntry
    }
    data class RenameEntry(val path: String, val nextName: String) : AdvancedInput {
        override val action = AdvancedAction.RenameProjectEntry
    }
    data class MoveEntry(val path: String, val nextParentPath: String) : AdvancedInput {
        override val action = AdvancedAction.MoveProjectEntry
    }
    data class DeleteEntry(val path: String) : AdvancedInput {
        override val action = AdvancedAction.DeleteProjectEntry
    }
    data class GenerateCommit(val options: GenerationOptions) : AdvancedInput {
        override val action = AdvancedAction.GenerateCommitMessage
    }
    data class GenerateTitle(val prompt: String, val options: GenerationOptions) : AdvancedInput {
        override val action = AdvancedAction.GenerateTitle
    }
    data class GeneratePr(
        val branch: String,
        val baseBranch: String,
        val options: GenerationOptions,
    ) : AdvancedInput { override val action = AdvancedAction.GeneratePrSummary }
}

sealed interface AdvancedOutput {
    data class Checkpoint(val value: FileCheckpoint) : AdvancedOutput
    data class Events(val values: List<JsonElement>) : AdvancedOutput
    data class WorkflowRun(val value: WorkflowRunResult) : AdvancedOutput
    data class WorkflowChat(val value: WorkflowAgentChatResult) : AdvancedOutput
    data class AbsoluteFile(val value: AbsoluteFileResult) : AdvancedOutput
    data class ExternalFile(val value: ExternalFileResult) : AdvancedOutput
    data class Mutation(val outcome: AdvancedMutationOutcome) : AdvancedOutput
    data class GeneratedText(val title: String?, val body: String) : AdvancedOutput
}

enum class AdvancedSafeFailure {
    NoOwner,
    Background,
    Offline,
    NotReady,
    MissingScope,
    Authentication,
    Stale,
    InvalidInput,
    Remote,
    Unavailable,
}

data class AdvancedConfirmationUi(
    val action: AdvancedAction,
    val path: String,
)

data class AdvancedOpsUiState(
    val busy: Boolean = false,
    val output: AdvancedOutput? = null,
    val failure: AdvancedSafeFailure? = null,
    val confirmation: AdvancedConfirmationUi? = null,
)
