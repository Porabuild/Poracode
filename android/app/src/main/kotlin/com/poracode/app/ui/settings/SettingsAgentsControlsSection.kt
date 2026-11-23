package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.session.replay.HostReplayCacheUi
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.crews.agentModelOptions
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

internal data class AgentsSettingsConfig(
    val disabledAgents: Set<String> = emptySet(),
    val hiddenModels: Map<String, Set<String>> = emptyMap(),
    val providerOrder: List<String> = emptyList(),
) {
    companion object {
        fun from(snapshot: HostSettingsSnapshot?): AgentsSettingsConfig {
            val raw = snapshot?.settings ?: return AgentsSettingsConfig()
            val disabled = (raw["disabledAgents"] as? JsonArray).orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                .toSet()
            val hidden = (raw["hiddenModels"] as? JsonObject).orEmpty().mapValues { (_, v) ->
                (v as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()
            }
            val order = (raw["providerOrder"] as? JsonArray).orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                .distinct()
            return AgentsSettingsConfig(disabled, hidden, order)
        }
    }
}

@Composable
internal fun SettingsAgentsControlsSection(
    settings: HostSettingsSnapshot?,
    replayCache: HostReplayCacheUi,
    canWrite: Boolean,
    onSaveSettings: (HostSettingsPatch) -> Unit,
) {
    val installedAgents = remember(replayCache) {
        (replayCache.agentWindowsStatuses + replayCache.agentWslStatuses + replayCache.agentMergedStatuses.values)
            .distinctBy { it.kind }
            .filter { it.installed }
    }
    if (installedAgents.isEmpty()) return
    val config = remember(settings) { AgentsSettingsConfig.from(settings) }
    val orderedAgents = remember(installedAgents, config.providerOrder) {
        val byKind = installedAgents.associateBy { it.kind }
        val configured = config.providerOrder.mapNotNull { byKind[it] }
        val configuredKinds = configured.map { it.kind }.toSet()
        configured + installedAgents.filterNot { it.kind in configuredKinds }
            .sortedBy { it.label.lowercase() }
    }
    var showModelVisibility by remember { mutableStateOf(false) }
    var showAcpRegistry by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SettingsSection(stringResource(R.string.settings_agents_enabled_title)) {
            orderedAgents.forEach { agent ->
                val enabled = agent.kind !in config.disabledAgents
                SettingsSwitchRow(
                    label = agent.label,
                    checked = enabled,
                    enabled = canWrite && settings != null,
                    onChange = { nextEnabled ->
                        val nextDisabled = if (nextEnabled) {
                            config.disabledAgents - agent.kind
                        } else {
                            config.disabledAgents + agent.kind
                        }
                        onSaveSettings(
                            HostSettingsPatch.from(
                                buildJsonObject {
                                    put(
                                        "disabledAgents",
                                        buildJsonArray { nextDisabled.sorted().forEach { add(JsonPrimitive(it)) } },
                                    )
                                },
                            ),
                        )
                    },
                )
            }
        }

        val totalModels = remember(orderedAgents) { orderedAgents.sumOf { agentModelOptions(it).size } }
        if (totalModels > 0) {
            val hiddenCount = remember(orderedAgents, config.hiddenModels) {
                orderedAgents.sumOf { agent ->
                    val hidden = config.hiddenModels[agent.kind].orEmpty()
                    agentModelOptions(agent).count { (id, _) -> id in hidden }
                }
            }
            SettingsSection(stringResource(R.string.settings_agents_visible_models)) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        stringResource(
                            R.string.settings_agents_visible_models_count,
                            (totalModels - hiddenCount).coerceAtLeast(0),
                            totalModels,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = PoracodeTheme.colors.muted,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        onClick = { showModelVisibility = true },
                        enabled = settings != null,
                    ) {
                        Text(stringResource(R.string.settings_agents_manage_models))
                    }
                }
            }
        }

        if (orderedAgents.size > 1) {
            SettingsSection(stringResource(R.string.settings_agents_provider_order)) {
                orderedAgents.forEachIndexed { index, agent ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            agent.label,
                            style = PoracodeTextStyles.rowTitle,
                            color = PoracodeTheme.colors.foreground,
                            modifier = Modifier.weight(1f),
                        )
                        PoracodeIconButton(
                            icon = PoracodeIcons.ArrowUpward,
                            contentDescription = stringResource(R.string.settings_home_shortcut_move_up, agent.label),
                            enabled = canWrite && settings != null && index > 0,
                            onClick = {
                                val next = orderedAgents.map { it.kind }.toMutableList()
                                val item = next.removeAt(index)
                                next.add(index - 1, item)
                                onSaveSettings(
                                    HostSettingsPatch.from(
                                        buildJsonObject {
                                            put("providerOrder", buildJsonArray { next.forEach { add(JsonPrimitive(it)) } })
                                        },
                                    ),
                                )
                            },
                        )
                        PoracodeIconButton(
                            icon = PoracodeIcons.ArrowDown,
                            contentDescription = stringResource(R.string.settings_home_shortcut_move_down, agent.label),
                            enabled = canWrite && settings != null && index < orderedAgents.lastIndex,
                            onClick = {
                                val next = orderedAgents.map { it.kind }.toMutableList()
                                val item = next.removeAt(index)
                                next.add(index + 1, item)
                                onSaveSettings(
                                    HostSettingsPatch.from(
                                        buildJsonObject {
                                            put("providerOrder", buildJsonArray { next.forEach { add(JsonPrimitive(it)) } })
                                        },
                                    ),
                                )
                            },
                        )
                    }
                }
            }
        }
        OutlinedButton(onClick = { showAcpRegistry = true }, modifier = Modifier.fillMaxWidth()) {
            Text("ACP Registry")
        }
    }

    if (showAcpRegistry) {
        PoracodeSheet(onDismissRequest = { showAcpRegistry = false }, title = "ACP Registry") {
            AcpRegistryManagementPane(modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp))
        }
    }
    if (showModelVisibility) {
        ModelVisibilitySheet(
            agents = orderedAgents,
            hiddenModels = config.hiddenModels,
            canWrite = canWrite,
            onToggleModel = { agentKind, modelId, visible ->
                val currentHidden = config.hiddenModels[agentKind].orEmpty()
                val nextAgentHidden = if (visible) currentHidden - modelId else currentHidden + modelId
                val nextMap = config.hiddenModels.toMutableMap()
                if (nextAgentHidden.isEmpty()) nextMap.remove(agentKind)
                else nextMap[agentKind] = nextAgentHidden
                onSaveSettings(
                    HostSettingsPatch.from(
                        buildJsonObject {
                            put(
                                "hiddenModels",
                                buildJsonObject {
                                    nextMap.forEach { (kind, ids) ->
                                        put(kind, buildJsonArray { ids.sorted().forEach { add(JsonPrimitive(it)) } })
                                    }
                                },
                            )
                        },
                    ),
                )
            },
            onDismiss = { showModelVisibility = false },
        )
    }
}

@Composable
private fun ModelVisibilitySheet(
    agents: List<AgentStatusEntry>,
    hiddenModels: Map<String, Set<String>>,
    canWrite: Boolean,
    onToggleModel: (agentKind: String, modelId: String, visible: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.settings_agents_visible_models),
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            agents.forEach { agent ->
                val models = agentModelOptions(agent)
                if (models.isNotEmpty()) {
                    SettingsSection(agent.label) {
                        val hidden = hiddenModels[agent.kind].orEmpty()
                        models.forEach { (id, label) ->
                            SettingsSwitchRow(
                                label = label,
                                checked = id !in hidden,
                                enabled = canWrite,
                                onChange = { visible -> onToggleModel(agent.kind, id, visible) },
                            )
                        }
                    }
                }
            }
        }
    }
}
