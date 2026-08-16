package com.poracode.app.ui.richchat

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichAttachmentPolicy
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.transport.richchat.AttachmentUploadBody
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okio.source

data class PickedAttachmentUpload(
    val name: String,
    val mimeType: String,
    val body: AttachmentUploadBody,
)

@Composable
fun RichChatComposer(
    contextKey: String,
    contextUsage: RichContextUsage?,
    draft: String,
    attachments: List<UploadedAttachment>,
    sending: Boolean,
    uploading: Boolean,
    enabled: Boolean,
    errorText: String?,
    onDraftChange: (String) -> Unit,
    onAttachmentUri: (Uri) -> Unit,
    onRemoveAttachment: (UploadedAttachment) -> Unit,
    onSend: () -> Unit,
    onInterrupt: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
        it?.let(onAttachmentUri)
    }
    val inputDescription = stringResource(R.string.rich_chat_message)
    Surface(modifier = modifier.fillMaxWidth(), tonalElevation = 3.dp) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            RuntimeContextUsageDock(contextKey, contextUsage)
            if (attachments.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    attachments.forEach { attachment ->
                        InputChip(
                            selected = true,
                            onClick = { onRemoveAttachment(attachment) },
                            label = { Text(attachment.name) },
                            trailingIcon = {
                                Icon(
                                    Icons.Filled.Close,
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
            errorText?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(verticalAlignment = Alignment.Bottom) {
                IconButton(
                    onClick = { launcher.launch(arrayOf("*/*")) },
                    enabled = enabled && !sending && !uploading,
                ) {
                    if (uploading) {
                        CircularProgressIndicator()
                    } else {
                        Icon(
                            Icons.Filled.AttachFile,
                            contentDescription = stringResource(R.string.rich_chat_add_attachment),
                        )
                    }
                }
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 52.dp)
                        .testTag("rich_chat_message")
                        .semantics { contentDescription = inputDescription },
                    placeholder = { Text(stringResource(R.string.rich_chat_message)) },
                    maxLines = 6,
                    enabled = enabled && !sending,
                )
                if (sending) {
                    IconButton(
                        onClick = onInterrupt,
                        enabled = enabled,
                        modifier = Modifier.testTag("rich_chat_stop_generation"),
                    ) {
                        Icon(
                            Icons.Filled.Stop,
                            contentDescription = stringResource(R.string.rich_chat_stop_generation),
                        )
                    }
                } else {
                    FilledIconButton(
                        onClick = onSend,
                        enabled = enabled && draft.isNotBlank() && !uploading,
                        modifier = Modifier.testTag("rich_chat_send_message"),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.rich_chat_send_message),
                        )
                    }
                }
            }
        }
    }
}

suspend fun prepareAttachment(context: Context, uri: Uri): PickedAttachmentUpload? =
    withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        runCatching {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        var name: String? = null
        var size: Long? = null
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIndex >= 0) name = cursor.getString(nameIndex)
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                }
            }
        val resolvedName = name?.takeIf(String::isNotBlank) ?: uri.lastPathSegment ?: return@withContext null
        val resolvedSize = size?.takeIf { it >= 0L } ?: runCatching {
            resolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        }.getOrNull()?.takeIf { it >= 0L } ?: return@withContext null
        if (!RichAttachmentPolicy.evaluate(resolvedName, resolvedSize).accepted) return@withContext null
        val mime = resolver.getType(uri)?.takeIf(String::isNotBlank) ?: "application/octet-stream"
        PickedAttachmentUpload(
            name = resolvedName,
            mimeType = mime,
            body = AttachmentUploadBody.streaming(resolvedSize) { sink ->
                val input = resolver.openInputStream(uri)
                    ?: throw IOException("Attachment content is unavailable.")
                input.source().use { source -> sink.writeAll(source) }
            },
        )
    }
