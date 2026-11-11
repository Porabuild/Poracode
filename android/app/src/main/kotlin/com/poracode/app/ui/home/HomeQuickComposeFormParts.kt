package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.richchat.AttachmentUiError
import com.poracode.app.ui.richchat.UploadedAttachment
import com.poracode.app.ui.theme.PoracodeIcons

@Composable
internal fun HomeQuickComposeAttachmentChips(
    attachments: List<UploadedAttachment>,
    onRemove: (UploadedAttachment) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        attachments.forEach { attachment ->
            InputChip(
                selected = true,
                onClick = { onRemove(attachment) },
                label = {
                    Text(attachment.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                trailingIcon = {
                    Icon(
                        PoracodeIcons.Close,
                        contentDescription = stringResource(
                            R.string.rich_chat_remove_attachment,
                            attachment.name,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
internal fun HomeQuickComposeErrors(failed: Boolean, attachmentError: AttachmentUiError?) {
    if (failed) {
        Text(
            stringResource(R.string.home_new_thread_failed),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
    }
    attachmentError?.let { error ->
        Text(
            stringResource(
                if (error == AttachmentUiError.Invalid) {
                    R.string.rich_chat_attachment_invalid
                } else {
                    R.string.rich_chat_attachment_upload_failed
                },
            ),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
internal fun HomeQuickComposeUnavailable(onDismiss: () -> Unit) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            stringResource(R.string.home_quick_compose_unavailable),
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        IconButton(onClick = onDismiss) {
            Icon(
                PoracodeIcons.Close,
                contentDescription = stringResource(R.string.cancel_pair_button),
            )
        }
    }
}
