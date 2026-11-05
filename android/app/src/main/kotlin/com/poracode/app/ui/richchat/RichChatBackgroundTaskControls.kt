@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.poracode.app.ui.richchat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PlayCircleOutline
import androidx.compose.material.icons.outlined.Radio
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.protocol.BackgroundTask
import com.poracode.app.session.richchat.RichChatBackgroundTaskOutput
import com.poracode.app.session.richchat.RichChatBackgroundTaskStopState
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.RichChatThreadLease
import com.poracode.app.session.richchat.richChatBackgroundTaskReadKey
import com.poracode.app.session.richchat.richChatBackgroundTaskStopKey
import java.text.NumberFormat
import kotlinx.coroutines.delay

/**
 * Native background-task section for the rich-chat control/composer area.
 * Lists authoritative live work from `background_tasks.changed`; sub-agent and
 * workflow cards keep their own surfaces. A row opens the single detail sheet.
 */
@Composable
internal fun RichBackgroundTasksCard(
    tasks: List<BackgroundTask>,
    actionIds: List<String>?,
    stopState: RichChatBackgroundTaskStopState,
    selection: RichChatThreadLease?,
    canOperate: Boolean,
    busy: Boolean,
    onOpenTask: (BackgroundTask) -> Unit,
    onStopTask: (BackgroundTask) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (tasks.isEmpty()) return
    Card(modifier.fillMaxWidth().testTag("background-tasks-panel")) {
        Column(
            Modifier
                .heightIn(max = 240.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                stringResource(R.string.rich_chat_background_tasks),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(bottom = 4.dp),
            )
            tasks.forEach { task ->
                RichBackgroundTaskRow(
                    task = task,
                    actionIds = actionIds,
                    stopState = stopState,
                    selection = selection,
                    canOperate = canOperate,
                    busy = busy,
                    onOpen = { onOpenTask(task) },
                    onStop = { onStopTask(task) },
                )
            }
        }
    }
}

@Composable
private fun RichBackgroundTaskRow(
    task: BackgroundTask,
    actionIds: List<String>?,
    stopState: RichChatBackgroundTaskStopState,
    selection: RichChatThreadLease?,
    canOperate: Boolean,
    busy: Boolean,
    onOpen: () -> Unit,
    onStop: () -> Unit,
) {
    val presentation = RichChatBackgroundTaskLogic.presentation(task)
    val label = presentation.label ?: stringResource(R.string.rich_chat_background_task)
    val typeLabel = taskCategoryLabel(presentation.category)
    val age = taskAgeLabel(task.startedAt)
    val metadata = listOfNotNull(typeLabel, age, presentation.progress).joinToString(" · ")
    val stopAction = task.stopAction
    val stopListed = stopAction?.let { it.id in (actionIds ?: emptyList()) } == true
    val stopKey = selection?.let { richChatBackgroundTaskStopKey(it, task) }
    val stopping = stopKey != null && stopState.key == stopKey && stopState.pending
    val stopFailure = stopState.failure.takeIf { stopKey != null && stopState.key == stopKey }
    val description = listOf(typeLabel, label, age, presentation.progress)
        .filterNotNull()
        .joinToString(", ")
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("background-task-open:${task.taskId}")
                .clickable(onClick = onOpen)
                .semantics(mergeDescendants = true) { contentDescription = description }
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                taskCategoryIcon(presentation.category),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (metadata.isNotEmpty()) {
                    Text(
                        metadata,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (stopListed) {
                IconButton(
                    onClick = onStop,
                    enabled = canOperate && !busy && !stopping,
                    modifier = Modifier.testTag("background-task-stop-row:${task.taskId}"),
                ) {
                    Icon(
                        Icons.Outlined.Stop,
                        contentDescription = stringResource(
                            if (stopping) R.string.rich_chat_background_task_stopping
                            else R.string.rich_chat_background_task_stop,
                        ),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
        stopFailure?.let { failure ->
            Text(
                backgroundTaskStopFailureText(failure),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(start = 28.dp, bottom = 6.dp),
            )
        }
    }
}

/**
 * Single selected-task detail surface. Output polls only while this sheet is
 * composed, the lifecycle is foreground, and the live inventory advertises the
 * read action; every read is serialized and identity-fenced by the controller.
 */
@Composable
internal fun RichChatBackgroundTaskDetailsSheet(
    runtime: RichChatSessionRuntime,
    task: BackgroundTask,
    selection: RichChatThreadLease?,
    actionIds: List<String>?,
    canOperate: Boolean,
    onStopTask: (BackgroundTask) -> Unit,
    onDismiss: () -> Unit,
) {
    val foreground by runtime.foreground.collectAsStateWithLifecycle()
    val hostLease by runtime.hostLease.collectAsStateWithLifecycle()
    val outputState by runtime.backgroundTasks.output.collectAsStateWithLifecycle()
    val stopState by runtime.backgroundTasks.stop.collectAsStateWithLifecycle()
    val presentation = RichChatBackgroundTaskLogic.presentation(task)
    val label = presentation.label ?: stringResource(R.string.rich_chat_background_task)
    val typeLabel = taskCategoryLabel(presentation.category)
    val taskCommand = task.command?.trim()?.takeIf(String::isNotEmpty)
    val commandIsLabel = taskCommand != null && taskCommand == presentation.label
    val outputAction = task.outputAction
    val outputKey = remember(selection, task) {
        selection?.let { richChatBackgroundTaskReadKey(it, task) }
    }
    val outputListed = outputAction?.let { it.id in (actionIds ?: emptyList()) } == true
    // The live host lease must still own this sheet: a replaced/reconnecting
    // host with the same thread ids never renders the previous host's tail.
    val hostCurrent = outputKey != null &&
        hostLease?.key == outputKey.host &&
        hostLease?.online == true &&
        hostLease?.ready == true
    val readEnabled = canOperate && foreground && hostCurrent && outputListed
    // A sheet can remain composed across a host lease replacement or app
    // backgrounding. Explain why the reader is paused instead of spinning a
    // Loading row that no LaunchedEffect will ever resolve; the effect restarts
    // the real read as soon as this becomes null and readEnabled is true.
    val readBlockedFailure = when {
        outputKey == null -> RichChatOperationFailure.NoThread
        hostLease == null || hostLease?.key != outputKey.host ->
            RichChatOperationFailure.NoSession
        hostLease?.online != true -> RichChatOperationFailure.Offline
        hostLease?.ready != true -> RichChatOperationFailure.SessionNotReady
        !foreground -> RichChatOperationFailure.Backgrounded
        else -> null
    }
    val visibleOutput = outputKey
        ?.takeIf { it.host == hostLease?.key }
        ?.let { key -> outputState.takeIf { it.key == key }?.output }
    var retryVersion by rememberSaveable(task.taskId, outputAction?.id) { mutableStateOf(0) }

    LaunchedEffect(outputKey, readEnabled, retryVersion) {
        if (!readEnabled) return@LaunchedEffect
        while (true) {
            val result = runtime.backgroundTasks.readOutput(task)
            if (result !is RichChatOperationResult.Success) break
            delay(2_000L)
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
                .testTag("background-task-details"),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    taskCategoryIcon(presentation.category),
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    if (commandIsLabel) {
                        // Purpose and command are the same value here: render
                        // the single copy with the bounded command treatment so
                        // a long command cannot grow the header and push Close
                        // offscreen. This remains the only command surface.
                        SelectionContainer {
                            Text(
                                label,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontFamily = FontFamily.Monospace,
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 200.dp)
                                    .verticalScroll(rememberScrollState())
                                    .testTag("background-task-command"),
                            )
                        }
                    } else {
                        Text(
                            label,
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                    Text(
                        typeLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.testTag("background-task-close"),
                ) {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = stringResource(R.string.rich_chat_background_task_close),
                    )
                }
            }

            taskAgeLabel(task.startedAt)?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            presentation.progress?.let { progress ->
                Text(progress, style = MaterialTheme.typography.bodySmall)
                taskAgeLabel(task.lastProgressAt, progress = true)?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Stop sits above the long command/output sections so it is visible
            // without scrolling; pending/error are independent of the read slot.
            val stopAction = task.stopAction
            if (stopAction != null && stopAction.id in (actionIds ?: emptyList())) {
                val stopKey = selection?.let { richChatBackgroundTaskStopKey(it, task) }
                val pending = stopKey != null && stopState.key == stopKey && stopState.pending
                val failure = stopState.failure.takeIf { stopState.key == stopKey }
                Button(
                    onClick = { onStopTask(task) },
                    enabled = canOperate && !pending,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("background-task-stop"),
                ) {
                    Text(
                        stringResource(
                            if (pending) R.string.rich_chat_background_task_stopping
                            else R.string.rich_chat_background_task_stop,
                        ),
                    )
                }
                failure?.let {
                    Text(
                        backgroundTaskStopFailureText(it),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            presentation.command?.let { command ->
                Text(
                    stringResource(R.string.rich_chat_command),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SelectionContainer {
                    Text(
                        command,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 200.dp)
                            .verticalScroll(rememberScrollState())
                            .testTag("background-task-command"),
                    )
                }
            }

            Text(
                stringResource(R.string.rich_chat_background_task_output),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when {
                outputAction == null || !outputListed || !canOperate ->
                    Text(
                        stringResource(R.string.rich_chat_background_task_output_unavailable),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                readBlockedFailure != null ->
                    Text(
                        richChatFailureText(readBlockedFailure)
                            ?: stringResource(R.string.rich_chat_background_task_output_unavailable),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                visibleOutput == null || visibleOutput is RichChatBackgroundTaskOutput.Loading ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text(
                            stringResource(R.string.rich_chat_background_task_output_loading),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                visibleOutput is RichChatBackgroundTaskOutput.Failed ->
                    BackgroundTaskOutputFailure(
                        failure = visibleOutput.failure,
                        onRetry = { retryVersion += 1 },
                    )
                visibleOutput is RichChatBackgroundTaskOutput.Ready ->
                    BackgroundTaskOutputTail(visibleOutput)
            }
        }
    }
}

@Composable
private fun BackgroundTaskOutputFailure(
    failure: RichChatOperationFailure,
    onRetry: () -> Unit,
) {
    val message = if (failure == RichChatOperationFailure.InvalidResponse) {
        stringResource(R.string.rich_chat_background_task_output_read_failed)
    } else {
        richChatFailureText(failure)
            ?: stringResource(R.string.rich_chat_background_task_output_read_failed)
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = onRetry,
            modifier = Modifier.testTag("background-task-output-retry"),
        ) {
            Text(stringResource(R.string.rich_chat_retry))
        }
    }
}

@Composable
private fun BackgroundTaskOutputTail(output: RichChatBackgroundTaskOutput.Ready) {
    if (output.truncated) {
        val bytes = remember(output.totalBytes) {
            NumberFormat.getIntegerInstance().format(output.totalBytes)
        }
        Text(
            stringResource(R.string.rich_chat_background_task_output_truncated, bytes),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (output.output.isEmpty()) {
        Text(
            stringResource(R.string.rich_chat_background_task_no_output),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    SelectionContainer {
        Text(
            output.output,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 240.dp)
                .verticalScroll(rememberScrollState())
                .testTag("background-task-output"),
        )
    }
}

@Composable
private fun backgroundTaskStopFailureText(failure: RichChatOperationFailure): String =
    when {
        failure is RichChatOperationFailure.Remote && failure.requestMayHaveCommitted ->
            stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
        failure == RichChatOperationFailure.InvalidResponse ->
            stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
        else -> richChatFailureText(failure)
            ?: stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
    }

@Composable
private fun taskAgeLabel(timestamp: Double?, progress: Boolean = false): String? {
    if (timestamp == null) return null
    var now by remember(timestamp) { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(timestamp) {
        while (true) {
            delay(1_000L)
            now = System.currentTimeMillis()
        }
    }
    val seconds = ((now - timestamp.toLong()).coerceAtLeast(0L) / 1_000L).toInt()
    val elapsed = RichChatBackgroundTaskLogic.elapsedLabel(seconds)
    return stringResource(
        if (progress) R.string.rich_chat_background_task_last_progress
        else R.string.rich_chat_background_task_running_for,
        elapsed,
    )
}

@Composable
private fun taskCategoryLabel(category: RichChatBackgroundTaskCategory): String = stringResource(
    when (category) {
        RichChatBackgroundTaskCategory.Command -> R.string.rich_chat_command
        RichChatBackgroundTaskCategory.Monitor -> R.string.rich_chat_background_task_monitor
        RichChatBackgroundTaskCategory.Tool -> R.string.rich_chat_background_task_tool
        RichChatBackgroundTaskCategory.Agent -> R.string.rich_chat_background_task_agent
        RichChatBackgroundTaskCategory.Workflow -> R.string.rich_chat_workflow
        RichChatBackgroundTaskCategory.Other -> R.string.rich_chat_background_task_other
    },
)

private fun taskCategoryIcon(category: RichChatBackgroundTaskCategory): ImageVector = when (category) {
    RichChatBackgroundTaskCategory.Command -> Icons.Outlined.Terminal
    RichChatBackgroundTaskCategory.Monitor -> Icons.Outlined.Radio
    RichChatBackgroundTaskCategory.Tool -> Icons.Outlined.Build
    RichChatBackgroundTaskCategory.Agent -> Icons.Outlined.SmartToy
    RichChatBackgroundTaskCategory.Workflow -> Icons.Outlined.AccountTree
    RichChatBackgroundTaskCategory.Other -> Icons.Outlined.PlayCircleOutline
}
