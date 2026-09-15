package com.poracode.app.ui.richchat

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ThreadConfig

/** Segmented controls stay readable for the small, mutually exclusive option sets. */
internal fun usesSegmentedComposerChoice(options: List<RichChatComposerOption>): Boolean =
    options.size in 2..3

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RichChatComposerControlsSheet(
    configuration: ThreadConfig,
    catalog: RichChatComposerControlCatalog,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onSave: (ThreadConfig) -> Unit,
) {
    var draft by remember(configuration, catalog) {
        mutableStateOf(catalog.normalize(configuration))
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    stringResource(R.string.rich_chat_composer_controls),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    catalog.agentLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ComposerMenu(
                    label = stringResource(R.string.rich_chat_model),
                    options = catalog.models,
                    selection = draft.model,
                ) { draft = catalog.applyModel(draft, it) }

                val efforts = catalog.effortOptions(draft.model)
                if (efforts.size > 1) {
                    ComposerMenu(
                        label = stringResource(R.string.rich_chat_effort),
                        options = efforts,
                        selection = draft.effort ?: efforts.first().id,
                    ) { draft = draft.copy(effort = it) }
                }

                val contexts = catalog.contextOptions(draft.model)
                if (contexts.size > 1) {
                    ComposerMenu(
                        label = stringResource(R.string.rich_chat_context),
                        options = contexts,
                        selection = draft.contextSize ?: contexts.first().id,
                    ) { draft = draft.copy(contextSize = it) }
                }
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (catalog.supportsFast(draft.model)) {
                    ComposerToggleChip(
                        label = stringResource(R.string.rich_chat_fast_mode),
                        checked = draft.fast == true,
                    ) { draft = draft.copy(fast = it) }
                }
                if (catalog.supportsThinking(draft.model)) {
                    ComposerToggleChip(
                        label = stringResource(R.string.rich_chat_thinking),
                        checked = draft.thinking == true,
                    ) { draft = draft.copy(thinking = it) }
                }
            }

            if (catalog.modes.size > 1) {
                ComposerChoice(
                    label = stringResource(R.string.rich_chat_mode),
                    options = catalog.modes,
                    selection = draft.mode ?: catalog.modes.first().id,
                ) { draft = draft.copy(mode = it) }
            }
            if (catalog.approvalPolicies.size > 1) {
                ComposerChoice(
                    label = stringResource(R.string.rich_chat_permissions),
                    options = catalog.approvalPolicies,
                    selection = draft.approvalPolicy ?: catalog.approvalPolicies.first().id,
                ) { draft = draft.copy(approvalPolicy = it) }
            }

            HorizontalDivider()
            Text(
                stringResource(R.string.rich_chat_mcp_servers),
                style = MaterialTheme.typography.titleMedium,
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ComposerToggleChip(
                    label = stringResource(R.string.rich_chat_browser_mcp),
                    checked = draft.browserMcp == true,
                ) { draft = draft.copy(browserMcp = it) }
                ComposerToggleChip(
                    label = stringResource(R.string.rich_chat_crossagent_mcp),
                    checked = draft.crossagentMcp == true,
                ) { draft = draft.copy(crossagentMcp = it) }
                ComposerToggleChip(
                    label = stringResource(R.string.rich_chat_chrome_mcp),
                    checked = draft.chromeMcp == true,
                ) { draft = draft.copy(chromeMcp = it) }
                ComposerToggleChip(
                    label = stringResource(R.string.rich_chat_computer_use),
                    checked = draft.computerUse == true,
                ) { draft = draft.copy(computerUse = it) }
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
                Button(
                    onClick = { onSave(catalog.normalize(draft)) },
                    enabled = enabled,
                ) {
                    Text(stringResource(R.string.rich_chat_save))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ComposerMenu(
    label: String,
    options: List<RichChatComposerOption>,
    selection: String,
    onSelect: (String) -> Unit,
) {
    if (options.isEmpty()) return
    var expanded by remember(label, selection) { mutableStateOf(false) }
    val selected = options.firstOrNull { it.id == selection } ?: options.first()
    val selectionDescription = "$label: ${selected.label}"
    Box {
        AssistChip(
            onClick = { expanded = true },
            label = {
                Text(
                    selectionDescription,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            },
            trailingIcon = {
                Icon(Icons.Outlined.ExpandMore, contentDescription = null)
            },
            modifier = Modifier.semantics(mergeDescendants = true) {
                contentDescription = selectionDescription
            },
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    leadingIcon = if (option.id == selected.id) {
                        { Icon(Icons.Outlined.Check, contentDescription = null) }
                    } else {
                        null
                    },
                    onClick = {
                        onSelect(option.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun ComposerChoice(
    label: String,
    options: List<RichChatComposerOption>,
    selection: String,
    onSelect: (String) -> Unit,
) {
    if (options.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (usesSegmentedComposerChoice(options)) {
            Row(Modifier.horizontalScroll(rememberScrollState())) {
                SingleChoiceSegmentedButtonRow {
                    options.forEachIndexed { index, option ->
                        SegmentedButton(
                            selected = option.id == selection,
                            onClick = { onSelect(option.id) },
                            shape = SegmentedButtonDefaults.itemShape(index, options.size),
                        ) {
                            Text(
                                option.label,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        } else {
            ComposerMenu(label, options, selection, onSelect)
        }
    }
}

@Composable
private fun ComposerToggleChip(
    label: String,
    checked: Boolean,
    onChecked: (Boolean) -> Unit,
) {
    FilterChip(
        selected = checked,
        onClick = { onChecked(!checked) },
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingIcon = if (checked) {
            { Icon(Icons.Outlined.Check, contentDescription = null) }
        } else {
            null
        },
    )
}
