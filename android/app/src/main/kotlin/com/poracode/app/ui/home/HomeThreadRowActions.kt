package com.poracode.app.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.thread.ThreadLifecycleActions

/**
 * Home thread row plus its lifecycle actions (rename, relaunch, star, done, acknowledge,
 * archive, delete), reusing the same trailing-menu convention as [ArchivedThreadsPane] so a
 * thread can be managed directly from the list without opening it first — matching the iOS
 * Home thread row context menu.
 */
@Composable
internal fun HomeThreadRowWithActions(
    item: HostPresentation.UnifiedThreadItem,
    grouped: Boolean,
    selected: Boolean,
    gitSummary: RemoteGitSummary?,
    lifecycleController: ThreadLifecycleController,
    canOperateThreads: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    HomeThreadRow(
        item = item,
        grouped = grouped,
        gitSummary = gitSummary,
        selected = selected,
        onClick = onClick,
        modifier = modifier,
        trailing = {
            ThreadLifecycleActions(
                thread = item.thread,
                projectLocation = item.project.location,
                controller = lifecycleController,
                enabled = canOperateThreads,
                onThreadRemoved = {},
            )
        },
    )
}
