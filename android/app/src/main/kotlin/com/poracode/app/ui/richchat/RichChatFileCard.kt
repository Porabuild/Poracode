package com.poracode.app.ui.richchat

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichChatFilePolicy
import com.poracode.app.chat.RichChatFileRef
import com.poracode.app.model.ProjectLocation
import com.poracode.app.session.richchat.RichChatMediaController
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.transport.richchat.RichChatDownloadedFile
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** How a card reaches the selected host: controller + thread + project location. */
internal class RichChatFileActions(
    val controller: RichChatMediaController,
    val location: ProjectLocation,
    val cacheDirectory: File,
    val snackbarHost: SnackbarHostState?,
    /** Selected thread identity — a thread switch must invalidate staged state. */
    val threadKey: String?,
)

internal val LocalRichChatFileActions =
    androidx.compose.runtime.staticCompositionLocalOf<RichChatFileActions?> { null }

/**
 * Compact downloadable file card: neutral icon, truncating filename, 48dp
 * download target. Tap streams into a unique private cache directory, then
 * hands the file to the system DocumentsUI save flow. The private directory is
 * only removed once the system copy finishes, is cancelled, or the card
 * leaves composition.
 */
@Composable
internal fun RichChatFileCard(ref: RichChatFileRef, modifier: Modifier = Modifier) {
    val actions = LocalRichChatFileActions.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // State keys include the owner identity so a thread/host swap never reuses
    // another download's staged file or pending flag.
    val ownerKey =
        "${actions?.controller.hashCode()}:${actions?.threadKey}:${actions?.location}:${ref.path}"
    var pending by remember(ownerKey) { mutableStateOf(false) }
    var staged by remember(ownerKey) { mutableStateOf<RichChatDownloadedFile?>(null) }
    var failure by remember(ownerKey) { mutableStateOf(false) }
    var transferJob by remember(ownerKey) { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val downloadFailedMessage = stringResource(R.string.rich_chat_download_failed)

    val saver = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val download = staged
        staged = null
        if (download == null) {
            pending = false
            return@rememberLauncherForActivityResult
        }
        if (uri == null) {
            transferJob = scope.launch {
                try {
                    withContext(Dispatchers.IO) { download.directory.deleteRecursively() }
                } finally {
                    pending = false
                }
            }
            return@rememberLauncherForActivityResult
        }
        transferJob = scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.use { output ->
                        download.file.inputStream().use { it.copyTo(output) }
                    } ?: error("No output stream")
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                failure = true
                actions?.snackbarHost?.showSnackbar(downloadFailedMessage)
            } finally {
                // Cleanup survives disk-full and cancellation alike.
                withContext(kotlinx.coroutines.NonCancellable + Dispatchers.IO) {
                    download.directory.deleteRecursively()
                }
                pending = false
            }
        }
    }

    DisposableEffect(ownerKey) {
        onDispose {
            transferJob?.cancel()
            val stale = staged
            staged = null
            if (stale != null) {
                // rememberCoroutineScope is already cancelled here — use a
                // detached one-shot scope owning only this directory.
                CoroutineScope(Dispatchers.IO).launch { stale.directory.deleteRecursively() }
            }
        }
    }

    Row(
        modifier = modifier
            .background(
                MaterialTheme.colorScheme.surfaceContainerHigh,
                RoundedCornerShape(6.dp),
            )
            .padding(horizontal = 10.dp, vertical = 4.dp)
            .semantics { contentDescription = ref.path },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = fileIconFor(ref.path),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = ref.fileName,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.MiddleEllipsis,
            modifier = Modifier.weight(1f),
        )
        IconButton(
            onClick = {
                val ctx = actions ?: return@IconButton
                if (pending || staged != null) return@IconButton
                val access = try {
                    RichChatFilePolicy.resolve(ref.path, ctx.location)
                } catch (_: Exception) {
                    failure = true
                    return@IconButton
                }
                pending = true
                failure = false
                scope.launch {
                    val result = ctx.controller.downloadFile(
                        request = access,
                        projectLocation = ctx.location,
                        suggestedName = ref.fileName,
                        destinationDirectory = ctx.cacheDirectory,
                    )
                    when (result) {
                        is RichChatOperationResult.Success -> {
                            // Keep pending until DocumentsUI hands back a URI —
                            // the private file must exist before the picker.
                            staged = result.value
                            try {
                                saver.launch(result.value.fileName)
                            } catch (_: Exception) {
                                staged = null
                                pending = false
                                failure = true
                                CoroutineScope(Dispatchers.IO).launch {
                                    result.value.directory.deleteRecursively()
                                }
                                ctx.snackbarHost?.showSnackbar(downloadFailedMessage)
                            }
                        }
                        is RichChatOperationResult.Stale -> pending = false
                        is RichChatOperationResult.Failed -> {
                            pending = false
                            failure = true
                            ctx.snackbarHost?.showSnackbar(downloadFailedMessage)
                        }
                    }
                }
            },
            enabled = !pending && actions != null,
            modifier = Modifier.size(48.dp),
        ) {
            if (pending) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(16.dp)
                        .semantics {
                            contentDescription = "Downloading ${ref.fileName}"
                        },
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    imageVector = Icons.Outlined.Download,
                    contentDescription = stringResource(
                        R.string.rich_chat_download_file, ref.fileName,
                    ),
                    tint = if (failure) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

private fun fileIconFor(path: String) = when (path.substringAfterLast('.').lowercase()) {
    "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar" -> Icons.Outlined.FolderZip
    "pdf", "doc", "docx", "odt", "rtf", "txt", "csv", "tsv" -> Icons.Outlined.Description
    "apk", "aab", "ipa", "dmg", "pkg", "exe", "msi", "deb", "rpm" -> Icons.Outlined.Inventory2
    else -> Icons.Outlined.InsertDriveFile
}
