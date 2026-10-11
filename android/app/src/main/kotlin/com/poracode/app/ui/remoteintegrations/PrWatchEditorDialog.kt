package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
internal fun PrWatchEditorDialog(
    initial: PrWatchEditorDraft,
    editing: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (PrWatchEditorDraft) -> Unit,
) {
    var draft by remember(initial) { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(
            if (editing) R.string.remote_integrations_edit_watch
            else R.string.remote_integrations_create_watch,
        )) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PrField(
                    draft.projectId,
                    { draft = draft.copy(projectId = it) },
                    R.string.remote_integrations_project_id,
                    !editing,
                )
                PrField(
                    draft.prNumber,
                    { draft = draft.copy(prNumber = it) },
                    R.string.remote_integrations_pr_number,
                    !editing,
                )
                PrField(
                    draft.headBranch,
                    { draft = draft.copy(headBranch = it) },
                    R.string.remote_integrations_head_branch,
                )
                PrField(
                    draft.worktreePath,
                    { draft = draft.copy(worktreePath = it) },
                    R.string.remote_integrations_worktree_optional,
                )
                PrField(
                    draft.agentKind,
                    { draft = draft.copy(agentKind = it) },
                    R.string.remote_integrations_agent,
                )
                PrField(draft.model, { draft = draft.copy(model = it) }, R.string.remote_integrations_model)
                PrField(
                    draft.effort,
                    { draft = draft.copy(effort = it) },
                    R.string.remote_integrations_effort_optional,
                )
                ToggleRow(R.string.remote_integrations_watch_enabled_label, draft.watchEnabled) {
                    draft = draft.copy(watchEnabled = it)
                }
                ToggleRow(R.string.remote_integrations_auto_merge, draft.autoMerge) {
                    draft = draft.copy(autoMerge = it)
                }
                ToggleRow(R.string.remote_integrations_fast_mode, draft.fast) {
                    draft = draft.copy(fast = it)
                }
                if (draft.domain() == null) {
                    Text(stringResource(R.string.remote_integrations_invalid_watch))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(draft) }, enabled = draft.domain() != null) {
                Text(stringResource(
                    if (editing) R.string.remote_integrations_save
                    else R.string.remote_integrations_create,
                ))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.remote_integrations_cancel)) }
        },
    )
}

@Composable
private fun PrField(
    value: String,
    onValueChange: (String) -> Unit,
    label: Int,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value,
        onValueChange,
        label = { Text(stringResource(label)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        enabled = enabled,
    )
}
