package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichHandoffSummary
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.session.threads.ThreadOperationResult
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * "Continue in another provider" sheet, mirroring iOS: pick Fork (both
 * threads grouped, source untouched) or Move (source marked done), choose the
 * target provider, and send the transferred transcript context plus the next
 * instruction as the new thread's first prompt.
 */
@Composable
internal fun RichChatHandoffSheet(
    thread: RemoteThread,
    agents: List<AgentStatusEntry>,
    summary: String?,
    controller: ThreadLifecycleController,
    onDismiss: () -> Unit,
    onOpenThread: (String) -> Unit,
) {
    val colors = PoracodeTheme.colors
    val scope = rememberCoroutineScope()
    val candidates = agents.filter { it.installed && it.kind != thread.agentKind }
        .distinctBy { it.kind }
    var forkMode by rememberSaveable(thread.id) { mutableStateOf(true) }
    var selectedKind by rememberSaveable(thread.id) {
        mutableStateOf(candidates.firstOrNull()?.kind.orEmpty())
    }
    var instruction by rememberSaveable(thread.id) {
        mutableStateOf("Continue from the transferred context and pick up where the previous provider left off.")
    }
    var busy by rememberSaveable(thread.id) { mutableStateOf(false) }
    var failed by rememberSaveable(thread.id) { mutableStateOf(false) }

    PoracodeSheet(
        onDismissRequest = { if (!busy) onDismiss() },
        title = stringResource(R.string.thread_lifecycle_continue_in),
    ) {
        androidx.compose.foundation.layout.Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            PoracodeSegmentedControl(
                options = listOf(
                    stringResource(R.string.rich_chat_handoff_fork),
                    stringResource(R.string.thread_lifecycle_move_confirm),
                ),
                selectedIndex = if (forkMode) 0 else 1,
                onSelect = { forkMode = it == 0 },
            )
            candidates.forEach { agent ->
                PoracodeListRow(
                    onClick = { selectedKind = agent.kind },
                    onClickLabel = agent.label,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text(
                        agent.label,
                        Modifier.weight(1f),
                        style = PoracodeTextStyles.rowTitle,
                        color = colors.foreground,
                        maxLines = 1,
                    )
                    if (agent.kind == selectedKind) {
                        Icon(
                            PoracodeIcons.Check,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = colors.foreground,
                        )
                    }
                }
            }
            PoracodeSectionLabel(stringResource(R.string.rich_chat_handoff_prompt))
            PoracodeTextField(
                value = instruction,
                onValueChange = { instruction = it },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp)
                    .height(96.dp),
            )
            if (failed) {
                Text(
                    stringResource(R.string.thread_lifecycle_failure_generic),
                    style = PoracodeTextStyles.rowDescription,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                )
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !busy) {
                    Text(stringResource(R.string.rich_chat_cancel))
                }
                FilledTonalButton(
                    enabled = !busy && selectedKind.isNotEmpty() && instruction.isNotBlank(),
                    onClick = {
                        busy = true
                        failed = false
                        scope.launch {
                            val newThreadId = UUID.randomUUID().toString()
                            val groupId = if (forkMode) {
                                UUID.randomUUID().toString().lowercase()
                            } else {
                                null
                            }
                            val prompt = (
                                RichHandoffSummary.promptPrefix(thread.agentKind, summary)
                                    ?: ""
                                ) + instruction.trim()
                            val started = controller.execute(
                                ThreadLifecycleCommand.Start(
                                    threadId = newThreadId,
                                    projectId = thread.projectId,
                                    agentKind = selectedKind,
                                    config = ThreadConfig(),
                                    prompt = prompt,
                                    commandId = ThreadCommandId(UUID.randomUUID().toString()),
                                    title = thread.title,
                                    presentationMode = when (thread.presentationMode) {
                                        "terminal" -> ThreadPresentationMode.Terminal
                                        else -> ThreadPresentationMode.Gui
                                    },
                                    worktreePath = thread.worktreePath,
                                    worktreeBranch = thread.worktreeBranch,
                                    focus = true,
                                    groupId = groupId,
                                    groupName = if (forkMode) thread.title else null,
                                ),
                            )
                            if (started !is ThreadOperationResult.Success) {
                                busy = false
                                failed = true
                                return@launch
                            }
                            if (forkMode) {
                                if (groupId != null) {
                                    controller.execute(
                                        ThreadLifecycleCommand.SetGroup(
                                            threadId = thread.id,
                                            groupId = groupId,
                                            groupName = thread.title,
                                        ),
                                    )
                                }
                            } else {
                                controller.execute(
                                    ThreadLifecycleCommand.SetDone(thread.id, done = true),
                                )
                            }
                            busy = false
                            onDismiss()
                            onOpenThread(newThreadId)
                        }
                    },
                ) {
                    Text(stringResource(R.string.rich_chat_handoff_switch))
                }
            }
        }
    }
}
