package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.richchat.RichChatOperationFailure
import androidx.compose.material3.FilledTonalButton
import kotlinx.coroutines.delay

/** Bounded pending window for an explicit host reconnect, mirroring the web notice. */
private const val RECONNECT_PENDING_MS = 4_000L

@Composable
internal fun RichChatStatusBanners(
    failure: RichChatOperationFailure?,
    needsRefresh: Boolean,
    canOperate: Boolean,
    onRefresh: () -> Unit,
    historyNotice: com.poracode.app.session.richchat.RichChatHistoryNoticeState =
        com.poracode.app.session.richchat.RichChatHistoryNoticeState(),
    onAcknowledgeNotice: () -> Unit = {},
    onRetryNoticeCheck: () -> Unit = {},
    /** The selected host has no live connection. Distinct from [needsRefresh]. */
    hostOffline: Boolean = false,
    /** Explicit host reconnect through the lifecycle's reconnect ladder. */
    onReconnect: () -> Unit = {},
) {
    // Local pending state only: a re-triggered reconnect re-arms the socket's
    // own ladder, so a late second press must not start a duplicate leg. The
    // persistent Reconnecting socket state is the automatic ladder, so the
    // button stays actionable for an explicit retry during its backoff.
    var reconnecting by remember { mutableStateOf(false) }
    LaunchedEffect(reconnecting) {
        if (reconnecting) {
            delay(RECONNECT_PENDING_MS)
            reconnecting = false
        }
    }
    LaunchedEffect(hostOffline) {
        if (!hostOffline) reconnecting = false
    }

    RichChatHistoryNoticeBanner(
        noticeState = historyNotice,
        canOperate = canOperate,
        onAcknowledge = onAcknowledgeNotice,
        onRetryCheck = onRetryNoticeCheck,
    )
    if (hostOffline) {
        // A lost connection to the host is distinct from a normal history
        // Refresh: reconnect the live socket, never replay the transcript.
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
        ) {
            Text(
                stringResource(R.string.rich_chat_offline),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            FilledTonalButton(
                onClick = {
                    if (!reconnecting) {
                        reconnecting = true
                        onReconnect()
                    }
                },
                enabled = !reconnecting,
            ) {
                Text(
                    if (reconnecting) {
                        stringResource(R.string.terminal_status_reconnecting)
                    } else {
                        stringResource(R.string.terminal_reconnect)
                    },
                )
            }
        }
    } else {
        failure?.let {
            Text(
                richChatFailureText(it) ?: stringResource(R.string.rich_chat_request_failed),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
    }
    if (needsRefresh) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
        ) {
            Text(
                stringResource(R.string.rich_chat_refresh_required),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            FilledTonalButton(onClick = onRefresh) { Text(stringResource(R.string.rich_chat_retry)) }
        }
    }
    if (!canOperate) {
        Text(
            stringResource(R.string.rich_chat_read_only),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
    }
}

@Composable
internal fun richChatFailureText(failure: RichChatOperationFailure?): String? = when (failure) {
    null -> null
    RichChatOperationFailure.NoSession -> stringResource(R.string.rich_chat_no_session)
    RichChatOperationFailure.Offline -> stringResource(R.string.rich_chat_offline)
    RichChatOperationFailure.SessionNotReady -> stringResource(R.string.rich_chat_session_not_ready)
    RichChatOperationFailure.NoThread -> stringResource(R.string.rich_chat_no_thread)
    RichChatOperationFailure.Backgrounded -> stringResource(R.string.rich_chat_backgrounded)
    RichChatOperationFailure.AuthenticationRequired -> stringResource(R.string.rich_chat_auth_required)
    is RichChatOperationFailure.AuthorizationDenied -> stringResource(R.string.rich_chat_permission_denied)
    RichChatOperationFailure.InvalidRequest -> stringResource(R.string.rich_chat_invalid_request)
    RichChatOperationFailure.InvalidResponse -> stringResource(R.string.rich_chat_invalid_response)
    is RichChatOperationFailure.Remote -> stringResource(
        if (failure.requestMayHaveCommitted) {
            R.string.rich_chat_request_uncertain
        } else {
            R.string.rich_chat_request_failed
        },
    )
}
