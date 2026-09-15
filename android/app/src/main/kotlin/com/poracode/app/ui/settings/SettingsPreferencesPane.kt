package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot

/**
 * Full parity with the iOS/PWA "Generation" settings: per-environment (Windows/WSL) provider,
 * model, effort, fast-mode, and (conflict resolution only) presentation-mode pickers for the
 * thread-title, commit-message, and conflict-resolution automations.
 */
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
    val windowsOneShotAgents = projectGenerationAgents(entry?.agentStatuses, wsl = false, requireOneShot = true)
    val windowsAllAgents = projectGenerationAgents(entry?.agentStatuses, wsl = false, requireOneShot = false)
    val wslOneShotAgents = projectGenerationAgents(entry?.agentStatuses, wsl = true, requireOneShot = true)
    val wslAllAgents = projectGenerationAgents(entry?.agentStatuses, wsl = true, requireOneShot = false)
    LazyColumn(
        modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (failure != null) item { SettingsFailure(failure, onRetry) }
        if (baseline != null) {
            item {
                SettingsGenerationEditor(
                    baseline = baseline,
                    windowsOneShotAgents = windowsOneShotAgents,
                    windowsAllAgents = windowsAllAgents,
                    wslOneShotAgents = wslOneShotAgents,
                    wslAllAgents = wslAllAgents,
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
private fun SettingsGenerationEditor(
    baseline: SettingsPreferencesDraft,
    windowsOneShotAgents: List<SettingsGenerationAgentOption>,
    windowsAllAgents: List<SettingsGenerationAgentOption>,
    wslOneShotAgents: List<SettingsGenerationAgentOption>,
    wslAllAgents: List<SettingsGenerationAgentOption>,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsPreferencesDraft, SettingsPreferencesDraft) -> Unit,
) {
    var draft by remember(leaseKey) { mutableStateOf(baseline) }
    LaunchedEffect(baseline, mutation.settingsSaving) {
        if (!mutation.settingsSaving) draft = baseline
    }
    val enabled = access.canWrite && !mutation.settingsSaving
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SettingsSection(stringResource(R.string.settings_environment_windows)) {
            GenerationSlotGroup(
                title = stringResource(R.string.settings_generation_titles),
                slot = draft.windows.title,
                agents = windowsOneShotAgents,
                allowsDisabled = true,
                enabled = enabled,
            ) { draft = draft.copy(windows = draft.windows.copy(title = it)) }
            HorizontalDivider()
            GenerationSlotGroup(
                title = stringResource(R.string.settings_generation_commits),
                slot = draft.windows.commit,
                agents = windowsOneShotAgents,
                allowsDisabled = false,
                enabled = enabled,
            ) { draft = draft.copy(windows = draft.windows.copy(commit = it)) }
            HorizontalDivider()
            GenerationSlotGroup(
                title = stringResource(R.string.settings_generation_conflicts),
                slot = draft.windows.conflict,
                agents = windowsAllAgents,
                allowsDisabled = false,
                enabled = enabled,
            ) { draft = draft.copy(windows = draft.windows.copy(conflict = it)) }
        }
        if (wslOneShotAgents.isNotEmpty() || wslAllAgents.isNotEmpty()) {
            SettingsSection(stringResource(R.string.settings_environment_wsl)) {
                GenerationSlotGroup(
                    title = stringResource(R.string.settings_generation_titles),
                    slot = draft.wsl.title,
                    agents = wslOneShotAgents,
                    allowsDisabled = true,
                    enabled = enabled,
                ) { draft = draft.copy(wsl = draft.wsl.copy(title = it)) }
                HorizontalDivider()
                GenerationSlotGroup(
                    title = stringResource(R.string.settings_generation_commits),
                    slot = draft.wsl.commit,
                    agents = wslOneShotAgents,
                    allowsDisabled = false,
                    enabled = enabled,
                ) { draft = draft.copy(wsl = draft.wsl.copy(commit = it)) }
                HorizontalDivider()
                GenerationSlotGroup(
                    title = stringResource(R.string.settings_generation_conflicts),
                    slot = draft.wsl.conflict,
                    agents = wslAllAgents,
                    allowsDisabled = false,
                    enabled = enabled,
                ) { draft = draft.copy(wsl = draft.wsl.copy(conflict = it)) }
            }
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
}

@Composable
private fun GenerationSlotGroup(
    title: String,
    slot: SettingsGenerationSlotDraft,
    agents: List<SettingsGenerationAgentOption>,
    allowsDisabled: Boolean,
    enabled: Boolean,
    onChange: (SettingsGenerationSlotDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        val autoLabel = stringResource(R.string.settings_generation_auto)
        val disabledLabel = stringResource(R.string.settings_generation_disabled)
        val providerOptions = buildList {
            add(SettingsGenerationSlotDraft.PROVIDER_AUTO to autoLabel)
            if (allowsDisabled) add(SettingsGenerationSlotDraft.PROVIDER_DISABLED to disabledLabel)
            agents.forEach { add(it.kind to it.label) }
        }
        SettingsDropdownRow(
            label = stringResource(R.string.settings_generation_provider),
            value = slot.provider,
            options = providerOptions,
            enabled = enabled,
        ) { provider ->
            val agent = agents.firstOrNull { it.kind == provider }
            onChange(
                slot.copy(
                    provider = provider,
                    model = agent?.models?.firstOrNull()?.id.orEmpty(),
                    effort = agent?.efforts?.firstOrNull().orEmpty(),
                    fast = false,
                ),
            )
        }
        val selectedAgent = agents.firstOrNull { it.kind == slot.provider }
        if (selectedAgent != null) {
            if (selectedAgent.models.isNotEmpty()) {
                SettingsDropdownRow(
                    label = stringResource(R.string.settings_generation_model),
                    value = slot.model,
                    options = selectedAgent.models.map { it.id to it.label },
                    enabled = enabled,
                ) { model -> onChange(slot.copy(model = model)) }
            }
            if (selectedAgent.efforts.isNotEmpty()) {
                SettingsDropdownRow(
                    label = stringResource(R.string.settings_generation_effort),
                    value = slot.effort,
                    options = selectedAgent.efforts.map { it to it },
                    enabled = enabled,
                ) { effort -> onChange(slot.copy(effort = effort)) }
            }
            SettingsSwitchRow(
                label = stringResource(R.string.settings_generation_fast_mode),
                checked = slot.fast,
                onChange = { onChange(slot.copy(fast = it)) },
                enabled = enabled && selectedAgent.fastModels.contains(slot.model),
            )
        } else if (slot.provider == SettingsGenerationSlotDraft.PROVIDER_AUTO) {
            agents.firstOrNull()?.let { automatic ->
                SettingsValueRow(stringResource(R.string.settings_generation_provider), automatic.label)
                automatic.models.firstOrNull()?.let { model ->
                    SettingsValueRow(stringResource(R.string.settings_generation_model), model.label)
                }
            }
        }
        if (slot.presentationMode != null) {
            SingleChoiceSegmentedButtonRow {
                SegmentedButton(
                    selected = slot.presentationMode == SettingsGenerationSlotDraft.PRESENTATION_TERMINAL,
                    onClick = {
                        onChange(slot.copy(presentationMode = SettingsGenerationSlotDraft.PRESENTATION_TERMINAL))
                    },
                    enabled = enabled,
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                ) { Text(stringResource(R.string.settings_generation_presentation_terminal)) }
                SegmentedButton(
                    selected = slot.presentationMode == SettingsGenerationSlotDraft.PRESENTATION_GUI,
                    onClick = {
                        onChange(slot.copy(presentationMode = SettingsGenerationSlotDraft.PRESENTATION_GUI))
                    },
                    enabled = enabled,
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                ) { Text(stringResource(R.string.settings_generation_presentation_graphical)) }
            }
        }
    }
}
