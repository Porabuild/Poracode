package com.poracode.app.ui.crews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilledTonalButton
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
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.ui.components.ModelVisibility
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeChoiceOption
import com.poracode.app.ui.components.PoracodeChoiceSection
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeToggleRow
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.serialization.json.JsonObject

@Composable
internal fun SavedCrewEditorSheet(
    initial: SavedCrew,
    agents: List<AgentStatusEntry>,
    onDismiss: () -> Unit,
    onSave: (SavedCrew) -> Unit,
    hiddenModels: JsonObject? = null,
    crossagentHiddenModels: JsonObject? = null,
) {
    var draft by remember(initial) { mutableStateOf(initial) }
    val installedAgents = remember(agents) { agents.filter { it.installed } }
    val leadHiddenFor: (AgentStatusEntry) -> Set<String> = { agent ->
        ModelVisibility.hiddenModelIds(
            agent.capabilities,
            hiddenModels,
            agent.kind,
            ModelVisibility.declaredGuiVariant(agent),
        )
    }
    val helperHiddenFor: (AgentStatusEntry) -> Set<String> = { agent ->
        ModelVisibility.helperHiddenModelIds(hiddenModels, crossagentHiddenModels, agent.kind)
    }
    val leadAgent = installedAgents.firstOrNull { it.kind == draft.lead.agentKind } ?: installedAgents.firstOrNull()
    val leadAgentChoices = installedAgents.filter {
        it.kind == draft.lead.agentKind || firstVisibleModelId(it, leadHiddenFor(it)) != null
    }
    val leadHidden = leadAgent?.let(leadHiddenFor).orEmpty()
    val leadModels = remember(leadAgent, leadHidden, draft.lead.model) {
        leadAgent?.let { visibleAgentModelOptions(it, leadHidden, draft.lead.model) }.orEmpty()
    }
    val canAddRole = installedAgents.any { firstVisibleModelId(it, helperHiddenFor(it)) != null }
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
            if (leadAgentChoices.isNotEmpty()) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_crew_lead),
                    options = leadAgentChoices.map { PoracodeChoiceOption(it.kind, it.label) },
                    selectedId = draft.lead.agentKind,
                    onSelect = { kind ->
                        val nextAgent = leadAgentChoices.firstOrNull { it.kind == kind }
                        val nextModel = nextAgent?.let {
                            firstVisibleModelId(it, leadHiddenFor(it)) ?: draft.lead.model
                        } ?: draft.lead.model
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
                val roleAgentChoices = installedAgents.filter {
                    it.kind == role.selection.agentKind ||
                        firstVisibleModelId(it, helperHiddenFor(it)) != null
                }
                val roleHidden = roleAgent?.let(helperHiddenFor).orEmpty()
                val roleModels = roleAgent?.let {
                    visibleAgentModelOptions(it, roleHidden, role.selection.model)
                }.orEmpty()
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
                    if (roleAgentChoices.size > 1) {
                        PoracodeChoiceSection(
                            label = stringResource(R.string.crews_role_agent),
                            options = roleAgentChoices.map { PoracodeChoiceOption(it.kind, it.label) },
                            selectedId = role.selection.agentKind,
                            onSelect = { kind ->
                                val nextAgent = roleAgentChoices.firstOrNull { it.kind == kind }
                                val nextModel = nextAgent?.let {
                                    firstVisibleModelId(it, helperHiddenFor(it)) ?: role.selection.model
                                } ?: role.selection.model
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
            if (draft.roles.size < SavedCrew.MAX_ROLES && canAddRole) {
                OutlinedButton(
                    onClick = {
                        val fallback = installedAgents.firstOrNull {
                            firstVisibleModelId(it, helperHiddenFor(it)) != null
                        } ?: return@OutlinedButton
                        val model = firstVisibleModelId(fallback, helperHiddenFor(fallback))
                            ?: return@OutlinedButton
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
