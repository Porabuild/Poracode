package com.poracode.app.ui.richchat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.projects.ProjectOperationResult
import com.poracode.app.session.projects.ProjectWorkspaceController
import com.poracode.app.session.richchat.RichChatControllerState
import com.poracode.app.session.richchat.RichChatSessionActionsState
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.RichCheckpointState
import kotlinx.coroutines.delay

@Composable
internal fun RichChatThreadEffects(
    runtime: RichChatSessionRuntime,
    state: RichChatControllerState,
    checkpointState: RichCheckpointState,
    sessionActionsState: RichChatSessionActionsState,
    thread: RemoteThread?,
    draft: String,
    projectLocation: ProjectLocation?,
    workspaceController: ProjectWorkspaceController?,
    workspaceTarget: ProjectWorkspaceTarget?,
    composerConfiguration: ThreadConfig,
    baseConfiguration: ThreadConfig,
    onWorkspaceFilesChange: (List<ProjectFileEntry>) -> Unit,
    onConfigurationSynchronized: (composer: ThreadConfig, base: ThreadConfig) -> Unit,
) {
    LaunchedEffect(
        RichChatMentionCatalog.trailingMentionQuery(draft),
        state.selection?.generation,
        workspaceController,
        workspaceTarget,
    ) {
        onWorkspaceFilesChange(emptyList())
        val query = RichChatMentionCatalog.trailingMentionQuery(draft) ?: return@LaunchedEffect
        val controller = workspaceController ?: return@LaunchedEffect
        val target = workspaceTarget ?: return@LaunchedEffect
        if (query.isNotEmpty()) delay(150)
        when (val result = controller.searchFiles(target, query, limit = 20)) {
            is ProjectOperationResult.Success -> onWorkspaceFilesChange(result.value.entries)
            else -> Unit
        }
    }

    LaunchedEffect(state.config, thread?.config) {
        val currentBase = state.config ?: thread?.config ?: return@LaunchedEffect
        onConfigurationSynchronized(
            synchronizeComposerConfiguration(composerConfiguration, baseConfiguration, currentBase),
            currentBase,
        )
    }

    LaunchedEffect(state.selection?.generation, projectLocation) {
        val selection = state.selection ?: return@LaunchedEffect
        val location = projectLocation ?: return@LaunchedEffect
        runtime.checkpoints.refresh(
            RichChatUiLogic.checkpointListPayload(selection.threadId, location),
        )
    }
    LaunchedEffect(state.needsAuthoritativeRefresh) {
        if (state.needsAuthoritativeRefresh) runtime.refreshSelectedThread()
    }
    LaunchedEffect(
        state.selection?.generation,
        state.selection?.host?.key,
        state.selection?.threadId,
        thread?.status,
        RichChatUiLogic.sessionActionOwnerKey(thread),
    ) {
        if (state.selection != null) runtime.sessionActions.refreshInventory()
    }
    LaunchedEffect(sessionActionsState.needsAuthoritativeRefresh) {
        if (sessionActionsState.needsAuthoritativeRefresh) {
            runtime.refreshSelectedThread()
            runtime.sessionActions.acknowledgeAuthoritativeRefresh()
            runtime.sessionActions.refreshInventory()
        }
    }
    LaunchedEffect(checkpointState.needsAuthoritativeRefresh) {
        if (checkpointState.needsAuthoritativeRefresh) {
            runtime.refreshSelectedThread()
            val selection = state.selection
            val location = projectLocation
            if (selection != null && location != null) {
                runtime.checkpoints.refresh(
                    RichChatUiLogic.checkpointListPayload(selection.threadId, location),
                )
            }
        }
    }
}
