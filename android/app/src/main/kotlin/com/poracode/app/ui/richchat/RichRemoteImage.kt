package com.poracode.app.ui.richchat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.chat.RichImagePolicy
import com.poracode.app.chat.RichInlineImageKind
import com.poracode.app.session.richchat.RichChatHostKey
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.MAX_IMAGE_RESPONSE_BYTES
import com.poracode.app.ui.theme.PoracodeIcons
import java.nio.ByteBuffer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Thread gallery image list supplied by [RichTimelineView] for lightbox navigation. */
internal val LocalRichChatImageGallery = compositionLocalOf<List<RichImageSource>> { emptyList() }

/**
 * Bounded LRU cache of decoded [Bitmap] instances so scrolling a conversation
 * LazyColumn never re-decodes visible images on every scroll-in. Evicted on
 * backgrounding, host removal, and [android.content.ComponentCallbacks2.onTrimMemory].
 */
internal object RichDecodedImageCache {
    private const val MAX_BYTES = 24L * 1024L * 1024L
    private const val MAX_ENTRIES = 64

    private data class Entry(val bitmap: Bitmap, val bytes: Long)

    private val lock = Any()
    private val entries = LinkedHashMap<String, Entry>(16, 0.75f, true)
    private var totalBytes = 0L

    fun get(key: String): Bitmap? = synchronized(lock) {
        entries[key]?.bitmap?.takeUnless { it.isRecycled }
    }

    fun put(key: String, bitmap: Bitmap) {
        val bytes = bitmap.allocationByteCount.toLong().coerceAtLeast(1L)
        if (bytes > MAX_BYTES) return
        synchronized(lock) {
            entries.remove(key)?.let { totalBytes -= it.bytes }
            while (entries.isNotEmpty() && (totalBytes + bytes > MAX_BYTES || entries.size >= MAX_ENTRIES)) {
                val oldest = entries.entries.iterator()
                totalBytes -= oldest.next().value.bytes
                oldest.remove()
            }
            entries[key] = Entry(bitmap, bytes)
            totalBytes += bytes
        }
    }

    fun clear() {
        synchronized(lock) {
            entries.clear()
            totalBytes = 0L
        }
    }
}

private fun imageCacheKey(hostKey: RichChatHostKey?, source: RichImageSource, variant: String): String =
    "${hostKey?.connectionId?.value}:${hostKey?.generation}:${source.hashCode()}:$variant"

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
    val hostKey = selection?.host?.key
    val gallery = LocalRichChatImageGallery.current
    val cacheKey = remember(source, hostKey) { imageCacheKey(hostKey, source, "card") }
    var lightboxOpen by remember(source, hostKey) { mutableStateOf(false) }

    val state by produceState<RichImageLoadState>(
        RichDecodedImageCache.get(cacheKey)?.let(RichImageLoadState::Loaded) ?: RichImageLoadState.Loading,
        source,
        hostKey,
        selection?.generation,
        chatState.needsAuthoritativeRefresh,
    ) {
        RichDecodedImageCache.get(cacheKey)?.let { cached ->
            value = RichImageLoadState.Loaded(cached)
            return@produceState
        }
        val bytes = fetchImageBytes(source, runtime, variant = "card")
        val decoded = bytes?.let { data ->
            withContext(Dispatchers.Default) { decodeSampled(data, MAX_CARD_BITMAP_DIMENSION) }
        }
        if (decoded != null) {
            RichDecodedImageCache.put(cacheKey, decoded)
            value = RichImageLoadState.Loaded(decoded)
        } else {
            value = RichImageLoadState.Unavailable
        }
    }

    val loadedBitmap = (state as? RichImageLoadState.Loaded)?.bitmap
    if (lightboxOpen && loadedBitmap != null) {
        val sources = remember(gallery, source) {
            if (source in gallery) gallery else listOf(source) + gallery
        }
        val initialIndex = remember(sources, source) { sources.indexOf(source).coerceAtLeast(0) }
        RichImageLightboxDialog(
            sources = sources,
            initialIndex = initialIndex,
            hostKey = hostKey,
            runtime = runtime,
            initialPreview = loadedBitmap,
            onDismiss = { lightboxOpen = false },
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 80.dp, max = 360.dp)
            .then(if (loadedBitmap != null) Modifier.clickable { lightboxOpen = true } else Modifier),
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

/**
 * Full-resolution image lightbox with pinch-to-zoom and a bottom thumbnail
 * preview strip (PWA `#1451` & iOS parity):
 * - Main stage paints the cached `card` preview immediately while upgrading
 *   only the selected image to full resolution (`variant = null`).
 * - Strip tiles load `card` previews only — never fetching full originals for
 *   unselected gallery entries.
 */
@Composable
private fun RichImageLightboxDialog(
    sources: List<RichImageSource>,
    initialIndex: Int,
    hostKey: RichChatHostKey?,
    runtime: RichChatSessionRuntime,
    initialPreview: Bitmap,
    onDismiss: () -> Unit,
) {
    var selectedIndex by remember(initialIndex) { mutableIntStateOf(initialIndex) }
    val selected = sources.getOrElse(selectedIndex) { sources.first() }
    val cardKey = remember(selected, hostKey) { imageCacheKey(hostKey, selected, "card") }
    val fullKey = remember(selected, hostKey) { imageCacheKey(hostKey, selected, "full") }
    var scale by remember(selectedIndex) { mutableFloatStateOf(1f) }
    var offset by remember(selectedIndex) { mutableStateOf(Offset.Zero) }

    val stageBitmap by produceState<Bitmap?>(
        initialValue = RichDecodedImageCache.get(fullKey)
            ?: RichDecodedImageCache.get(cardKey)
            ?: if (selectedIndex == initialIndex) initialPreview else null,
        selected,
        fullKey,
        cardKey,
    ) {
        if (selected is RichImageSource.Inline) {
            if (value == null) {
                val decoded = inlineBytes(selected.value)?.let {
                    withContext(Dispatchers.Default) { decodeSampled(it, MAX_FULL_BITMAP_DIMENSION) }
                }
                if (decoded != null) {
                    RichDecodedImageCache.put(fullKey, decoded)
                    value = decoded
                }
            }
            return@produceState
        }
        RichDecodedImageCache.get(fullKey)?.let { cached ->
            value = cached
            return@produceState
        }
        val bytes = fetchImageBytes(selected, runtime, variant = null) ?: return@produceState
        val decoded = withContext(Dispatchers.Default) {
            decodeSampled(bytes, MAX_FULL_BITMAP_DIMENSION)
        } ?: return@produceState
        RichDecodedImageCache.put(fullKey, decoded)
        value = decoded
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.94f)),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (sources.size > 1) {
                    Text(
                        "${selectedIndex + 1} / ${sources.size}",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                } else {
                    Box(Modifier.size(1.dp))
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.14f)),
                ) {
                    Icon(
                        imageVector = PoracodeIcons.Close,
                        contentDescription = stringResource(R.string.thread_lifecycle_close),
                        tint = Color.White,
                    )
                }
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .pointerInput(selectedIndex) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            val nextScale = (scale * zoom).coerceIn(1f, 4f)
                            scale = nextScale
                            offset = if (nextScale > 1f) offset + pan else Offset.Zero
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                val bitmap = stageBitmap
                if (bitmap != null) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = stringResource(R.string.rich_chat_image_description),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                            .graphicsLayer(
                                scaleX = scale,
                                scaleY = scale,
                                translationX = offset.x,
                                translationY = offset.y,
                            ),
                        contentScale = ContentScale.Fit,
                    )
                } else {
                    CircularProgressIndicator(color = Color.White)
                }
            }
            if (sources.size > 1) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 10.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(sources) { index, itemSource ->
                        LightboxThumbnailTile(
                            source = itemSource,
                            hostKey = hostKey,
                            runtime = runtime,
                            selected = index == selectedIndex,
                            onSelect = { selectedIndex = index },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LightboxThumbnailTile(
    source: RichImageSource,
    hostKey: RichChatHostKey?,
    runtime: RichChatSessionRuntime,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    val cardKey = remember(source, hostKey) { imageCacheKey(hostKey, source, "card") }
    val thumb by produceState<Bitmap?>(RichDecodedImageCache.get(cardKey), source, cardKey) {
        if (value != null) return@produceState
        val bytes = fetchImageBytes(source, runtime, variant = "card") ?: return@produceState
        val decoded = withContext(Dispatchers.Default) {
            decodeSampled(bytes, MAX_THUMB_BITMAP_DIMENSION)
        } ?: return@produceState
        RichDecodedImageCache.put(cardKey, decoded)
        value = decoded
    }
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(shape)
            .background(Color.White.copy(alpha = 0.08f))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Color.White else Color.White.copy(alpha = 0.25f),
                shape = shape,
            )
            .clickable(onClick = onSelect),
        contentAlignment = Alignment.Center,
    ) {
        if (thumb != null) {
            Image(
                bitmap = thumb!!.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.5.dp, color = Color.White.copy(alpha = 0.6f))
        }
    }
}

private suspend fun fetchImageBytes(
    source: RichImageSource,
    runtime: RichChatSessionRuntime,
    variant: String?,
): ByteArray? = when (source) {
    is RichImageSource.Inline -> inlineBytes(source.value)
    is RichImageSource.Local -> when (val result = runtime.media.loadLocalImage(source.path, variant = variant)) {
        is RichChatOperationResult.Success -> result.value.bytes
        else -> null
    }
    is RichImageSource.Runtime -> when (val result = runtime.media.loadRuntimeImage(source.ref, variant = variant)) {
        is RichChatOperationResult.Success -> result.value.bytes
        else -> null
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

private fun decodeSampled(bytes: ByteArray, maxDimension: Int): Bitmap? {
    if (bytes.isEmpty()) return null
    runCatching {
        val source = ImageDecoder.createSource(ByteBuffer.wrap(bytes))
        return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val width = info.size.width
            val height = info.size.height
            if (width > maxDimension || height > maxDimension) {
                val scale = minOf(
                    maxDimension.toFloat() / width.toFloat(),
                    maxDimension.toFloat() / height.toFloat(),
                )
                decoder.setTargetSize(
                    (width * scale).toInt().coerceAtLeast(1),
                    (height * scale).toInt().coerceAtLeast(1),
                )
            }
        }
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / sample > maxDimension || bounds.outHeight / sample > maxDimension) {
        sample *= 2
    }
    return BitmapFactory.decodeByteArray(
        bytes,
        0,
        bytes.size,
        BitmapFactory.Options().apply { inSampleSize = sample },
    )
}

private const val MAX_THUMB_BITMAP_DIMENSION = 256
private const val MAX_CARD_BITMAP_DIMENSION = 1_280
private const val MAX_FULL_BITMAP_DIMENSION = 2_048
private const val MAX_BASE64_CHARACTERS = 4L * ((MAX_IMAGE_RESPONSE_BYTES + 2L) / 3L)
