package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.util.UUID

internal data class RichChatForkIntent(val sourceThreadId: String, val anchor: String, val title: String, val id: String = UUID.randomUUID().toString()) {
    companion object {
        val Saver = listSaver<RichChatForkIntent?, String>(
            save = { intent -> intent?.let { listOf(it.sourceThreadId, it.anchor, it.title, it.id) } ?: emptyList() },
            restore = { if (it.isEmpty()) null else RichChatForkIntent(it[0], it[1], it[2], it[3]) },
        )
    }
}

@Composable
internal fun RichChatForkOrigin(thread: RemoteThread?, onOpenThread: (String) -> Unit) {
    val source = thread?.forkedFrom
    val id = source?.get("threadId")?.jsonPrimitive?.contentOrNull
    val title = source?.get("title")?.jsonPrimitive?.contentOrNull
    if (id != null && title != null) {
        TextButton(onClick = { onOpenThread(id) }) {
            Text(stringResource(R.string.rich_chat_fork_source, title))
        }
    }
}

@Composable
internal fun RichChatForkDialog(
    runtime: RichChatSessionRuntime,
    intent: RichChatForkIntent,
    canFork: Boolean,
    onDismiss: () -> Unit,
    onOpenThread: (String) -> Unit,
) {
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var title by rememberSaveable(intent.id) { mutableStateOf(intent.title) }
    var attempted by rememberSaveable(intent.id) { mutableStateOf(false) }
    val pending = state.activeOperations.any { it != "history" && it != "older" }
    AlertDialog(
        onDismissRequest = { if (!pending) onDismiss() },
        title = { Text(stringResource(R.string.rich_chat_fork_title)) },
        text = {
            Column {
                Text(stringResource(R.string.rich_chat_fork_explanation))
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.rich_chat_fork_name)) },
                    enabled = !pending && !attempted,
                )
                richChatFailureText(state.failure)?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !pending) {
                Text(stringResource(android.R.string.cancel))
            }
        },
        confirmButton = {
            TextButton(enabled = !pending && title.isNotBlank() && (attempted || canFork), onClick = {
                attempted = true
                val command = buildJsonObject {
                    put("kind", "fork")
                    put("sourceThreadId", intent.sourceThreadId)
                    put("throughItemId", intent.anchor)
                    put("title", title.trim())
                }
                scope.launch {
                    if (runtime.chat.threadCommand(command, destinationThreadId = intent.id) is RichChatOperationResult.Success) {
                        onDismiss()
                        onOpenThread(intent.id)
                    }
                }
            }) { Text(stringResource(R.string.rich_chat_fork_create)) }
        },
    )
}
