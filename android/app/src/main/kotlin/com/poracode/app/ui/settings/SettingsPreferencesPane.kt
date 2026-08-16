package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot

@Composable
internal fun SettingsPreferencesPane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsPreferencesDraft, SettingsPreferencesDraft) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val baseline = projectPreferences(entry?.settings)
    val loading = SettingsInformationSlot.Settings in entry?.loading.orEmpty()
    val failure = entry?.failures?.get(SettingsInformationSlot.Settings)
    if (baseline == null && failure == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_preferences))
        return
    }
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (failure != null) SettingsFailure(failure, onRetry)
        if (baseline != null) {
            SettingsPreferencesEditor(
                baseline = baseline,
                access = access,
                mutation = mutation,
                leaseKey = leaseKey,
                onSave = onSave,
            )
        }
    }
}

@Composable
private fun SettingsPreferencesEditor(
    baseline: SettingsPreferencesDraft,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsPreferencesDraft, SettingsPreferencesDraft) -> Unit,
) {
    var titleFast by rememberSaveable(leaseKey) { mutableStateOf(baseline.titleGenerationFast) }
    var commitFast by rememberSaveable(leaseKey) { mutableStateOf(baseline.commitGenerationFast) }
    var conflictFast by rememberSaveable(leaseKey) { mutableStateOf(baseline.conflictResolutionFast) }
    LaunchedEffect(baseline, mutation.settingsSaving) {
        if (!mutation.settingsSaving) {
            titleFast = baseline.titleGenerationFast
            commitFast = baseline.commitGenerationFast
            conflictFast = baseline.conflictResolutionFast
        }
    }
    val draft = SettingsPreferencesDraft(titleFast, commitFast, conflictFast)
    SettingsSection(stringResource(R.string.settings_preferences_generation)) {
        SettingsToggleRow(
            stringResource(R.string.settings_preferences_fast_titles),
            titleFast,
            access.canWrite && !mutation.settingsSaving,
        ) { titleFast = it }
        SettingsToggleRow(
            stringResource(R.string.settings_preferences_fast_commits),
            commitFast,
            access.canWrite && !mutation.settingsSaving,
        ) { commitFast = it }
        SettingsToggleRow(
            stringResource(R.string.settings_preferences_fast_conflicts),
            conflictFast,
            access.canWrite && !mutation.settingsSaving,
        ) { conflictFast = it }
        Button(
            onClick = { onSave(draft, baseline) },
            enabled = access.canWrite && !mutation.settingsSaving && draft != baseline,
            modifier = Modifier.align(Alignment.End),
        ) {
            Text(
                stringResource(
                    if (mutation.settingsSaving) R.string.settings_saving
                    else R.string.settings_save_preferences,
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
    SettingsSection(stringResource(R.string.settings_secrets_title)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Security, contentDescription = null)
            Text(
                stringResource(R.string.settings_secrets_description),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SettingsToggleRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth()
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .padding(vertical = 8.dp)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}
