package com.poracode.app.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadOperationResult
import com.poracode.app.session.threads.ThreadSessionRuntime
import java.util.UUID
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeOverlay(
    state: AppSession.UiState,
    threads: List<HostPresentation.UnifiedThreadItem>,
    runtime: ThreadSessionRuntime,
    onDismiss: () -> Unit,
    onStarted: (String) -> Unit,
) {
    val currentItems = remember(threads, state.hostCatalog.selectedConnectionId) {
        threads.filter { it.connectionId == state.hostCatalog.selectedConnectionId }
    }
    val projects = remember(state.snapshot?.projects, currentItems) {
        state.snapshot?.projects.orEmpty()
            .filter { it.disabled != true }
            .filter { HomeThreadListPresentation.launchDefaults(it, currentItems) != null }
            .sortedBy { it.name.lowercase() }
    }
    val latestProjectId = currentItems.firstOrNull()?.project?.id
    var projectId by rememberSaveable {
        mutableStateOf(latestProjectId ?: projects.firstOrNull()?.id.orEmpty())
    }
    var prompt by rememberSaveable { mutableStateOf("") }
    var menuExpanded by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    val controllerState by runtime.controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val project = projects.firstOrNull { it.id == projectId } ?: projects.firstOrNull()
    val defaults = project?.let { HomeThreadListPresentation.launchDefaults(it, currentItems) }
    val busy = controllerState.active != null

    LaunchedEffect(project?.id) {
        if (project != null) {
            focusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    BackHandler(onBack = onDismiss)
    val scrimInteraction = remember { MutableInteractionSource() }
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.32f))
                .clickable(
                    interactionSource = scrimInteraction,
                    indication = null,
                    onClick = onDismiss,
                ),
        )
        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .imePadding()
                .navigationBarsPadding()
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 3.dp,
            shadowElevation = 8.dp,
        ) {
            if (project != null && defaults != null) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ExposedDropdownMenuBox(
                            expanded = menuExpanded,
                            onExpandedChange = { menuExpanded = it },
                            modifier = Modifier.weight(1f),
                        ) {
                            Row(
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth()
                                    .clickable { menuExpanded = true }
                                    .padding(horizontal = 4.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(7.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.FolderOpen,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    project.name,
                                    modifier = Modifier.weight(1f),
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Icon(
                                    Icons.Outlined.ExpandMore,
                                    contentDescription = stringResource(R.string.home_project),
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                            ExposedDropdownMenu(
                                expanded = menuExpanded,
                                onDismissRequest = { menuExpanded = false },
                            ) {
                                projects.forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text(option.name) },
                                        onClick = {
                                            projectId = option.id
                                            menuExpanded = false
                                        },
                                    )
                                }
                            }
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(
                                Icons.Outlined.Close,
                                contentDescription = stringResource(R.string.cancel_pair_button),
                            )
                        }
                    }

                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it; failed = false },
                        placeholder = { Text(stringResource(R.string.home_quick_compose_prompt)) },
                        minLines = 4,
                        maxLines = 7,
                        shape = MaterialTheme.shapes.large,
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester)
                            .testTag("home_new_thread_prompt"),
                    )

                    if (failed) {
                        Text(
                            stringResource(R.string.home_new_thread_failed),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Text(
                            stringResource(R.string.home_agent_value, defaults.agentKind),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                        Text(
                            "·",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.outline,
                        )
                        Text(
                            stringResource(R.string.home_model_value, defaults.config.model),
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val canStart = prompt.isNotBlank() && !busy && state.canSessionOperate
                        FilledIconButton(
                            enabled = canStart,
                            modifier = Modifier.testTag("home_new_thread_start"),
                            onClick = {
                                val selectedProject = project
                                val selectedDefaults = defaults
                                val text = prompt.trim()
                                if (text.isEmpty()) return@FilledIconButton
                                val threadId = UUID.randomUUID().toString().lowercase()
                                scope.launch {
                                    val result = runtime.controller.execute(
                                        ThreadLifecycleCommand.Start(
                                            threadId = threadId,
                                            projectId = selectedProject.id,
                                            agentKind = selectedDefaults.agentKind,
                                            agentInstanceId = selectedDefaults.agentInstanceId,
                                            config = selectedDefaults.config,
                                            prompt = text,
                                            commandId = ThreadCommandId(UUID.randomUUID().toString()),
                                            presentationMode = ThreadPresentationMode.Gui,
                                            focus = true,
                                        ),
                                    )
                                    when (result) {
                                        is ThreadOperationResult.Success -> {
                                            onDismiss()
                                            onStarted(threadId)
                                        }
                                        else -> failed = true
                                    }
                                }
                            },
                        ) {
                            if (busy) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                )
                            } else {
                                Icon(
                                    Icons.Outlined.ArrowUpward,
                                    contentDescription = stringResource(R.string.home_start),
                                )
                            }
                        }
                    }
                }
            } else {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        stringResource(R.string.home_quick_compose_unavailable),
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.cancel_pair_button),
                        )
                    }
                }
            }
        }
    }
}
