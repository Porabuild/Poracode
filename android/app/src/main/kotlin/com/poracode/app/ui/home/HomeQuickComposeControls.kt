package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadPresentationMode

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeControlsSheet(
    configuration: ThreadConfig,
    catalog: HomeQuickComposeCatalog,
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
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.home_quick_compose_controls),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Text(
                catalog.agentLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            HomeQuickComposeDropdown(
                label = stringResource(R.string.rich_chat_model),
                options = catalog.models,
                selection = draft.model,
                onSelect = { draft = catalog.applyModel(draft, it) },
            )

            val efforts = catalog.effortOptions(draft.model)
            if (efforts.size > 1) {
                HomeQuickComposeDropdown(
                    label = stringResource(R.string.rich_chat_effort),
                    options = efforts,
                    selection = draft.effort ?: efforts.first().id,
                    onSelect = { draft = draft.copy(effort = it) },
                )
            }
            val contexts = catalog.contextOptions(draft.model)
            if (contexts.size > 1) {
                HomeQuickComposeDropdown(
                    label = stringResource(R.string.rich_chat_context),
                    options = contexts,
                    selection = draft.contextSize ?: contexts.first().id,
                    onSelect = { draft = draft.copy(contextSize = it) },
                )
            }
            if (catalog.supportsFast(draft.model)) {
                HomeQuickComposeToggleRow(
                    label = stringResource(R.string.rich_chat_fast_mode),
                    checked = draft.fast == true,
                ) { draft = draft.copy(fast = it) }
            }
            if (catalog.supportsThinking(draft.model)) {
                HomeQuickComposeToggleRow(
                    label = stringResource(R.string.rich_chat_thinking),
                    checked = draft.thinking == true,
                ) { draft = draft.copy(thinking = it) }
            }
            if (catalog.modes.size > 1) {
                HomeQuickComposeDropdown(
                    label = stringResource(R.string.rich_chat_mode),
                    options = catalog.modes,
                    selection = draft.mode ?: catalog.modes.first().id,
                    onSelect = { draft = draft.copy(mode = it) },
                )
            }
            if (catalog.approvalPolicies.size > 1) {
                HomeQuickComposeDropdown(
                    label = stringResource(R.string.rich_chat_permissions),
                    options = catalog.approvalPolicies,
                    selection = draft.approvalPolicy ?: catalog.approvalPolicies.first().id,
                    onSelect = { draft = draft.copy(approvalPolicy = it) },
                )
            }

            HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
            Text(
                stringResource(R.string.rich_chat_mcp_servers),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            HomeQuickComposeToggleRow(
                label = stringResource(R.string.rich_chat_browser_mcp),
                checked = draft.browserMcp == true,
            ) { draft = draft.copy(browserMcp = it) }
            HomeQuickComposeToggleRow(
                label = stringResource(R.string.rich_chat_crossagent_mcp),
                checked = draft.crossagentMcp == true,
            ) { draft = draft.copy(crossagentMcp = it) }
            HomeQuickComposeToggleRow(
                label = stringResource(R.string.rich_chat_chrome_mcp),
                checked = draft.chromeMcp == true,
            ) { draft = draft.copy(chromeMcp = it) }
            HomeQuickComposeToggleRow(
                label = stringResource(R.string.rich_chat_computer_use),
                checked = draft.computerUse == true,
            ) { draft = draft.copy(computerUse = it) }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
                Button(
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeDropdown(
    label: String,
    options: List<HomeQuickComposeOption>,
    selection: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (options.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    val selected = options.firstOrNull { it.id == selection } ?: options.first()
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = selected.label,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
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
private fun HomeQuickComposeToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = { Switch(checked = checked, onCheckedChange = null) },
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(
                value = checked,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            ),
    )
}
