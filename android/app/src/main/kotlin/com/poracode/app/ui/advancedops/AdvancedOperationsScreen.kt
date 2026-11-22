package com.poracode.app.ui.advancedops

import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.advancedops.AdvancedOpsProductionComposition
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.theme.PoracodeIcons
import androidx.compose.material3.FilledTonalButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdvancedOperationsScreen(
    composition: AdvancedOpsProductionComposition,
    defaultContentLanguage: String?,
    onBack: () -> Unit,
) {
    val appState by composition.appState.collectAsStateWithLifecycle()
    val owners by composition.owners.collectAsStateWithLifecycle()
    val projects = appState.snapshot?.projects.orEmpty().filter { it.disabled != true }
    var selectedName by rememberSaveable { mutableStateOf(AdvancedAction.CreateCheckpoint.name) }
    var showDetail by rememberSaveable { mutableStateOf(false) }
    val selected = AdvancedAction.entries.firstOrNull { it.name == selectedName }
        ?: AdvancedAction.CreateCheckpoint

    LaunchedEffect(projects.map { it.id }, owners.project?.projectId) {
        if (owners.project == null && projects.isNotEmpty()) {
            composition.selectProject(projects.first().id)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
        val bookHinge = com.poracode.app.ui.components.rememberBookHingeSplit(
            containerWidthDp = maxWidth,
            defaultSidebarWidthDp = 300.dp,
        )
        val expanded = (maxWidth >= 840.dp || bookHinge.isBookPosture) && fontScale < 1.5f
        val navigateBack = {
            if (!expanded && showDetail) showDetail = false else onBack()
        }
        val backModifier = rememberPredictiveBackModifier(onBack = navigateBack)
        Scaffold(
            modifier = backModifier,
            topBar = {
                PoracodeTopAppBar(
                    title = { Text(stringResource(R.string.advanced_ops_title)) },
                    navigationIcon = {
                        IconButton(onClick = navigateBack) {
                            Icon(
                                PoracodeIcons.ArrowBack,
                                stringResource(R.string.advanced_ops_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            if (expanded) {
                Row(
                    Modifier
                        .fillMaxSize()
                        .background(com.poracode.app.ui.theme.PoracodeTheme.colors.paneShell)
                        .padding(padding)
                        .padding(end = 8.dp, bottom = 8.dp),
                ) {
                    AdvancedActionList(
                        selected,
                        onSelect = { selectedName = it.name },
                        Modifier.width(bookHinge.sidebarWidthDp).fillMaxHeight(),
                    )
                    androidx.compose.foundation.layout.Spacer(
                        Modifier.width(if (bookHinge.hingeGapDp > 0.dp) bookHinge.hingeGapDp else 8.dp),
                    )
                    com.poracode.app.ui.components.PoracodePaneContainer(Modifier.weight(1f)) {
                        com.poracode.app.ui.components.PoracodeCenteredDetail(maxWidth = 760.dp) {
                            AdvancedOperationDetail(
                                selected,
                                composition,
                                projects,
                                owners.project?.projectId,
                                defaultContentLanguage,
                                Modifier.fillMaxSize().imePadding(),
                            )
                        }
                    }
                }
            } else if (showDetail) {
                AdvancedOperationDetail(
                    selected,
                    composition,
                    projects,
                    owners.project?.projectId,
                    defaultContentLanguage,
                    Modifier.fillMaxSize().padding(padding).imePadding(),
                )
            } else {
                AdvancedActionList(
                    selected,
                    onSelect = {
                        selectedName = it.name
                        showDetail = true
                    },
                    Modifier.fillMaxSize().padding(padding),
                )
            }
        }
    }
}

@Composable
private fun AdvancedActionList(
    selected: AdvancedAction,
    onSelect: (AdvancedAction) -> Unit,
    modifier: Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp),
    ) {
        item {
            Text(
                stringResource(R.string.advanced_ops_choose_action),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            )
        }
        items(AdvancedAction.entries, key = { it.operation.wireName }) { action ->
            com.poracode.app.ui.components.PoracodeDrawerNavItem(
                label = actionLabel(action),
                icon = PoracodeIcons.Build,
                selected = selected == action,
                onClick = { onSelect(action) },
            )
        }
    }
}

@Composable
internal fun AdvancedProjectPicker(
    projects: List<RemoteProject>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val selected = projects.firstOrNull { it.id == selectedId }
    Column(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.advanced_ops_project),
            style = MaterialTheme.typography.labelLarge,
        )
        FilledTonalButton(onClick = { expanded = true }, enabled = projects.isNotEmpty()) {
            Text(selected?.name ?: stringResource(R.string.advanced_ops_no_project))
            Icon(PoracodeIcons.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            projects.forEach { project ->
                DropdownMenuItem(
                    text = { Text(project.name) },
                    onClick = {
                        expanded = false
                        onSelect(project.id)
                    },
                )
            }
        }
    }
}

@Composable
internal fun actionLabel(action: AdvancedAction): String = stringResource(
    when (action) {
        AdvancedAction.CreateCheckpoint -> R.string.advanced_ops_create_checkpoint
        AdvancedAction.FinalizeCheckpoint -> R.string.advanced_ops_finalize_checkpoint
        AdvancedAction.SubscribeSubagent -> R.string.advanced_ops_subagent_subscribe
        AdvancedAction.UnsubscribeSubagent -> R.string.advanced_ops_subagent_unsubscribe
        AdvancedAction.StageThreadInput -> R.string.advanced_ops_stage_input
        AdvancedAction.WorkflowRun -> R.string.advanced_ops_workflow_run
        AdvancedAction.WorkflowAgentChat -> R.string.advanced_ops_workflow_chat
        AdvancedAction.ReadAbsoluteFile -> R.string.advanced_ops_read_absolute
        AdvancedAction.ReadExternalFile -> R.string.advanced_ops_read_external
        AdvancedAction.WriteExternalFile -> R.string.advanced_ops_write_external
        AdvancedAction.CreateProjectEntry -> R.string.advanced_ops_create_entry
        AdvancedAction.RenameProjectEntry -> R.string.advanced_ops_rename_entry
        AdvancedAction.MoveProjectEntry -> R.string.advanced_ops_move_entry
        AdvancedAction.DeleteProjectEntry -> R.string.advanced_ops_delete_entry
        AdvancedAction.GenerateCommitMessage -> R.string.advanced_ops_generate_commit
        AdvancedAction.GenerateTitle -> R.string.advanced_ops_generate_title
        AdvancedAction.GeneratePrSummary -> R.string.advanced_ops_generate_pr
    },
)
