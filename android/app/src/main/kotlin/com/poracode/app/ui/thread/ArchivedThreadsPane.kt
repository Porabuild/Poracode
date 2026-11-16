package com.poracode.app.ui.thread

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.home.HomeThreadRowWithActions

/**
 * Android counterpart of the iOS `ArchivedThreadsView` and the PWA archived-threads settings page:
 * the selected desktop stays authoritative, this pane only projects its snapshot. Like Home rows,
 * a long press opens the shared thread actions drawer (restore/delete included); rows carry no
 * trailing overflow button.
 */
@Composable
internal fun ArchivedThreadsPane(
    threads: List<HostPresentation.UnifiedThreadItem>,
    controller: ThreadLifecycleController,
    canOperate: Boolean,
    onOpenThread: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (threads.isEmpty()) {
        EmptyStateView(
            stringResource(R.string.archived_threads_empty),
            stringResource(R.string.archived_threads_description),
            modifier,
        )
        return
    }
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(threads.size, key = { threads[it].id }) { index ->
            val item = threads[index]
            HomeThreadRowWithActions(
                item = item,
                grouped = false,
                selected = false,
                gitSummary = null,
                lifecycleController = controller,
                canOperateThreads = canOperate,
                onClick = { onOpenThread(item.id) },
            )
        }
    }
}
