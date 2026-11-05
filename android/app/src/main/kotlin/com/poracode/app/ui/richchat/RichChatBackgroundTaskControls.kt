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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.PlayCircleOutline
import androidx.compose.material.icons.outlined.Radio
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.BackgroundTask
import com.poracode.app.session.richchat.RichChatBackgroundTaskStopState
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatThreadLease
import com.poracode.app.session.richchat.richChatBackgroundTaskStopKey
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

@Composable
internal fun backgroundTaskStopFailureText(failure: RichChatOperationFailure): String =
    when {
        failure is RichChatOperationFailure.Remote && failure.requestMayHaveCommitted ->
            stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
        failure == RichChatOperationFailure.InvalidResponse ->
            stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
        else -> richChatFailureText(failure)
            ?: stringResource(R.string.rich_chat_background_task_stop_unconfirmed)
    }

@Composable
internal fun taskAgeLabel(timestamp: Double?, progress: Boolean = false): String? {
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
internal fun taskCategoryLabel(category: RichChatBackgroundTaskCategory): String = stringResource(
    when (category) {
        RichChatBackgroundTaskCategory.Command -> R.string.rich_chat_command
        RichChatBackgroundTaskCategory.Monitor -> R.string.rich_chat_background_task_monitor
        RichChatBackgroundTaskCategory.Tool -> R.string.rich_chat_background_task_tool
        RichChatBackgroundTaskCategory.Agent -> R.string.rich_chat_background_task_agent
        RichChatBackgroundTaskCategory.Workflow -> R.string.rich_chat_workflow
        RichChatBackgroundTaskCategory.Other -> R.string.rich_chat_background_task_other
    },
)

internal fun taskCategoryIcon(category: RichChatBackgroundTaskCategory): ImageVector = when (category) {
    RichChatBackgroundTaskCategory.Command -> Icons.Outlined.Terminal
    RichChatBackgroundTaskCategory.Monitor -> Icons.Outlined.Radio
    RichChatBackgroundTaskCategory.Tool -> Icons.Outlined.Build
    RichChatBackgroundTaskCategory.Agent -> Icons.Outlined.SmartToy
    RichChatBackgroundTaskCategory.Workflow -> Icons.Outlined.AccountTree
    RichChatBackgroundTaskCategory.Other -> Icons.Outlined.PlayCircleOutline
}
