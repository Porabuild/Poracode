package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.GitSummaryText
import com.poracode.app.ui.thread.ThreadLifecycleActions

/** Thread header: title, status line, git summary, refresh/close/lifecycle. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RichChatThreadTopBar(
    title: String,
    thread: RemoteThread?,
    gitSummary: RemoteGitSummary?,
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
) {
    TopAppBar(
        title = {
            Column {
                Text(title, maxLines = 1)
                thread?.let {
                    Text(
                        stringResource(R.string.thread_status_line, it.agentKind, it.status),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                GitSummaryText.CompactLine(
                    summary = gitSummary,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        },
        navigationIcon = {
            if (showBack) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.rich_chat_back),
                    )
                }
            }
        },
        actions = {
            IconButton(
                onClick = runtime::refreshSelectedThread,
                enabled = hasSelection && !refreshing && !mutating,
            ) {
                Icon(
                    Icons.Outlined.Refresh,
                    contentDescription = stringResource(R.string.rich_chat_refresh_transcript),
                )
            }
            if (hasSelection) {
                IconButton(
                    onClick = onShowCloseDialog,
                    enabled = canMutate,
                    modifier = Modifier.semantics { contentDescription = closeThreadLabel },
                ) {
                    Icon(Icons.Outlined.PowerSettingsNew, contentDescription = null)
                }
            }
            if (thread != null && projectLocation != null) {
                ThreadLifecycleActions(
                    thread = thread,
                    projectLocation = projectLocation,
                    controller = threadLifecycleController,
                    enabled = canMutate,
                    onThreadRemoved = onBack,
                )
            }
        },
    )
}
