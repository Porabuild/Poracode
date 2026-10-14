package com.poracode.app.ui.richchat

import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.poracode.app.chat.RichFollowUpQueue
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionActionsState
import com.poracode.app.session.richchat.RichChatSessionRuntime
import kotlinx.serialization.json.JsonObject

/**
 * The thread screen's composer column: the follow-up queue above the composer
 * with every composer callback wired through. A pure pass-through — the
 * screen keeps the state and the coroutine scopes; this only hosts layout.
 */
@Composable
internal fun RichChatThreadComposerSection(
    runtime: RichChatSessionRuntime,
    userHiddenModels: kotlinx.serialization.json.JsonObject? = null,
    contextKey: String,
    sessionActionOwnerKey: String,
    canOperate: Boolean,
    enabled: Boolean,
    draft: String,
    attachments: List<UploadedAttachment>,
    sending: Boolean,
    uploading: Boolean,
    errorText: String?,
    configuration: ThreadConfig,
    agentStatus: AgentStatusEntry?,
    canConfigure: Boolean,
    currentThread: RemoteThread?,
    followUpQueue: RichFollowUpQueue?,
    contextUsage: RichContextUsage?,
    mentionItems: List<RichRuntimeItem>,
    workspaceFiles: List<ProjectFileEntry>,
    mentionThreads: List<RemoteThread>,
    isTurnActive: Boolean,
    queuedSegments: List<RichPromptSegment>,
    sessionActionIds: List<String>?,
    sessionActionsState: RichChatSessionActionsState,
    onSessionActionInvoke: (suspend (String, JsonObject, Boolean) -> RichChatOperationResult<JsonObject>)?,
    onSessionActionRefreshInventory: () -> Unit,
    onInsertIntoComposer: ((String) -> Unit)?,
    onDraftChange: (String) -> Unit,
    onConfigurationChange: (ThreadConfig) -> Unit,
    onQueueSegment: (RichPromptSegment) -> Unit,
    onRemoveSegment: (RichPromptSegment) -> Unit,
    onAttachmentUri: (Uri) -> Unit,
    onRemoveAttachment: (UploadedAttachment) -> Unit,
    onCameraUnavailable: () -> Unit,
    onSend: () -> Unit,
    onQueueSend: (() -> Unit)?,
    onInterrupt: () -> Unit,
) {
    Column(Modifier.imePadding().navigationBarsPadding()) {
        followUpQueue?.let { queue ->
            RichFollowUpQueueSection(
                runtime = runtime,
                queue = queue,
                enabled = canOperate,
            )
        }
        RichChatComposer(
            userHiddenModels = userHiddenModels,
            contextKey = contextKey,
            // Live session-action owner identity: a provider, presentation, or
            // SessionRef change resets panel state and fences in-flight
            // results to the new owner.
            sessionActionOwnerKey = sessionActionOwnerKey,
            contextUsage = contextUsage,
            draft = draft,
            attachments = attachments,
            sending = sending,
            uploading = uploading,
            enabled = enabled,
            errorText = errorText,
            configuration = configuration,
            agentStatus = agentStatus,
            canConfigure = canConfigure,
            threadSlashCommands = currentThread?.slashCommands,
            currentThread = currentThread,
            mentionItems = mentionItems,
            workspaceFiles = workspaceFiles,
            mentionThreads = mentionThreads,
            isTurnActive = isTurnActive,
            queuedSegments = queuedSegments,
            sessionActionIds = sessionActionIds,
            sessionActionInventoryFailure = sessionActionsState.inventoryFailure,
            sessionActionInventoryRefreshing = sessionActionsState.inventoryRefreshing,
            sessionActionInvokingId = sessionActionsState.invokingActionId,
            onSessionActionInvoke = onSessionActionInvoke,
            onSessionActionRefreshInventory = onSessionActionRefreshInventory,
            onInsertIntoComposer = onInsertIntoComposer,
            // Live SessionRef id the archive echo must match before the
            // app-side archive runs.
            onDraftChange = onDraftChange,
            onConfigurationChange = onConfigurationChange,
            onQueueSegment = onQueueSegment,
            onRemoveSegment = onRemoveSegment,
            onAttachmentUri = onAttachmentUri,
            onRemoveAttachment = onRemoveAttachment,
            onCameraUnavailable = onCameraUnavailable,
            onSend = onSend,
            onQueueSend = onQueueSend,
            onInterrupt = onInterrupt,
        )
    }
}
