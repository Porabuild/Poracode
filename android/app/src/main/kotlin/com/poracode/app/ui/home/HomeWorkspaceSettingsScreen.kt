package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.storage.HomeWorkspace
import com.poracode.app.storage.HomeWorkspacePreferences
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeRowText
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTheme

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun HomeWorkspaceSettingsScreen(
    workspaces: HomeWorkspacePreferences,
    onBack: () -> Unit,
) {
    val state by workspaces.state.collectAsStateWithLifecycle()
    val colors = PoracodeTheme.colors
    var newName by rememberSaveable { mutableStateOf("") }
    var editingWorkspace by remember { mutableStateOf<HomeWorkspace?>(null) }
    var editName by remember { mutableStateOf("") }
    var editIcon by remember { mutableStateOf("briefcase") }
    val backModifier = rememberPredictiveBackModifier(onBack = onBack)

    Scaffold(
        modifier = backModifier,
        topBar = {
            PoracodeTopAppBar(
                title = { Text(stringResource(R.string.home_workspaces_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(PoracodeIcons.ArrowBack, stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                modifier = Modifier.widthIn(max = 720.dp).fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item("create") {
                    val density = androidx.compose.ui.platform.LocalDensity.current
                    val stackControls = density.fontScale >= 1.3f
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PoracodeSectionLabel(stringResource(R.string.home_add_workspace))
                        val addWorkspaceAction: () -> Unit = {
                            val created = workspaces.addWorkspace(newName)
                            if (created != null) {
                                newName = ""
                                workspaces.selectWorkspace(created)
                            }
                        }
                        if (stackControls) {
                            PoracodeTextField(
                                value = newName,
                                onValueChange = { newName = it },
                                placeholder = { Text(stringResource(R.string.home_workspace_name_placeholder)) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            com.poracode.app.ui.components.PoracodeActionButton(
                                label = stringResource(R.string.home_add_workspace_action),
                                variant = com.poracode.app.ui.components.PoracodeButtonVariant.Tonal,
                                enabled = state.canEdit && newName.isNotBlank(),
                                onClick = addWorkspaceAction,
                            )
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                PoracodeTextField(
                                    value = newName,
                                    onValueChange = { newName = it },
                                    placeholder = { Text(stringResource(R.string.home_workspace_name_placeholder)) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                com.poracode.app.ui.components.PoracodeActionButton(
                                    label = stringResource(R.string.home_add_workspace_action),
                                    variant = com.poracode.app.ui.components.PoracodeButtonVariant.Tonal,
                                    enabled = state.canEdit && newName.isNotBlank(),
                                    onClick = addWorkspaceAction,
                                )
                            }
                        }
                    }
                }

                item("list-header") {
                    PoracodeSectionLabel(
                        stringResource(R.string.home_workspaces_title),
                        Modifier.padding(top = 8.dp),
                    )
                }

                items(state.workspaces, key = { it.id }) { workspace ->
                    val isActive = workspace.id == state.resolvedActiveId()
                    PoracodeListRow(
                        selected = isActive,
                        onClick = { workspaces.selectWorkspace(workspace.id) },
                        onLongClick = if (state.canEdit) {
                            {
                                editingWorkspace = workspace
                                editName = workspace.name
                                editIcon = workspace.icon
                            }
                        } else {
                            null
                        },
                    ) {
                        Icon(
                            workspaceIcon(workspace.icon),
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = if (isActive) colors.foreground else colors.muted,
                        )
                        PoracodeRowText(title = workspace.name)
                        if (isActive) {
                            Icon(
                                PoracodeIcons.Check,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = colors.foreground,
                            )
                        }
                        if (state.canEdit) {
                            IconButton(
                                onClick = {
                                    editingWorkspace = workspace
                                    editName = workspace.name
                                    editIcon = workspace.icon
                                },
                                modifier = Modifier.size(PoracodeMetrics.tapTarget),
                            ) {
                                Icon(
                                    PoracodeIcons.Edit,
                                    contentDescription = stringResource(R.string.home_edit_workspace),
                                    modifier = Modifier.size(16.dp),
                                    tint = colors.muted,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    editingWorkspace?.let { target ->
        AlertDialog(
            onDismissRequest = { editingWorkspace = null },
            title = { Text(stringResource(R.string.home_edit_workspace)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PoracodeTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text(stringResource(R.string.home_workspace_name_placeholder)) },
                        singleLine = true,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        HomeWorkspacePreferences.AVAILABLE_ICONS.forEach { iconName ->
                            val selected = iconName == editIcon
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (selected) colors.rowActive else colors.listRow)
                                    .border(
                                        1.dp,
                                        if (selected) colors.foreground else colors.hairline,
                                        RoundedCornerShape(8.dp),
                                    )
                                    .clickable(role = Role.Button, onClick = { editIcon = iconName }),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    workspaceIcon(iconName),
                                    contentDescription = iconName,
                                    modifier = Modifier.size(18.dp),
                                    tint = if (selected) colors.foreground else colors.muted,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        workspaces.renameWorkspace(target.id, editName)
                        workspaces.setWorkspaceIcon(target.id, editIcon)
                        editingWorkspace = null
                    },
                    enabled = editName.isNotBlank(),
                ) {
                    Text(stringResource(R.string.save))
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (state.workspaces.size > 1) {
                        TextButton(
                            onClick = {
                                workspaces.removeWorkspace(target.id)
                                editingWorkspace = null
                            },
                        ) {
                            Text(
                                stringResource(R.string.delete),
                                color = colors.danger,
                            )
                        }
                    }
                    TextButton(onClick = { editingWorkspace = null }) {
                        Text(stringResource(android.R.string.cancel))
                    }
                }
            },
        )
    }
}
