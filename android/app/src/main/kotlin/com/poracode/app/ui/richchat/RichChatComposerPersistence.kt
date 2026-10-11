package com.poracode.app.ui.richchat

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import com.poracode.app.chat.RichAttachmentPolicy
import com.poracode.app.chat.RichPendingSteerDecoder
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.toJsonObject
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.MAX_ATTACHMENT_BYTES
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

internal enum class AttachmentUiError { Invalid, UploadFailed, CameraUnavailable }

internal fun uploadAttachment(
    uri: Uri,
    context: Context,
    runtime: RichChatSessionRuntime,
    scope: CoroutineScope,
    onStart: () -> Unit,
    onFinish: () -> Unit,
    onFailure: (AttachmentUiError) -> Unit,
    onSuccess: (UploadedAttachment) -> Unit,
) {
    runAttachmentUpload(
        uri = uri,
        context = context,
        runtime = runtime,
        scope = scope,
        onStart = onStart,
        onFinish = onFinish,
        onFailure = onFailure,
        onSuccess = onSuccess,
    ) { picked -> runtime.media.uploadAttachment(picked.name, picked.mimeType, picked.body) }
}

internal fun uploadAttachmentForThread(
    uri: Uri,
    context: Context,
    runtime: RichChatSessionRuntime,
    threadId: String,
    scope: CoroutineScope,
    onStart: () -> Unit,
    onFinish: () -> Unit,
    onFailure: (AttachmentUiError) -> Unit,
    onSuccess: (UploadedAttachment) -> Unit,
) {
    runAttachmentUpload(
        uri = uri,
        context = context,
        runtime = runtime,
        scope = scope,
        onStart = onStart,
        onFinish = onFinish,
        onFailure = onFailure,
        onSuccess = onSuccess,
    ) { picked ->
        runtime.media.uploadAttachmentForThread(
            threadId,
            picked.name,
            picked.mimeType,
            picked.body,
        )
    }
}

private fun runAttachmentUpload(
    uri: Uri,
    context: Context,
    runtime: RichChatSessionRuntime,
    scope: CoroutineScope,
    onStart: () -> Unit,
    onFinish: () -> Unit,
    onFailure: (AttachmentUiError) -> Unit,
    onSuccess: (UploadedAttachment) -> Unit,
    upload: suspend (PickedAttachmentUpload) -> RichChatOperationResult<String>,
) {
    scope.launch {
        onStart()
        try {
            val picked = prepareAttachment(context, uri)
            if (picked == null) {
                onFailure(AttachmentUiError.Invalid)
                return@launch
            }
            if (!awaitAttachmentSession(runtime)) {
                onFailure(AttachmentUiError.UploadFailed)
                return@launch
            }
            when (val result = upload(picked)) {
                is RichChatOperationResult.Success -> onSuccess(
                    UploadedAttachment(picked.name, picked.mimeType, result.value),
                )
                else -> onFailure(AttachmentUiError.UploadFailed)
            }
        } finally {
            onFinish()
        }
    }
}

private suspend fun awaitAttachmentSession(runtime: RichChatSessionRuntime): Boolean =
    withTimeoutOrNull(8_000) {
        while (!runtime.media.isReadyForUpload) delay(32)
        true
    } ?: false

internal suspend fun prepareAttachment(context: Context, uri: Uri): PickedAttachmentUpload? =
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
        val resolvedName = name?.takeIf(String::isNotBlank) ?: uri.lastPathSegment
            ?: return@withContext null
        if (size != null && size!! > MAX_ATTACHMENT_BYTES) {
            return@withContext null
        }
        val bytes = resolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val chunk = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0L
            while (true) {
                val count = input.read(chunk)
                if (count < 0) break
                total += count
                if (total > MAX_ATTACHMENT_BYTES) return@use null
                output.write(chunk, 0, count)
            }
            output.toByteArray()
        } ?: return@withContext null
        if (!RichAttachmentPolicy.evaluate(resolvedName, bytes.size.toLong()).accepted) {
            return@withContext null
        }
        val mime = resolver.getType(uri)?.takeIf(String::isNotBlank) ?: "application/octet-stream"
        PickedAttachmentUpload(
            name = resolvedName,
            mimeType = mime,
            body = AttachmentUploadBody.bytes(bytes),
        )
    }

internal val attachmentSaver = listSaver<List<UploadedAttachment>, String>(
    save = { values -> values.flatMap { listOf(it.name, it.mimeType, it.remotePath) } },
    restore = { values ->
        values.chunked(3).mapNotNull { chunk ->
            if (chunk.size == 3) UploadedAttachment(chunk[0], chunk[1], chunk[2]) else null
        }
    },
)

internal val promptSegmentsSaver = listSaver<List<RichPromptSegment>, String>(
    save = { values -> values.map { it.toJsonObject().toString() } },
    restore = { values ->
        values.mapNotNull { raw ->
            runCatching { RichPendingSteerDecoder.decodeSegment(RemoteJson.parseToJsonElement(raw)) }
                .getOrNull()
        }
    },
)

internal val threadConfigSaver = Saver<ThreadConfig, String>(
    save = { RemoteJson.encodeToString(ThreadConfig.serializer(), it) },
    restore = {
        runCatching { RemoteJson.decodeFromString(ThreadConfig.serializer(), it) }.getOrNull()
    },
)
