package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.poracode.app.R
import com.poracode.app.session.HostPresentation
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodePageHeader
import com.poracode.app.ui.components.PoracodeProjectHostLine
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.thread.ThreadLifecycleActionsSheet
import com.poracode.app.ui.thread.ThreadSheetAction

/**
 * Compact thread header from the PWA: back chevron, one-line title over the
 * project and connected host, and one plain "Thread actions" icon whose drawer carries
 * refresh, close, and the lifecycle actions.
 */
@Composable
internal fun RichChatThreadTopBar(
    title: String,
    thread: RemoteThread?,
    showBack: Boolean,
    hasSelection: Boolean,
    refreshing: Boolean,
    mutating: Boolean,
    canMutate: Boolean,
    closeThreadLabel: String,
    runtime: RichChatSessionRuntime,
    threadLifecycleController: ThreadLifecycleController,
    projectLocation: ProjectLocation?,
    onBack: () -> Unit,
    onShowCloseDialog: () -> Unit,
    onOpenProjectUtility: (HomeProjectUtility) -> Unit = {},
    onOpenWorkspaceGit: () -> Unit = {},
    onForkThread: (() -> Unit)? = null,
    onMoveToWorktree: ((Boolean) -> Unit)? = null,
    onContinueInProvider: (() -> Unit)? = null,
    agentLabel: String? = null,
    projectName: String? = null,
    hostName: String? = null,
    hostOnline: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    var actionsOpen by rememberSaveable(thread?.id) { mutableStateOf(false) }
    PoracodePageHeader(
        title = title,
        onBack = if (showBack) onBack else null,
        backLabel = stringResource(R.string.rich_chat_back),
        subtitle = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                thread?.let {
                    if (projectName != null && hostName != null) {
                        PoracodeProjectHostLine(
                            project = projectName,
                            host = HostPresentation.desktopTitle(hostName),
                            online = hostOnline,
                            modifier = androidx.compose.ui.Modifier.weight(1f, fill = false),
                        )
                    } else if (it.status == "launching") {
                        Text(
                            stringResource(
                                R.string.thread_status_line,
                                agentLabel ?: it.agentKind.substringAfterLast(':'),
                                stringResource(
                                    if (it.sessionRef != null) R.string.thread_status_resuming
                                    else R.string.thread_status_starting_agent,
                                ),
                            ),
                            style = PoracodeTextStyles.headerSubtitle,
                            color = colors.muted.copy(alpha = 0.7f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = androidx.compose.ui.Modifier.weight(1f, fill = false),
                        )
                    } else {
                        Text(
                            stringResource(
                                R.string.thread_status_line,
                                agentLabel ?: it.agentKind.substringAfterLast(':'),
                                it.status,
                            ),
                            style = PoracodeTextStyles.headerSubtitle,
                            color = colors.muted.copy(alpha = 0.7f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = androidx.compose.ui.Modifier.weight(1f, fill = false),
                        )
                    }
                }
            }
        },
        trailing = {
            PoracodeIconButton(
                icon = PoracodeIcons.MoreHoriz,
                contentDescription = stringResource(R.string.thread_lifecycle_actions),
                onClick = { actionsOpen = true },
            )
        },
    )
    val hasProjectTarget =
        projectLocation != null && thread != null && thread.projectId != HOME_PROJECT_ID
    val contextActions = buildList {
        if (hasProjectTarget) {
            add(
                ThreadSheetAction(
                    label = stringResource(R.string.thread_lifecycle_notes),
                    icon = PoracodeIcons.NoteAlt,
                    onClick = { onOpenProjectUtility(HomeProjectUtility.Notes) },
                ),
            )
            add(
                ThreadSheetAction(
                    label = stringResource(R.string.thread_lifecycle_open_terminal),
                    icon = PoracodeIcons.Terminal,
                    onClick = { onOpenProjectUtility(HomeProjectUtility.Terminal) },
                ),
            )
            add(
                ThreadSheetAction(
                    label = stringResource(R.string.workspace_git),
                    icon = PoracodeIcons.Merge,
                    onClick = onOpenWorkspaceGit,
                ),
            )
            onMoveToWorktree?.let { move ->
                add(
                    ThreadSheetAction(
                        label = stringResource(R.string.thread_lifecycle_move_worktree_changes),
                        icon = PoracodeIcons.DriveFileMove,
                        onClick = { move(true) },
                    ),
                )
                add(
                    ThreadSheetAction(
                        label = stringResource(R.string.thread_lifecycle_move_worktree_clean),
                        icon = PoracodeIcons.DriveFileMove,
                        onClick = { move(false) },
                    ),
                )
            }
        }
        onForkThread?.let { fork ->
            add(
                ThreadSheetAction(
                    label = stringResource(R.string.thread_lifecycle_fork_thread),
                    icon = PoracodeIcons.CallSplit,
                    onClick = fork,
                ),
            )
        }
        onContinueInProvider?.let { continueIn ->
            add(
                ThreadSheetAction(
                    label = stringResource(R.string.thread_lifecycle_continue_in),
                    icon = PoracodeIcons.SwapHoriz,
                    onClick = continueIn,
                ),
            )
        }
    }
    val nativeActions = buildList {
        add(
            ThreadSheetAction(
                label = stringResource(R.string.rich_chat_refresh_transcript),
                icon = PoracodeIcons.Refresh,
                enabled = hasSelection && !refreshing && !mutating,
                onClick = runtime::refreshSelectedThread,
            ),
        )
        if (hasSelection) {
            add(
                ThreadSheetAction(
                    label = closeThreadLabel,
                    icon = PoracodeIcons.PowerSettingsNew,
                    enabled = canMutate,
                    onClick = onShowCloseDialog,
                ),
            )
        }
    }
    if (thread != null && projectLocation != null) {
        ThreadLifecycleActionsSheet(
            thread = thread,
            projectLocation = projectLocation,
            controller = threadLifecycleController,
            enabled = canMutate,
            visible = actionsOpen,
            onDismiss = { actionsOpen = false },
            onThreadRemoved = onBack,
            contextActions = contextActions,
            nativeActions = nativeActions,
        )
    } else if (actionsOpen) {
        com.poracode.app.ui.components.PoracodeSheet(
            onDismissRequest = { actionsOpen = false },
            title = stringResource(R.string.thread_lifecycle_actions),
        ) {
            nativeActions.forEach { action ->
                com.poracode.app.ui.components.PoracodeSheetAction(
                    label = action.label,
                    icon = action.icon,
                    enabled = action.enabled,
                    onClick = {
                        actionsOpen = false
                        action.onClick()
                    },
                )
            }
        }
    }
}
