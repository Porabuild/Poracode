package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot

/**
 * Host-scoped worktree location and pull-request automation defaults. Matches iOS's
 * "Workspace" settings route (worktree storage + PR automation) under Desktop settings.
 */
@Composable
internal fun SettingsWorkspacePane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsWorkspaceDraft, SettingsWorkspaceDraft) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val baseline = projectWorkspace(entry?.settings)
    val loading = SettingsInformationSlot.Settings in entry?.loading.orEmpty()
    val failure = entry?.failures?.get(SettingsInformationSlot.Settings)
    if (baseline == null && failure == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_workspace))
        return
    }
    LazyColumn(
        modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (failure != null) item { SettingsFailure(failure, onRetry) }
        if (baseline != null) {
            item {
                SettingsWorkspaceEditor(
                    baseline = baseline,
                    access = access,
                    mutation = mutation,
                    leaseKey = leaseKey,
                    onSave = onSave,
                )
            }
        }
    }
}

@Composable
private fun SettingsWorkspaceEditor(
    baseline: SettingsWorkspaceDraft,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsWorkspaceDraft, SettingsWorkspaceDraft) -> Unit,
) {
    var draft by remember(leaseKey) { mutableStateOf(baseline) }
    LaunchedEffect(baseline, mutation.settingsSaving) {
        if (!mutation.settingsSaving) draft = baseline
    }
    val enabled = access.canWrite && !mutation.settingsSaving
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SettingsSection(stringResource(R.string.settings_workspace_worktrees)) {
            SettingsDropdownRow(
                label = stringResource(R.string.settings_workspace_storage_mode),
                value = draft.worktreeStorageMode,
                options = listOf(
                    SettingsWorkspaceDraft.STORAGE_GLOBAL to
                        stringResource(R.string.settings_workspace_storage_global),
                    SettingsWorkspaceDraft.STORAGE_PROJECT_RELATIVE to
                        stringResource(R.string.settings_workspace_storage_project),
                ),
                enabled = enabled,
            ) { draft = draft.copy(worktreeStorageMode = it) }
            OutlinedTextField(
                value = draft.worktreeBasePath,
                onValueChange = { draft = draft.copy(worktreeBasePath = it) },
                label = { Text(stringResource(R.string.settings_workspace_base_path)) },
                enabled = enabled,
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draft.wslWorktreeBasePath,
                onValueChange = { draft = draft.copy(wslWorktreeBasePath = it) },
                label = { Text(stringResource(R.string.settings_workspace_wsl_base_path)) },
                enabled = enabled,
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        SettingsSection(stringResource(R.string.settings_workspace_automation)) {
            SettingsDropdownRow(
                label = stringResource(R.string.settings_workspace_default_action),
                value = draft.prAutomationDefault,
                options = listOf(
                    SettingsWorkspaceDraft.PR_AUTOMATION_OFF to
                        stringResource(R.string.settings_workspace_action_off),
                    SettingsWorkspaceDraft.PR_AUTOMATION_FIX to
                        stringResource(R.string.settings_workspace_action_fix),
                    SettingsWorkspaceDraft.PR_AUTOMATION_MERGE to
                        stringResource(R.string.settings_workspace_action_merge),
                ),
                enabled = enabled,
            ) { draft = draft.copy(prAutomationDefault = it) }
            SettingsDropdownRow(
                label = stringResource(R.string.settings_workspace_merge_method),
                value = draft.prMergeMethod,
                options = listOf(
                    SettingsWorkspaceDraft.PR_MERGE_METHOD_MERGE to
                        stringResource(R.string.settings_workspace_merge_method_merge),
                    SettingsWorkspaceDraft.PR_MERGE_METHOD_SQUASH to
                        stringResource(R.string.settings_workspace_merge_method_squash),
                    SettingsWorkspaceDraft.PR_MERGE_METHOD_REBASE to
                        stringResource(R.string.settings_workspace_merge_method_rebase),
                ),
                enabled = enabled,
            ) { draft = draft.copy(prMergeMethod = it) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onSave(draft, baseline) },
                enabled = enabled && draft != baseline,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text(
                    stringResource(
                        if (mutation.settingsSaving) R.string.settings_saving
                        else R.string.settings_save_workspace,
                    ),
                )
            }
            if (!access.canWrite) {
                Text(
                    stringResource(R.string.settings_write_denied),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            SettingsMutationMessage(mutation.settingsOutcome)
        }
    }
}
