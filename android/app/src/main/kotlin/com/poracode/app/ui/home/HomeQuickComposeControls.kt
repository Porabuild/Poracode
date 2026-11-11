package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
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
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.ui.components.PoracodeChoiceOption
import com.poracode.app.ui.components.PoracodeChoiceSection
import com.poracode.app.ui.components.PoracodeOptionList
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeToggleRow
import com.poracode.app.ui.components.modelFamilySelectorLabel
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import androidx.compose.material3.FilledTonalButton

@Composable
internal fun homeQuickComposePresentationOptions(
    availableModes: List<ThreadPresentationMode>,
): List<HomeQuickComposeOption> = listOfNotNull(
    ThreadPresentationMode.Gui.takeIf { it in availableModes }?.let {
        HomeQuickComposeOption(it.wireValue, stringResource(R.string.home_quick_compose_chat))
    },
    ThreadPresentationMode.Terminal.takeIf { it in availableModes }?.let {
        HomeQuickComposeOption(it.wireValue, stringResource(R.string.home_quick_compose_terminal))
    },
)

@Composable
internal fun HomeQuickComposeControlsSheet(
    configuration: ThreadConfig,
    catalog: HomeQuickComposeCatalog,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onSave: (ThreadConfig) -> Unit,
    availableModes: List<ThreadPresentationMode> = emptyList(),
    selectedMode: ThreadPresentationMode = ThreadPresentationMode.Gui,
    onModeSelected: (String) -> Unit = {},
) {
    var draft by remember(configuration, catalog) {
        mutableStateOf(catalog.normalize(configuration))
    }
    var modelQuery by remember { mutableStateOf("") }
    val colors = PoracodeTheme.colors
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.home_quick_compose_controls),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                catalog.agentLabel,
                style = PoracodeTextStyles.rowDescription,
                color = colors.muted,
                modifier = Modifier.padding(start = 4.dp),
            )
            if (availableModes.size > 1) {
                PoracodeChoiceSection(
                    label = stringResource(R.string.home_quick_compose_presentation),
                    options = homeQuickComposePresentationOptions(availableModes).map {
                        PoracodeChoiceOption(it.id, it.label)
                    },
                    selectedId = selectedMode.wireValue,
                    onSelect = onModeSelected,
                )
            }
            PoracodeSectionLabel(stringResource(R.string.rich_chat_model))
            val modelOptions = catalog.models.map { option ->
                PoracodeChoiceOption(option.id, option.label, option.modelDescription)
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
            val visibleModels = if (modelQuery.isBlank()) {
                modelOptions
            } else {
                modelOptions.filter {
                    it.label.contains(modelQuery, ignoreCase = true)
                }
            }
            PoracodeOptionList(
                options = visibleModels,
                selectedId = catalog.displaySelectionId(draft),
                onSelect = { draft = catalog.applyModel(draft, it) },
            )

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
            // First-party plugins, then custom-server overrides, as in the
            // thread composer controls and the PWA.
            PoracodeSectionLabel(stringResource(R.string.rich_chat_plugins))
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

            PoracodeSectionLabel(stringResource(R.string.rich_chat_mcp_servers))
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
                Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.rich_chat_cancel),
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                FilledTonalButton(
                    onClick = { onSave(catalog.normalize(draft)) },
                    enabled = enabled,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(R.string.rich_chat_save))
                }
            }
        }
    }
}
