package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ThreadConfig
import com.poracode.app.ui.components.PoracodeChoiceOption
import com.poracode.app.ui.components.PoracodeChoiceSection
import com.poracode.app.ui.components.PoracodeOptionList
import com.poracode.app.ui.components.PoracodeOptionRow
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeToggleRow
import com.poracode.app.ui.components.modelFamilySelectorLabel
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import androidx.compose.material3.FilledTonalButton

/** Segmented controls stay readable for the small, mutually exclusive option sets. */
internal fun usesSegmentedComposerChoice(options: List<RichChatComposerOption>): Boolean =
    options.size in 2..3

/**
 * Deep-link target for the unified controls sheet: scroll it to a section so a
 * composer "+" entry can land on Mode, the first-party plugin toggles, or the
 * custom MCP server overrides without splitting the sheet into per-item
 * surfaces. Plugins and MCP Servers stay distinct sections, as in the PWA.
 */
internal enum class RichChatComposerControlsFocus { MODE, PLUGINS, MCP_SERVERS }

@Composable
internal fun RichChatComposerControlsSheet(
    configuration: ThreadConfig,
    catalog: RichChatComposerControlCatalog,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onSave: (ThreadConfig) -> Unit,
    hasStartedSession: Boolean = false,
    focusSection: RichChatComposerControlsFocus? = null,
) {
    var draft by remember(configuration, catalog) {
        mutableStateOf(catalog.normalize(configuration))
    }
    var pendingContextChange by remember { mutableStateOf<ThreadConfig?>(null) }
    var modelQuery by remember { mutableStateOf("") }
    val colors = PoracodeTheme.colors
    val scrollState = rememberScrollState()
    val modeRequester = remember { BringIntoViewRequester() }
    val pluginsRequester = remember { BringIntoViewRequester() }
    val mcpRequester = remember { BringIntoViewRequester() }
    LaunchedEffect(focusSection, catalog.modes.size) {
        when (focusSection) {
            RichChatComposerControlsFocus.MODE ->
                if (catalog.modes.size > 1) modeRequester.bringIntoView()
            RichChatComposerControlsFocus.PLUGINS -> pluginsRequester.bringIntoView()
            RichChatComposerControlsFocus.MCP_SERVERS -> mcpRequester.bringIntoView()
            null -> Unit
        }
    }
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.rich_chat_composer_controls),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                catalog.agentLabel,
                style = PoracodeTextStyles.rowDescription,
                color = colors.muted,
                modifier = Modifier.padding(start = 4.dp),
            )

            PoracodeSectionLabel(stringResource(R.string.rich_chat_model))
            val modelOptions = catalog.modelEntries
                .filterIsInstance<RichChatComposerModelEntry.Model>()
                .map { entry ->
                    PoracodeChoiceOption(
                        entry.option.id,
                        entry.option.label,
                        entry.option.modelDescription,
                    )
                }
            if (modelOptions.size > 6) {
                PoracodeTextField(
                    value = modelQuery,
                    onValueChange = { modelQuery = it },
                    placeholder = {
                        Text(stringResource(R.string.rich_chat_search_models))
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (modelQuery.isBlank()) {
                catalog.modelEntries.forEach { entry ->
                    when (entry) {
                        is RichChatComposerModelEntry.Heading -> Text(
                            entry.label,
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.muted,
                            modifier = Modifier.padding(start = 12.dp, top = 4.dp),
                        )
                        is RichChatComposerModelEntry.Model -> PoracodeOptionRow(
                            option = PoracodeChoiceOption(
                                entry.option.id,
                                entry.option.label,
                                entry.option.modelDescription,
                            ),
                            selected = entry.option.id == catalog.displaySelectionId(draft),
                            onClick = { draft = catalog.applyModel(draft, entry.option.id) },
                        )
                    }
                }
            } else {
                val visible = modelOptions.filter {
                    it.label.contains(modelQuery, ignoreCase = true)
                }
                PoracodeOptionList(
                    options = visible,
                    selectedId = catalog.displaySelectionId(draft),
                    onSelect = { draft = catalog.applyModel(draft, it) },
                )
            }

            catalog.selectorMenus(draft).forEach { selector ->
                PoracodeChoiceSection(
                    label = modelFamilySelectorLabel(selector.labelKey),
                    options = selector.options.map { option ->
                        PoracodeChoiceOption(option.id, option.label)
                    },
                    selectedId = selector.selectionId,
                    onSelect = { draft = catalog.applySelector(draft, selector.selectorId, it) },
                )
            }

            val efforts = catalog.effortOptions(draft.model)
            if (efforts.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_effort),
                    options = efforts.map {
                        PoracodeChoiceOption(it.id, it.label, it.modelDescription)
                    },
                    selectedId = catalog.displayEffort(draft) ?: efforts.first().id,
                    onSelect = { draft = catalog.applyEffort(draft, it) },
                )
            }
            val contexts = catalog.contextOptions(draft.model)
            if (contexts.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_context),
                    options = contexts.map {
                        PoracodeChoiceOption(it.id, it.label, it.modelDescription)
                    },
                    selectedId = draft.contextSize ?: contexts.first().id,
                    onSelect = { draft = draft.copy(contextSize = it) },
                )
            }
            if (catalog.supportsFast(draft.model)) {
                PoracodeToggleRow(
                    label = stringResource(R.string.rich_chat_fast_mode),
                    checked = catalog.displayFast(draft) == true,
                ) { draft = catalog.applyFast(draft, it) }
            }
            if (catalog.supportsThinking(draft.model)) {
                PoracodeToggleRow(
                    label = stringResource(R.string.rich_chat_thinking),
                    checked = draft.thinking == true,
                ) { draft = draft.copy(thinking = it) }
            }
            if (catalog.supportsWorkflows(draft.model)) {
                PoracodeToggleRow(
                    label = catalog.workflowLabel ?: stringResource(R.string.rich_chat_workflows),
                    checked = draft.workflows == true,
                ) { draft = draft.copy(workflows = it) }
            }
            if (catalog.modes.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_mode),
                    options = catalog.modes.map {
                        PoracodeChoiceOption(it.id, it.label, it.modelDescription)
                    },
                    selectedId = draft.mode ?: catalog.modes.first().id,
                    onSelect = { draft = draft.copy(mode = it) },
                    modifier = Modifier.bringIntoViewRequester(modeRequester),
                )
            }
            if (catalog.approvalPolicies.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.rich_chat_permissions),
                    options = catalog.approvalPolicies.map {
                        PoracodeChoiceOption(it.id, it.label, it.modelDescription)
                    },
                    selectedId = draft.approvalPolicy ?: catalog.approvalPolicies.first().id,
                    onSelect = { draft = draft.copy(approvalPolicy = it) },
                )
            }

            PoracodeSheetDivider()
            // First-party plugin servers (Browser, Crossagents, Chrome) plus
            // Computer Use, matching the PWA Plugins submenu.
            PoracodeSectionLabel(
                stringResource(R.string.rich_chat_plugins),
                modifier = Modifier.bringIntoViewRequester(pluginsRequester),
            )
            PoracodeToggleRow(
                label = stringResource(R.string.rich_chat_browser_mcp),
                checked = draft.browserMcp == true,
            ) { draft = draft.copy(browserMcp = it) }
            PoracodeToggleRow(
                label = stringResource(R.string.rich_chat_crossagent_mcp),
                checked = draft.crossagentMcp == true,
            ) { draft = draft.copy(crossagentMcp = it) }
            PoracodeToggleRow(
                label = stringResource(R.string.rich_chat_chrome_mcp),
                checked = draft.chromeMcp == true,
            ) { draft = draft.copy(chromeMcp = it) }
            PoracodeToggleRow(
                label = stringResource(R.string.rich_chat_computer_use),
                checked = draft.computerUse == true,
            ) { draft = draft.copy(computerUse = it) }

            // User-configured servers. The composer has no server inventory of
            // its own (Settings owns discovery), so this section edits the
            // per-thread overrides the thread already carries.
            PoracodeSectionLabel(
                stringResource(R.string.rich_chat_mcp_servers),
                modifier = Modifier.bringIntoViewRequester(mcpRequester),
            )
            val mcpOverrides = draft.mcpServerOverrides.orEmpty()
            if (mcpOverrides.isEmpty()) {
                Text(
                    stringResource(R.string.settings_integrations_no_mcp_servers),
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    modifier = Modifier.padding(start = 4.dp),
                )
            } else {
                mcpOverrides.entries.sortedBy { it.key }.forEach { (serverId, serverEnabled) ->
                    PoracodeToggleRow(
                        label = serverId,
                        checked = serverEnabled,
                    ) { next ->
                        draft = draft.copy(
                            mcpServerOverrides = mcpOverrides + (serverId to next),
                        )
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
                FilledTonalButton(
                    onClick = {
                        val next = catalog.normalize(draft)
                        if (catalog.confirmsContextChange(configuration, next, hasStartedSession)) {
                            pendingContextChange = next
                        } else {
                            onSave(next)
                        }
                    },
                    enabled = enabled,
                ) {
                    Text(stringResource(R.string.rich_chat_save))
                }
            }
        }
    }
    pendingContextChange?.let { next ->
        AlertDialog(
            onDismissRequest = { pendingContextChange = null },
            title = { Text(stringResource(R.string.rich_chat_context)) },
            text = {
                val body = stringResource(R.string.rich_chat_context_reload_body)
                val warning = stringResource(R.string.rich_chat_context_reload_stops_subagents)
                Text(if (catalog.contextSizeReloadStopsSubagents) "$body\n\n$warning" else body)
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingContextChange = null
                    onSave(next)
                }) { Text(stringResource(R.string.rich_chat_save)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingContextChange = null }) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
            },
        )
    }
}
