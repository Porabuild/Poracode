package com.poracode.app.ui.richchat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.chat.RichImagePolicy
import com.poracode.app.chat.RichInlineImageKind
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.MAX_IMAGE_RESPONSE_BYTES
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private sealed interface RichImageLoadState {
    data object Loading : RichImageLoadState
    data class Loaded(val bitmap: Bitmap) : RichImageLoadState
    data object Unavailable : RichImageLoadState
}

@Composable
fun RichRemoteImage(
    source: RichImageSource,
    runtime: RichChatSessionRuntime,
    modifier: Modifier = Modifier,
) {
    val chatState by runtime.chat.state.collectAsStateWithLifecycle()
    val selection = chatState.selection
    val state by produceState<RichImageLoadState>(
        RichImageLoadState.Loading,
        source,
        selection?.host?.key,
        selection?.generation,
        chatState.needsAuthoritativeRefresh,
    ) {
        val bytes = when (source) {
            is RichImageSource.Inline -> inlineBytes(source.value)
            is RichImageSource.Local -> when (val result = runtime.media.loadLocalImage(source.path)) {
                is RichChatOperationResult.Success -> result.value.bytes
                else -> null
            }
            is RichImageSource.Runtime -> when (
                val result = runtime.media.loadRuntimeImage(source.ref)
            ) {
                is RichChatOperationResult.Success -> result.value.bytes
                else -> null
            }
        }
        value = bytes?.let { data ->
            withContext(Dispatchers.Default) { decodeSampled(data) }
        }?.let(RichImageLoadState::Loaded) ?: RichImageLoadState.Unavailable
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 80.dp, max = 360.dp),
        contentAlignment = Alignment.Center,
    ) {
        when (val image = state) {
            RichImageLoadState.Loading -> CircularProgressIndicator()
            RichImageLoadState.Unavailable -> Text(
                stringResource(R.string.rich_chat_image_unavailable),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            is RichImageLoadState.Loaded -> Image(
                bitmap = image.bitmap.asImageBitmap(),
                contentDescription = stringResource(R.string.rich_chat_image_description),
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

private fun inlineBytes(value: String): ByteArray? {
    val classification = RichImagePolicy.classify(value) ?: return null
    if (classification.kind == RichInlineImageKind.RAW_SVG) return null
    val encoded = if (classification.kind == RichInlineImageKind.DATA_URL) {
        val comma = value.indexOf(',')
        if (comma < 0 || !value.substring(0, comma).contains(";base64", ignoreCase = true)) {
            return null
        }
        value.substring(comma + 1)
    } else {
        value
    }
    if (encoded.length.toLong() > MAX_BASE64_CHARACTERS) return null
    return runCatching { Base64.decode(encoded, Base64.DEFAULT) }.getOrNull()
}

private fun decodeSampled(bytes: ByteArray): Bitmap? {
    if (bytes.isEmpty()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / sample > MAX_BITMAP_DIMENSION ||
        bounds.outHeight / sample > MAX_BITMAP_DIMENSION
    ) {
        sample *= 2
    }
    return BitmapFactory.decodeByteArray(
        bytes,
        0,
        bytes.size,
        BitmapFactory.Options().apply { inSampleSize = sample },
    )
}

private const val MAX_BITMAP_DIMENSION = 2_048
private const val MAX_BASE64_CHARACTERS = 4L * ((MAX_IMAGE_RESPONSE_BYTES + 2L) / 3L)
