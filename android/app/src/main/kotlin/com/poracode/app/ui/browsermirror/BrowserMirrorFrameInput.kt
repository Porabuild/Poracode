package com.poracode.app.ui.browsermirror

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.browsermirror.BrowserFrame
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserSafeKey
import com.poracode.app.session.browsermirror.BrowserMirrorController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun BrowserFrameSurface(
    frame: BrowserFrame?,
    controller: BrowserMirrorController,
    modifier: Modifier,
) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    val bitmap by produceState<ImageBitmap?>(null, frame) {
        value = withContext(Dispatchers.Default) {
            frame?.jpegBytes?.let { bytes ->
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }
    }
    val frameDescription = stringResource(R.string.browser_mirror_frame_description)
    Box(
        modifier
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .semantics { contentDescription = frameDescription }
            .onSizeChanged { size = it }
            .pointerInput(frame, size) {
                detectTapGestures { offset ->
                    val point = mappedImage(frame, size)?.point(offset.x.toDouble(), offset.y.toDouble())
                    point?.let { controller.launchInput(BrowserInput.Tap(it.x, it.y)) }
                }
            }
            .pointerInput(frame, size) {
                var origin: BrowserMirrorPoint? = null
                detectDragGestures(
                    onDragStart = { offset ->
                        origin = mappedImage(frame, size)?.point(offset.x.toDouble(), offset.y.toDouble())
                    },
                    onDrag = { _, drag: Offset ->
                        val start = origin ?: return@detectDragGestures
                        val delta = mappedImage(frame, size)?.scrollDelta(
                            drag.x.toDouble(),
                            drag.y.toDouble(),
                        ) ?: return@detectDragGestures
                        controller.launchInput(
                            BrowserInput.Scroll(start.x, start.y, delta.x, delta.y),
                        )
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        bitmap?.let {
            Image(
                bitmap = it,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private fun mappedImage(frame: BrowserFrame?, size: IntSize): BrowserMirrorMappedImage? =
    frame?.let {
        mapBrowserMirrorImage(
            BrowserMirrorRect(0.0, 0.0, size.width.toDouble(), size.height.toDouble()),
            it.metadata.deviceWidth,
            it.metadata.deviceHeight,
        )
    }

@Composable
internal fun BrowserInputProxy(controller: BrowserMirrorController) {
    val keyboard = LocalSoftwareKeyboardController.current
    OutlinedTextField(
        value = "",
        onValueChange = { text ->
            text.takeIf(String::isNotEmpty)?.take(BrowserInput.MAX_UTF16_UNITS)?.let {
                controller.launchInput(BrowserInput.InsertText(it))
            }
        },
        label = { Text(stringResource(R.string.browser_mirror_type_on_page)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(
            onDone = {
                controller.launchInput(BrowserInput.Key(BrowserSafeKey.Enter))
                keyboard?.hide()
            },
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        SafeKeyButton(R.string.browser_mirror_key_enter, BrowserSafeKey.Enter, controller)
        SafeKeyButton(R.string.browser_mirror_key_backspace, BrowserSafeKey.Backspace, controller)
        SafeKeyButton(R.string.browser_mirror_key_tab, BrowserSafeKey.Tab, controller)
        SafeKeyButton(R.string.browser_mirror_key_escape, BrowserSafeKey.Escape, controller)
        SafeKeyButton(R.string.browser_mirror_key_up, BrowserSafeKey.ArrowUp, controller)
        SafeKeyButton(R.string.browser_mirror_key_down, BrowserSafeKey.ArrowDown, controller)
        SafeKeyButton(R.string.browser_mirror_key_left, BrowserSafeKey.ArrowLeft, controller)
        SafeKeyButton(R.string.browser_mirror_key_right, BrowserSafeKey.ArrowRight, controller)
    }
}

@Composable
private fun SafeKeyButton(label: Int, key: BrowserSafeKey, controller: BrowserMirrorController) {
    OutlinedButton(onClick = { controller.launchInput(BrowserInput.Key(key)) }) {
        Text(stringResource(label))
    }
}
