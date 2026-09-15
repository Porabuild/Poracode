package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.richchat.RichChatOperationFailure

@Composable
internal fun RichChatStatusBanners(
    failure: RichChatOperationFailure?,
    needsRefresh: Boolean,
    canOperate: Boolean,
    onRefresh: () -> Unit,
) {
    failure?.let {
        Text(
            richChatFailureText(it) ?: stringResource(R.string.rich_chat_request_failed),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
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
            Button(onClick = onRefresh) { Text(stringResource(R.string.rich_chat_retry)) }
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
