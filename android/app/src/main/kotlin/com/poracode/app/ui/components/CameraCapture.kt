package com.poracode.app.ui.components

import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

/**
 * Shared camera capture used by the Home quick composer and the rich chat composer.
 * Native counterpart to iOS `HomeComposerCameraPicker`: launches the system camera app to
 * capture a photo into a `FileProvider`-backed cache file, then hands the resulting content
 * URI to [onCaptured] exactly like a picked file attachment. Never requests the `CAMERA`
 * runtime permission — [ActivityResultContracts.TakePicture] delegates capture to a separate
 * camera app and does not need it. The pending URI is kept in saved state so a photo captured
 * while this process was dead is still delivered. The user cancelling is silent (matches the
 * file picker's cancel behavior); a missing camera app, a file-creation failure, or a result
 * whose pending URI cannot be recovered reports [onUnavailable].
 */
@Composable
internal fun rememberCameraCapture(
    onCaptured: (Uri) -> Unit,
    onUnavailable: () -> Unit,
): () -> Unit {
    val context = LocalContext.current
    var pendingUri by rememberSaveable { mutableStateOf<String?>(null) }
    val currentOnCaptured by rememberUpdatedState(onCaptured)
    val currentOnUnavailable by rememberUpdatedState(onUnavailable)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val saved = pendingUri
        pendingUri = null
        if (success && saved != null) {
            currentOnCaptured(Uri.parse(saved))
        } else if (success) {
            currentOnUnavailable()
        }
    }
    return remember(context, launcher) {
        {
            val cameraAvailable = context.packageManager
                .queryIntentActivities(Intent(MediaStore.ACTION_IMAGE_CAPTURE), 0)
                .isNotEmpty()
            if (!cameraAvailable) {
                currentOnUnavailable()
            } else {
                val directory = File(context.cacheDir, "camera_captures").apply { mkdirs() }
                val file = File(directory, "capture_${UUID.randomUUID()}.jpg")
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file,
                )
                pendingUri = uri.toString()
                runCatching { launcher.launch(uri) }.onFailure {
                    pendingUri = null
                    currentOnUnavailable()
                }
            }
        }
    }
}
