package com.poracode.app.ui.advancedops

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R

@Composable
internal fun fieldLabel(field: AdvancedField): String = stringResource(field.labelResource())

@StringRes
internal fun AdvancedField.labelResource(): Int = when (this) {
    AdvancedField.CheckpointItemId -> R.string.advanced_ops_checkpoint_item_id
    AdvancedField.BaseCheckpointItemId -> R.string.advanced_ops_base_checkpoint_item_id
    AdvancedField.ParentItemId -> R.string.advanced_ops_parent_item_id
    AdvancedField.Prompt -> R.string.advanced_ops_prompt
    AdvancedField.SegmentsJson -> R.string.advanced_ops_segments_json
    AdvancedField.ManifestPath -> R.string.advanced_ops_manifest_path
    AdvancedField.TranscriptDirectory -> R.string.advanced_ops_transcript_directory
    AdvancedField.IncludeAgentChats -> R.string.advanced_ops_include_agent_chats
    AdvancedField.ThreadId -> R.string.advanced_ops_thread_id
    AdvancedField.AgentId -> R.string.advanced_ops_agent_id
    AdvancedField.AgentFinished -> R.string.advanced_ops_agent_finished
    AdvancedField.AbsolutePath -> R.string.advanced_ops_absolute_path
    AdvancedField.Content -> R.string.advanced_ops_content
    AdvancedField.BaseModifiedAt -> R.string.advanced_ops_base_modified_at
    AdvancedField.Path -> R.string.advanced_ops_path
    AdvancedField.Directory -> R.string.advanced_ops_directory
    AdvancedField.NextName -> R.string.advanced_ops_next_name
    AdvancedField.NextParentPath -> R.string.advanced_ops_next_parent_path
    AdvancedField.AgentKind -> R.string.advanced_ops_agent_kind
    AdvancedField.Model -> R.string.advanced_ops_model
    AdvancedField.Effort -> R.string.advanced_ops_effort
    AdvancedField.Fast -> R.string.advanced_ops_fast
    AdvancedField.Language -> R.string.advanced_ops_language
    AdvancedField.Branch -> R.string.advanced_ops_branch
    AdvancedField.BaseBranch -> R.string.advanced_ops_base_branch
}

@Composable
internal fun failureLabel(failure: AdvancedSafeFailure): String = stringResource(
    when (failure) {
        AdvancedSafeFailure.NoOwner -> R.string.advanced_ops_failure_no_owner
        AdvancedSafeFailure.Background -> R.string.advanced_ops_failure_background
        AdvancedSafeFailure.Offline -> R.string.advanced_ops_failure_offline
        AdvancedSafeFailure.NotReady -> R.string.advanced_ops_failure_not_ready
        AdvancedSafeFailure.MissingScope -> R.string.advanced_ops_failure_scope
        AdvancedSafeFailure.Authentication -> R.string.advanced_ops_failure_authentication
        AdvancedSafeFailure.Stale -> R.string.advanced_ops_failure_stale
        AdvancedSafeFailure.InvalidInput -> R.string.advanced_ops_failure_invalid_input
        AdvancedSafeFailure.Remote -> R.string.advanced_ops_failure_remote
        AdvancedSafeFailure.Unavailable -> R.string.advanced_ops_failure_unavailable
    },
)
