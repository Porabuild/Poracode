package com.poracode.app.ui.richchat

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.poracode.app.chat.RichChatFileRef
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.transport.richchat.RichChatDownloadedFile
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val VIDEO_EXTENSIONS = setOf("mp4", "mov", "m4v", "webm", "mkv")

internal fun isVideoFileRef(ref: RichChatFileRef): Boolean {
    val ext = ref.fileName.substringAfterLast('.', "").lowercase()
    return ext in VIDEO_EXTENSIONS
}

/**
 * Inline playable video card for workspace/remote video files in chat messages,
 * mirroring iOS `RichChatInlineVideo`.
 */
@Composable
internal fun RichChatInlineVideoCard(
    ref: RichChatFileRef,
    modifier: Modifier = Modifier,
) {
    val actions = LocalRichChatFileActions.current
    val scope = rememberCoroutineScope()
    val colors = PoracodeTheme.colors
    val ownerKey = "${actions?.controller.hashCode()}:${actions?.threadKey}:${ref.path}"
    var loading by remember(ownerKey) { mutableStateOf(false) }
    var failed by remember(ownerKey) { mutableStateOf(false) }
    var downloaded by remember(ownerKey) { mutableStateOf<RichChatDownloadedFile?>(null) }

    DisposableEffect(ownerKey) {
        onDispose {
            downloaded?.directory?.deleteRecursively()
            downloaded = null
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.surface),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val localFile = downloaded?.file
        if (localFile != null && localFile.exists()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 180.dp, max = 320.dp)
                    .background(Color.Black),
                contentAlignment = Alignment.Center,
            ) {
                AndroidView(
                    factory = { ctx ->
                        VideoView(ctx).apply {
                            val controller = MediaController(ctx)
                            controller.setAnchorView(this)
                            setMediaController(controller)
                            setVideoURI(Uri.fromFile(localFile))
                            setOnPreparedListener { mp ->
                                mp.isLooping = false
                                start()
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 320.dp),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                PoracodeIcons.PlayCircleOutline,
                contentDescription = null,
                tint = colors.accent,
                modifier = Modifier.size(20.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    ref.fileName,
                    style = PoracodeTextStyles.rowTitle,
                    color = colors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (failed) {
                    Text(
                        ref.path,
                        style = PoracodeTextStyles.rowMeta,
                        color = colors.danger,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (loading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            } else if (localFile == null && actions != null) {
                FilledTonalButton(
                    onClick = {
                        val access = try {
                            com.poracode.app.chat.RichChatFilePolicy.resolve(ref.path, actions.location)
                        } catch (_: Exception) {
                            failed = true
                            return@FilledTonalButton
                        }
                        loading = true
                        failed = false
                        scope.launch {
                            val result = actions.controller.downloadFile(
                                request = access,
                                projectLocation = actions.location,
                                suggestedName = ref.fileName,
                                destinationDirectory = actions.cacheDirectory,
                            )
                            when (result) {
                                is RichChatOperationResult.Success -> downloaded = result.value
                                else -> failed = true
                            }
                            loading = false
                        }
                    },
                ) {
                    Icon(PoracodeIcons.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                }
            } else if (localFile != null) {
                FilledTonalButton(
                    onClick = {
                        val toDelete = downloaded
                        downloaded = null
                        scope.launch {
                            withContext(Dispatchers.IO) { toDelete?.directory?.deleteRecursively() }
                        }
                    },
                ) {
                    Icon(PoracodeIcons.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}
