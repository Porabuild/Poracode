package com.poracode.app.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.thread.ThreadLifecycleActionsSheet

/**
 * Home thread row plus its lifecycle actions (rename, relaunch, star, done, acknowledge,
 * archive, delete). Like the PWA row, a long press opens the thread actions drawer, so a
 * thread can be managed directly from the list without opening it first.
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
    agentLabel: String? = null,
    online: Boolean = false,
) {
    var actionsOpen by rememberSaveable(item.id) { mutableStateOf(false) }
    HomeThreadRow(
        item = item,
        grouped = grouped,
        gitSummary = gitSummary,
        selected = selected,
        onClick = onClick,
        modifier = modifier,
        agentLabel = agentLabel,
        online = online,
        onLongClick = if (canOperateThreads) ({ actionsOpen = true }) else null,
        onLongClickLabel = stringResource(R.string.thread_lifecycle_actions),
    )
    ThreadLifecycleActionsSheet(
        thread = item.thread,
        projectLocation = item.project.location,
        controller = lifecycleController,
        enabled = canOperateThreads,
        visible = actionsOpen,
        onDismiss = { actionsOpen = false },
        onThreadRemoved = {},
    )
}
