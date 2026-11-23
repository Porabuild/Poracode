package com.poracode.app.ui.crews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.session.replay.HostReplayCacheUi
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeChoiceOption
import com.poracode.app.ui.components.PoracodeChoiceSection
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeToggleRow
import com.poracode.app.ui.settings.SettingsFailure
import com.poracode.app.ui.settings.SettingsLoading
import com.poracode.app.ui.settings.SettingsMutationState
import com.poracode.app.ui.settings.SettingsUiAccess
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.util.UUID

internal val LocalSavedCrews = staticCompositionLocalOf<List<SavedCrew>> { emptyList() }

@Composable
internal fun CrewsSettingsPane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    replayCache: HostReplayCacheUi,
    onSave: (HostSettingsPatch) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val snapshot = entry?.settings
    val loading = SettingsInformationSlot.Settings in entry?.loading.orEmpty()
    val failure = entry?.failures?.get(SettingsInformationSlot.Settings)
    if (snapshot == null && failure == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_preferences))
        return
    }
    val crews = remember(snapshot) { SavedCrew.decodeAll(snapshot) }
    val agents = remember(replayCache) {
        (replayCache.agentWindowsStatuses + replayCache.agentWslStatuses + replayCache.agentMergedStatuses.values)
            .distinctBy { it.kind }
            .filter { it.installed }
    }
    val canWrite = access.canWrite && !mutation.settingsSaving
    var editing by remember { mutableStateOf<SavedCrew?>(null) }
    var isCreating by remember { mutableStateOf(false) }

    val defaultCrewName = stringResource(R.string.crews_default_name)
    val defaultRoleName = stringResource(R.string.crews_default_role)

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (loading || mutation.settingsSaving) {
            item(key = "loading") { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
        if (failure != null) {
            item(key = "failure") { SettingsFailure(failure, onRetry) }
        }
        item(key = "header") {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.crews_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = PoracodeTheme.colors.muted,
                    modifier = Modifier.weight(1f),
                )
                PoracodeActionButton(
                    label = stringResource(R.string.crews_new),
                    icon = PoracodeIcons.Add,
                    variant = PoracodeButtonVariant.Tonal,
                    enabled = canWrite && crews.size < SavedCrew.MAX_SAVED_CREWS && agents.isNotEmpty(),
                    onClick = {
                        SavedCrew.createDefault(agents, defaultCrewName, defaultRoleName)?.let {
                            editing = it
                            isCreating = true
                        }
                    },
                )
            }
        }
        if (crews.isEmpty()) {
            item(key = "empty") {
                EmptyStateView(
                    stringResource(R.string.crews_empty_title),
                    stringResource(R.string.crews_empty_description),
                )
            }
        } else {
            items(crews, key = { it.id }) { crew ->
                SavedCrewCard(
                    crew = crew,
                    canWrite = canWrite,
                    canDuplicate = canWrite && crews.size < SavedCrew.MAX_SAVED_CREWS,
                    onEdit = {
                        editing = crew
                        isCreating = false
                    },
                    onToggleFavorite = {
                        val next = crews.map {
                            if (it.id == crew.id) it.copy(favorite = !it.favorite, updatedAt = System.currentTimeMillis())
                            else it
                        }
                        onSave(SavedCrew.encodePatch(next))
                    },
                    onDuplicate = {
                        val copy = crew.copy(
                            id = "crew-${UUID.randomUUID().toString().take(8)}",
                            name = "${crew.name} (copy)".take(SavedCrew.MAX_NAME_LENGTH),
                            favorite = false,
                            updatedAt = System.currentTimeMillis(),
                        )
                        onSave(SavedCrew.encodePatch(crews + copy))
                    },
                    onDelete = {
                        onSave(SavedCrew.encodePatch(crews.filterNot { it.id == crew.id }))
                    },
                )
            }
        }
    }

    editing?.let { target ->
        SavedCrewEditorSheet(
            initial = target,
            agents = agents,
            onDismiss = { editing = null },
            onSave = { updated ->
                val stamped = updated.copy(updatedAt = System.currentTimeMillis())
                val next = if (isCreating || crews.none { it.id == stamped.id }) {
                    crews + stamped
                } else {
                    crews.map { if (it.id == stamped.id) stamped else it }
                }
                editing = null
                onSave(SavedCrew.encodePatch(next))
            },
        )
    }
}

@Composable
private fun SavedCrewCard(
    crew: SavedCrew,
    canWrite: Boolean,
    canDuplicate: Boolean,
    onEdit: () -> Unit,
    onToggleFavorite: () -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    PoracodeCard {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    crew.name,
                    style = PoracodeTextStyles.sheetTitle,
                    color = colors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${crew.lead.agentKind}/${crew.lead.model} · ${stringResource(R.string.rich_chat_crew_helpers_count, crew.helperCount)}",
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stringResource(
                        if (crew.policy == CrewPolicy.CrewOnly) R.string.rich_chat_crew_policy_only
                        else R.string.rich_chat_crew_policy_first,
                    ),
                    style = PoracodeTextStyles.rowMeta,
                    color = colors.muted,
                )
            }
            PoracodeIconButton(
                icon = PoracodeIcons.Star,
                contentDescription = stringResource(R.string.crews_favorite),
                enabled = canWrite,
                tint = if (crew.favorite) colors.accent else colors.muted,
                onClick = onToggleFavorite,
            )
            PoracodeIconButton(
                icon = PoracodeIcons.Edit,
                contentDescription = stringResource(R.string.crews_edit),
                enabled = canWrite,
                tint = colors.muted,
                onClick = onEdit,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onDuplicate, enabled = canDuplicate) {
                Text(stringResource(R.string.crews_duplicate))
            }
            TextButton(onClick = onDelete, enabled = canWrite) {
                Text(stringResource(R.string.thread_lifecycle_delete), color = colors.danger)
            }
        }
    }
}

@Composable
internal fun SavedCrewEditorSheet(
    initial: SavedCrew,
    agents: List<AgentStatusEntry>,
    onDismiss: () -> Unit,
    onSave: (SavedCrew) -> Unit,
) {
    var draft by remember(initial) { mutableStateOf(initial) }
    val installedAgents = remember(agents) { agents.filter { it.installed } }
    val leadAgent = installedAgents.firstOrNull { it.kind == draft.lead.agentKind } ?: installedAgents.firstOrNull()
    val leadModels = remember(leadAgent) { leadAgent?.let(::agentModelOptions).orEmpty() }
    val defaultRoleLabel = stringResource(R.string.crews_default_role)

    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.crews_edit),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 540.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PoracodeTextField(
                value = draft.name,
                onValueChange = { draft = draft.copy(name = it.take(SavedCrew.MAX_NAME_LENGTH)) },
                label = { Text(stringResource(R.string.crews_name_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (installedAgents.isNotEmpty()) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_crew_lead),
                    options = installedAgents.map { PoracodeChoiceOption(it.kind, it.label) },
                    selectedId = draft.lead.agentKind,
                    onSelect = { kind ->
                        val nextAgent = installedAgents.firstOrNull { it.kind == kind }
                        val nextModel = nextAgent?.let(SavedCrew::firstModelId) ?: draft.lead.model
                        draft = draft.copy(lead = draft.lead.copy(agentKind = kind, model = nextModel))
                    },
                )
            }
            if (leadModels.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.crews_lead_model),
                    options = leadModels.take(8).map { (id, label) -> PoracodeChoiceOption(id, label) },
                    selectedId = draft.lead.model,
                    onSelect = { model -> draft = draft.copy(lead = draft.lead.copy(model = model)) },
                )
            }
            PoracodeChoiceSection(
                label = stringResource(R.string.crews_policy),
                options = listOf(
                    PoracodeChoiceOption(CrewPolicy.CrewOnly.wireValue, stringResource(R.string.rich_chat_crew_policy_only)),
                    PoracodeChoiceOption(CrewPolicy.CrewFirst.wireValue, stringResource(R.string.rich_chat_crew_policy_first)),
                ),
                selectedId = draft.policy.wireValue,
                onSelect = { draft = draft.copy(policy = CrewPolicy.fromWire(it)) },
            )
            PoracodeSheetDivider()
            draft.roles.forEachIndexed { index, role ->
                val roleAgent = installedAgents.firstOrNull { it.kind == role.selection.agentKind }
                    ?: installedAgents.firstOrNull()
                val roleModels = roleAgent?.let(::agentModelOptions).orEmpty()
                PoracodeCard {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        PoracodeTextField(
                            value = role.label,
                            onValueChange = { nextLabel ->
                                draft = draft.copy(
                                    roles = draft.roles.mapIndexed { i, r ->
                                        if (i == index) r.copy(label = nextLabel.take(32)) else r
                                    },
                                )
                            },
                            label = { Text(stringResource(R.string.crews_role_label)) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        if (draft.roles.size > 1) {
                            PoracodeIconButton(
                                icon = PoracodeIcons.Delete,
                                contentDescription = stringResource(R.string.thread_lifecycle_delete),
                                tint = PoracodeTheme.colors.danger,
                                onClick = {
                                    draft = draft.copy(roles = draft.roles.filterIndexed { i, _ -> i != index })
                                },
                            )
                        }
                    }
                    if (installedAgents.size > 1) {
                        PoracodeChoiceSection(
                            label = stringResource(R.string.crews_role_agent),
                            options = installedAgents.map { PoracodeChoiceOption(it.kind, it.label) },
                            selectedId = role.selection.agentKind,
                            onSelect = { kind ->
                                val nextAgent = installedAgents.firstOrNull { it.kind == kind }
                                val nextModel = nextAgent?.let(SavedCrew::firstModelId) ?: role.selection.model
                                draft = draft.copy(
                                    roles = draft.roles.mapIndexed { i, r ->
                                        if (i == index) r.copy(selection = r.selection.copy(agentKind = kind, model = nextModel))
                                        else r
                                    },
                                )
                            },
                        )
                    }
                    if (roleModels.size > 1) {
                        PoracodeChoiceSection(
                            label = stringResource(R.string.crews_role_model),
                            options = roleModels.take(6).map { (id, label) -> PoracodeChoiceOption(id, label) },
                            selectedId = role.selection.model,
                            onSelect = { model ->
                                draft = draft.copy(
                                    roles = draft.roles.mapIndexed { i, r ->
                                        if (i == index) r.copy(selection = r.selection.copy(model = model)) else r
                                    },
                                )
                            },
                        )
                    }
                    PoracodeToggleRow(
                        label = stringResource(R.string.rich_chat_crew_no_edits),
                        checked = role.noEdits,
                        onCheckedChange = { checked ->
                            draft = draft.copy(
                                roles = draft.roles.mapIndexed { i, r ->
                                    if (i == index) r.copy(noEdits = checked) else r
                                },
                            )
                        },
                    )
                }
            }
            if (draft.roles.size < SavedCrew.MAX_ROLES && installedAgents.isNotEmpty()) {
                OutlinedButton(
                    onClick = {
                        val fallback = installedAgents.first()
                        val model = SavedCrew.firstModelId(fallback) ?: draft.lead.model
                        draft = draft.copy(
                            roles = draft.roles + SavedCrewRole(
                                label = defaultRoleLabel,
                                selection = CrewMemberSelection(fallback.kind, model),
                            ),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.crews_add_role))
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.git_cancel)) }
                FilledTonalButton(
                    onClick = { onSave(draft) },
                    enabled = draft.isValid,
                ) {
                    Text(stringResource(R.string.workspace_save))
                }
            }
        }
    }
}

@Composable
internal fun SavedCrewPickerSheet(
    crews: List<SavedCrew>,
    selectedCrewId: String?,
    onSelect: (SavedCrew?) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.crews_title),
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (selectedCrewId != null) {
                OutlinedButton(
                    onClick = { onSelect(null) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.crews_clear_selection))
                }
            }
            if (crews.isEmpty()) {
                Text(
                    stringResource(R.string.crews_empty_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            } else {
                crews.sortedByDescending { it.favorite }.forEach { crew ->
                    val selected = crew.id == selectedCrewId
                    PoracodeCard {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    crew.name,
                                    style = PoracodeTextStyles.sheetTitle,
                                    color = if (selected) colors.accent else colors.foreground,
                                )
                                Text(
                                    "${crew.lead.agentKind}/${crew.lead.model} · ${stringResource(R.string.rich_chat_crew_helpers_count, crew.helperCount)}",
                                    style = PoracodeTextStyles.rowDescription,
                                    color = colors.muted,
                                )
                            }
                            FilledTonalButton(onClick = { onSelect(crew) }) {
                                Text(stringResource(if (selected) R.string.crews_selected else R.string.crews_use))
                            }
                        }
                    }
                }
            }
        }
    }
}
