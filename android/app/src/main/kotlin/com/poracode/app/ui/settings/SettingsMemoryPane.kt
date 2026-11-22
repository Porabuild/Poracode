package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.poracode.app.ui.theme.PoracodeIcons

/**
 * Host-scoped Memory settings, matching desktop and iOS over `/api/settings`.
 */
@Composable
internal fun SettingsMemoryPane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsMemoryDraft, SettingsMemoryDraft) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val snapshot = entry?.settings
    val baseline = projectMemory(snapshot)
    val loading = SettingsInformationSlot.Settings in entry?.loading.orEmpty()
    val failure = entry?.failures?.get(SettingsInformationSlot.Settings)
    if (snapshot == null && failure == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_memory))
        return
    }
    val hostAgents = projectGenerationAgents(entry?.agentStatuses, wsl = false, requireOneShot = true)
    val wslAgents = projectGenerationAgents(entry?.agentStatuses, wsl = true, requireOneShot = true)
    val agents = if (hostAgents.isNotEmpty()) hostAgents else wslAgents
    LazyColumn(
        modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (failure != null) item { SettingsFailure(failure, onRetry) }
        if (snapshot != null && baseline == null) {
            item {
                SettingsCard {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(PoracodeIcons.Brain, contentDescription = null)
                        Text(
                            stringResource(R.string.settings_memory_unavailable),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else if (baseline != null) {
            item {
                SettingsMemoryEditor(
                    baseline = baseline,
                    agents = agents,
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
private fun SettingsMemoryEditor(
    baseline: SettingsMemoryDraft,
    agents: List<SettingsGenerationAgentOption>,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsMemoryDraft, SettingsMemoryDraft) -> Unit,
) {
    var draft by remember(leaseKey) { mutableStateOf(baseline) }
    LaunchedEffect(baseline, mutation.settingsSaving) {
        if (!mutation.settingsSaving) draft = baseline
    }
    val canEdit = access.canWrite && !mutation.settingsSaving
    val childEnabled = canEdit && draft.enabled

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SettingsSection(stringResource(R.string.settings_memory_title)) {
            Text(
                stringResource(R.string.settings_memory_description),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SettingsSwitchRow(
                label = stringResource(R.string.settings_memory_use_memory),
                checked = draft.enabled,
                onChange = { draft = draft.copy(enabled = it) },
                enabled = canEdit,
            )
            SettingsSwitchRow(
                label = stringResource(R.string.settings_memory_learn_from_chats),
                checked = draft.learning,
                onChange = { draft = draft.copy(learning = it) },
                enabled = childEnabled,
            )
        }

        if (agents.isNotEmpty()) {
            SettingsSection(stringResource(R.string.settings_memory_models_section)) {
                MemoryModelPickerGroup(
                    title = stringResource(R.string.settings_memory_capture_model),
                    provider = draft.captureProvider,
                    model = draft.captureModel,
                    effort = draft.captureEffort,
                    agents = agents,
                    enabled = childEnabled,
                    onChange = { provider, model, effort ->
                        draft = draft.copy(
                            captureProvider = provider,
                            captureModel = model,
                            captureEffort = effort,
                            captureFast = if (provider == SettingsGenerationSlotDraft.PROVIDER_AUTO) false else draft.captureFast,
                        )
                    },
                )
                MemoryModelPickerGroup(
                    title = stringResource(R.string.settings_memory_dream_model),
                    provider = draft.dreamProvider,
                    model = draft.dreamModel,
                    effort = draft.dreamEffort,
                    agents = agents,
                    enabled = childEnabled,
                    onChange = { provider, model, effort ->
                        draft = draft.copy(
                            dreamProvider = provider,
                            dreamModel = model,
                            dreamEffort = effort,
                            dreamFast = if (provider == SettingsGenerationSlotDraft.PROVIDER_AUTO) false else draft.dreamFast,
                        )
                    },
                )
            }
        }

        SettingsSection(stringResource(R.string.settings_memory_capture_and_dream_section)) {
            SettingsDropdownRow(
                label = stringResource(R.string.settings_memory_when_to_capture),
                value = draft.captureTiming,
                options = listOf(
                    SettingsMemoryDraft.CAPTURE_SETTLE_2M to
                        stringResource(R.string.settings_memory_capture_settle_2m),
                    SettingsMemoryDraft.CAPTURE_SETTLE_90S to
                        stringResource(R.string.settings_memory_capture_settle_90s),
                    SettingsMemoryDraft.CAPTURE_CUSTOM to
                        stringResource(R.string.settings_memory_capture_custom),
                    SettingsMemoryDraft.CAPTURE_LIFECYCLE to
                        stringResource(R.string.settings_memory_capture_lifecycle),
                ),
                enabled = childEnabled,
            ) { draft = draft.copy(captureTiming = it) }

            if (draft.captureTiming == SettingsMemoryDraft.CAPTURE_CUSTOM) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.settings_memory_custom_idle_minutes),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        onClick = {
                            draft = draft.copy(
                                captureCustomMinutes = (draft.captureCustomMinutes - 1).coerceAtLeast(1),
                            )
                        },
                        enabled = childEnabled && draft.captureCustomMinutes > 1,
                    ) { Text("-") }
                    Text(
                        draft.captureCustomMinutes.toString(),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    OutlinedButton(
                        onClick = {
                            draft = draft.copy(
                                captureCustomMinutes = (draft.captureCustomMinutes + 1).coerceAtMost(240),
                            )
                        },
                        enabled = childEnabled && draft.captureCustomMinutes < 240,
                    ) { Text("+") }
                }
            }

            SettingsDropdownRow(
                label = stringResource(R.string.settings_memory_when_deleted),
                value = draft.deletePolicy,
                options = listOf(
                    SettingsMemoryDraft.DELETE_SPOOL to
                        stringResource(R.string.settings_memory_delete_spool),
                    SettingsMemoryDraft.DELETE_LIFECYCLE to
                        stringResource(R.string.settings_memory_delete_lifecycle),
                    SettingsMemoryDraft.DELETE_NEVER to
                        stringResource(R.string.settings_memory_delete_never),
                ),
                enabled = childEnabled,
            ) { draft = draft.copy(deletePolicy = it) }

            SettingsDropdownRow(
                label = stringResource(R.string.settings_memory_dream_schedule),
                value = draft.dreamCadence,
                options = listOf(
                    SettingsMemoryDraft.DREAM_DAILY to
                        stringResource(R.string.settings_memory_dream_daily),
                    SettingsMemoryDraft.DREAM_3D to
                        stringResource(R.string.settings_memory_dream_3d),
                    SettingsMemoryDraft.DREAM_WEEKLY to
                        stringResource(R.string.settings_memory_dream_weekly),
                    SettingsMemoryDraft.DREAM_MANUAL to
                        stringResource(R.string.settings_memory_dream_manual),
                ),
                enabled = childEnabled,
            ) { draft = draft.copy(dreamCadence = it) }
        }

        SettingsSection(stringResource(R.string.settings_memory_behavior_section)) {
            SettingsSwitchRow(
                label = stringResource(R.string.settings_memory_suggest_skills),
                checked = draft.suggestSkills,
                onChange = { draft = draft.copy(suggestSkills = it) },
                enabled = childEnabled,
            )
            SettingsSwitchRow(
                label = stringResource(R.string.settings_memory_prefer_poracode),
                checked = draft.suppressNative,
                onChange = { draft = draft.copy(suppressNative = it) },
                enabled = childEnabled,
            )
            SettingsSwitchRow(
                label = stringResource(R.string.settings_memory_sync_across_environments),
                checked = draft.syncEnabled,
                onChange = { draft = draft.copy(syncEnabled = it) },
                enabled = childEnabled,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = { onSave(draft, baseline) },
                enabled = canEdit && draft != baseline,
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
    }
}

@Composable
private fun MemoryModelPickerGroup(
    title: String,
    provider: String,
    model: String,
    effort: String,
    agents: List<SettingsGenerationAgentOption>,
    enabled: Boolean,
    onChange: (provider: String, model: String, effort: String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        val autoLabel = stringResource(R.string.settings_generation_auto)
        val providerOptions = buildList {
            add(SettingsGenerationSlotDraft.PROVIDER_AUTO to autoLabel)
            agents.forEach { add(it.kind to it.label) }
        }
        SettingsDropdownRow(
            label = stringResource(R.string.settings_generation_provider),
            value = provider,
            options = providerOptions,
            enabled = enabled,
        ) { nextProvider ->
            if (nextProvider == SettingsGenerationSlotDraft.PROVIDER_AUTO) {
                onChange(SettingsGenerationSlotDraft.PROVIDER_AUTO, "", "")
            } else {
                val selected = agents.firstOrNull { it.kind == nextProvider }
                onChange(nextProvider, selected?.models?.firstOrNull()?.id.orEmpty(), "")
            }
        }
        val selectedAgent = agents.firstOrNull { it.kind == provider }
        if (selectedAgent != null) {
            if (selectedAgent.models.isNotEmpty()) {
                SettingsDropdownRow(
                    label = stringResource(R.string.settings_generation_model),
                    value = model.ifEmpty { selectedAgent.models.first().id },
                    options = selectedAgent.models.map { it.id to it.label },
                    enabled = enabled,
                ) { nextModel ->
                    onChange(provider, nextModel, "")
                }
            }
            val efforts = selectedAgent.effortsFor(model)
            if (efforts.size > 1) {
                val defaultEffortLabel = stringResource(R.string.settings_memory_effort_default)
                SettingsDropdownRow(
                    label = stringResource(R.string.settings_generation_effort),
                    value = effort,
                    options = listOf("" to defaultEffortLabel) + efforts.map { it to it },
                    enabled = enabled,
                ) { nextEffort ->
                    onChange(provider, model, nextEffort)
                }
            }
        }
    }
}
