package com.poracode.app.ui.advancedops

import com.poracode.app.session.advancedops.GenerationOptions
import com.poracode.app.session.advancedops.ProjectEntryType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray

data class AdvancedDraft(
    val text: Map<AdvancedField, String> = emptyMap(),
    val flags: Set<AdvancedField> = emptySet(),
) {
    fun text(field: AdvancedField): String = text[field].orEmpty()
    fun flag(field: AdvancedField): Boolean = field in flags
}

sealed interface AdvancedParseResult {
    data class Valid(val input: AdvancedInput) : AdvancedParseResult
    data object MissingRequired : AdvancedParseResult
    data object InvalidNumber : AdvancedParseResult
    data object InvalidJsonArray : AdvancedParseResult
}

fun AdvancedDraft.parse(action: AdvancedAction): AdvancedParseResult {
    fun required(field: AdvancedField): String? = text(field).takeIf { it.isNotBlank() }
    fun optional(field: AdvancedField): String? = text(field).takeIf { it.isNotBlank() }
    fun generation(): GenerationOptions? {
        val agent = required(AdvancedField.AgentKind) ?: return null
        return GenerationOptions(
            agentKind = agent,
            model = optional(AdvancedField.Model),
            effort = optional(AdvancedField.Effort),
            fast = flag(AdvancedField.Fast),
            language = optional(AdvancedField.Language),
        )
    }
    val input = when (action) {
        AdvancedAction.CreateCheckpoint -> AdvancedInput.CreateCheckpoint(
            required(AdvancedField.CheckpointItemId) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.FinalizeCheckpoint -> AdvancedInput.FinalizeCheckpoint(
            required(AdvancedField.CheckpointItemId) ?: return AdvancedParseResult.MissingRequired,
            required(AdvancedField.BaseCheckpointItemId)
                ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.SubscribeSubagent -> AdvancedInput.Subscribe(
            required(AdvancedField.ParentItemId) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.UnsubscribeSubagent -> AdvancedInput.Unsubscribe(
            required(AdvancedField.ParentItemId) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.StageThreadInput -> {
            val raw = optional(AdvancedField.SegmentsJson)
            val segments = if (raw == null) {
                null
            } else {
                runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
                    ?: return AdvancedParseResult.InvalidJsonArray
            }
            AdvancedInput.StageInput(
                required(AdvancedField.Prompt) ?: return AdvancedParseResult.MissingRequired,
                segments,
            )
        }
        AdvancedAction.WorkflowRun -> AdvancedInput.WorkflowRun(
            required(AdvancedField.ManifestPath) ?: return AdvancedParseResult.MissingRequired,
            optional(AdvancedField.TranscriptDirectory),
            flag(AdvancedField.IncludeAgentChats),
        )
        AdvancedAction.WorkflowAgentChat -> AdvancedInput.WorkflowChat(
            required(AdvancedField.ThreadId) ?: return AdvancedParseResult.MissingRequired,
            required(AdvancedField.TranscriptDirectory)
                ?: return AdvancedParseResult.MissingRequired,
            required(AdvancedField.AgentId) ?: return AdvancedParseResult.MissingRequired,
            flag(AdvancedField.AgentFinished),
        )
        AdvancedAction.ReadAbsoluteFile -> AdvancedInput.ReadAbsolute(
            required(AdvancedField.AbsolutePath) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.ReadExternalFile -> AdvancedInput.ReadExternal(
            required(AdvancedField.AbsolutePath) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.WriteExternalFile -> AdvancedInput.WriteExternal(
            required(AdvancedField.AbsolutePath) ?: return AdvancedParseResult.MissingRequired,
            text(AdvancedField.Content),
            required(AdvancedField.BaseModifiedAt)?.toDoubleOrNull()
                ?: return if (text(AdvancedField.BaseModifiedAt).isBlank()) {
                    AdvancedParseResult.MissingRequired
                } else {
                    AdvancedParseResult.InvalidNumber
                },
        )
        AdvancedAction.CreateProjectEntry -> AdvancedInput.CreateEntry(
            required(AdvancedField.Path) ?: return AdvancedParseResult.MissingRequired,
            if (flag(AdvancedField.Directory)) ProjectEntryType.Directory else ProjectEntryType.File,
        )
        AdvancedAction.RenameProjectEntry -> AdvancedInput.RenameEntry(
            required(AdvancedField.Path) ?: return AdvancedParseResult.MissingRequired,
            required(AdvancedField.NextName) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.MoveProjectEntry -> AdvancedInput.MoveEntry(
            required(AdvancedField.Path) ?: return AdvancedParseResult.MissingRequired,
            text(AdvancedField.NextParentPath),
        )
        AdvancedAction.DeleteProjectEntry -> AdvancedInput.DeleteEntry(
            required(AdvancedField.Path) ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.GenerateCommitMessage -> AdvancedInput.GenerateCommit(
            generation() ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.GenerateTitle -> AdvancedInput.GenerateTitle(
            required(AdvancedField.Prompt) ?: return AdvancedParseResult.MissingRequired,
            generation() ?: return AdvancedParseResult.MissingRequired,
        )
        AdvancedAction.GeneratePrSummary -> AdvancedInput.GeneratePr(
            required(AdvancedField.Branch) ?: return AdvancedParseResult.MissingRequired,
            required(AdvancedField.BaseBranch) ?: return AdvancedParseResult.MissingRequired,
            generation() ?: return AdvancedParseResult.MissingRequired,
        )
    }
    return AdvancedParseResult.Valid(input)
}
