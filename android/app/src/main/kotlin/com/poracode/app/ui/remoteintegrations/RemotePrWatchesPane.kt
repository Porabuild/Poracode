package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import com.poracode.app.model.remoteintegrations.PrWatch
import com.poracode.app.model.remoteintegrations.PrWatchKey
import com.poracode.app.session.remoteintegrations.IntegrationSlot
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsState

@Composable
internal fun RemotePrWatchesPane(
    state: RemoteIntegrationsState,
    access: RemoteIntegrationsAccess,
    composition: RemoteIntegrationsComposition,
    modifier: Modifier = Modifier,
) {
    var targetProject by remember { mutableStateOf("") }
    var targetNumber by remember { mutableStateOf("") }
    var editor by remember { mutableStateOf<PrWatchEditorDraft?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val loading = IntegrationSlot.PrWatch in state.loading
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            IntegrationSectionCard(stringResource(R.string.remote_integrations_pr_target)) {
                OutlinedTextField(
                    targetProject,
                    { targetProject = it },
                    label = { Text(stringResource(R.string.remote_integrations_project_id)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    targetNumber,
                    { targetNumber = it },
                    label = { Text(stringResource(R.string.remote_integrations_pr_number)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                val key = targetNumber.toLongOrNull()?.let { PrWatchKey(targetProject.trim(), it) }
                Button(
                    onClick = { composition.selectPr(checkNotNull(key)) },
                    enabled = access.canRead && key?.isValid == true && !loading,
                ) { Text(stringResource(R.string.remote_integrations_load_watch)) }
            }
        }
        if (loading) item { IntegrationLoading() }
        state.prKey?.let { key ->
            item {
                if (state.prWatch == null && !loading) {
                    IntegrationSectionCard(stringResource(R.string.remote_integrations_no_watch)) {
                        Text(stringResource(R.string.remote_integrations_no_watch_message))
                        Button(
                            onClick = {
                                editor = PrWatchEditorDraft(
                                    projectId = key.projectId,
                                    prNumber = key.prNumber.toString(),
                                )
                            },
                            enabled = access.canOperate,
                        ) { Text(stringResource(R.string.remote_integrations_create_watch)) }
                    }
                }
            }
        }
        state.prWatch?.let { watch ->
            item {
                PrWatchCard(
                    watch,
                    enabled = access.canOperate && !loading,
                    onEdit = { editor = PrWatchEditorDraft.from(watch) },
                    onCheck = { composition.checkPrWatch(watch.draft.key) },
                    onDelete = { confirmDelete = true },
                )
            }
        }
        item {
            IntegrationFailureView(state.failures[IntegrationSlot.PrWatch]) {
                state.prKey?.let(composition::selectPr)
            }
            IntegrationMutationMessage(state.mutation)
        }
    }

    editor?.let { value ->
        PrWatchEditorDialog(
            initial = value,
            editing = state.prWatch != null,
            onDismiss = { editor = null },
            onConfirm = { completed ->
                editor = null
                composition.upsertPrWatch(checkNotNull(completed.domain()))
            },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.remote_integrations_delete_watch_title)) },
            text = { Text(stringResource(R.string.remote_integrations_delete_watch_message)) },
            confirmButton = {
                Button(onClick = {
                    confirmDelete = false
                    state.prWatch?.draft?.key?.let(composition::deletePrWatch)
                }) { Text(stringResource(R.string.remote_integrations_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        )
    }
}

@Composable
private fun PrWatchCard(
    watch: PrWatch,
    enabled: Boolean,
    onEdit: () -> Unit,
    onCheck: () -> Unit,
    onDelete: () -> Unit,
) {
    IntegrationSectionCard(
        stringResource(R.string.remote_integrations_pr_value, watch.draft.key.prNumber),
    ) {
        Text(stringResource(R.string.remote_integrations_branch_value, watch.draft.headBranch))
        Text(stringResource(
            if (watch.draft.watchEnabled) R.string.remote_integrations_watch_enabled
            else R.string.remote_integrations_watch_disabled,
        ))
        if (watch.draft.autoMerge) Text(stringResource(R.string.remote_integrations_auto_merge_enabled))
        if (watch.isChecking) Text(stringResource(R.string.remote_integrations_check_in_progress))
        if (watch.hasError) {
            Text(
                stringResource(R.string.remote_integrations_watch_failed_safe),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onEdit, enabled = enabled) {
                Icon(Icons.Outlined.Edit, stringResource(R.string.remote_integrations_edit_watch))
            }
            IconButton(onClick = onCheck, enabled = enabled && !watch.isChecking) {
                Icon(Icons.Outlined.PlayArrow, stringResource(R.string.remote_integrations_check_now))
            }
            IconButton(onClick = onDelete, enabled = enabled) {
                Icon(Icons.Outlined.Delete, stringResource(R.string.remote_integrations_delete_watch))
            }
        }
    }
}
