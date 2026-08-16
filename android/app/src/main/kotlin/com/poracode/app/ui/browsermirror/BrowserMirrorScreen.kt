package com.poracode.app.ui.browsermirror

import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.browsermirror.BrowserFrame
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserMirrorAvailability
import com.poracode.app.model.browsermirror.BrowserSafeKey
import com.poracode.app.model.browsermirror.BrowserTab
import com.poracode.app.session.browsermirror.BrowserMirrorController
import com.poracode.app.session.browsermirror.BrowserMirrorFailure
import com.poracode.app.session.browsermirror.BrowserMirrorUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserMirrorScreen(
    controller: BrowserMirrorController,
    onBack: () -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    var address by rememberSaveable { mutableStateOf("") }
    BackHandler(onBack = onBack)

    LaunchedEffect(controller) {
        controller.requestWatch()
        controller.refreshNow()
    }
    LaunchedEffect(state.browser.activeTabId) {
        address = state.browser.activeTab?.url.orEmpty()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.browser_mirror_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.browser_mirror_back_nav),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        if (state.watching) controller.stopWatch() else controller.requestWatch()
                    }) {
                        Icon(
                            if (state.watching) Icons.Outlined.Stop else Icons.Outlined.PlayArrow,
                            contentDescription = stringResource(
                                if (state.watching) {
                                    R.string.browser_mirror_stop
                                } else {
                                    R.string.browser_mirror_start
                                },
                            ),
                        )
                    }
                    IconButton(
                        onClick = {
                            controller.launchCommand(
                                BrowserMirrorUiAction.Create(null).toCommand(),
                            )
                        },
                    ) {
                        Icon(
                            Icons.Outlined.Add,
                            contentDescription = stringResource(R.string.browser_mirror_create_tab),
                        )
                    }
                },
            )
        },
    ) { padding ->
        BoxWithConstraints(
            Modifier.fillMaxSize().padding(padding),
        ) {
            if (maxWidth >= 840.dp) {
                Row(Modifier.fillMaxSize()) {
                    BrowserTabList(
                        state = state,
                        controller = controller,
                        modifier = Modifier.width(280.dp).fillMaxHeight(),
                        vertical = true,
                    )
                    BrowserContent(
                        state,
                        address,
                        { address = it },
                        controller,
                        Modifier.weight(1f),
                    )
                }
            } else {
                Column(Modifier.fillMaxSize()) {
                    BrowserTabList(
                        state = state,
                        controller = controller,
                        modifier = Modifier.fillMaxWidth(),
                        vertical = false,
                    )
                    BrowserContent(
                        state,
                        address,
                        { address = it },
                        controller,
                        Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun BrowserTabList(
    state: BrowserMirrorUiState,
    controller: BrowserMirrorController,
    modifier: Modifier,
    vertical: Boolean,
) {
    val layout = if (vertical) {
        modifier.padding(8.dp)
    } else {
        modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp)
    }
    if (vertical) {
        Column(layout, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.browser.tabs.forEach { BrowserTabChip(it, state, controller) }
        }
    } else {
        Row(layout, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            state.browser.tabs.forEach { BrowserTabChip(it, state, controller) }
        }
    }
}

@Composable
private fun BrowserTabChip(
    tab: BrowserTab,
    state: BrowserMirrorUiState,
    controller: BrowserMirrorController,
) {
    val selected = tab.tabId == state.browser.activeTabId
    val selectedText = stringResource(R.string.browser_mirror_selected_tab)
    Card(
        onClick = {
            controller.launchCommand(BrowserMirrorUiAction.Activate(tab.tabId).toCommand())
        },
        modifier = Modifier.semantics {
            contentDescription = if (selected) {
                tab.title.ifBlank { tab.url } + " ($selectedText)"
            } else {
                tab.title.ifBlank { tab.url }
            }
        },
    ) {
        Row(
            Modifier.padding(start = 12.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                tab.title.ifBlank { stringResource(R.string.browser_mirror_untitled_tab) },
                color = if (selected) MaterialTheme.colorScheme.primary else {
                    MaterialTheme.colorScheme.onSurface
                },
                maxLines = 1,
                modifier = Modifier.weight(1f, fill = false),
            )
            IconButton(
                onClick = {
                    controller.launchCommand(BrowserMirrorUiAction.Close(tab.tabId).toCommand())
                },
                modifier = Modifier.size(40.dp),
            ) {
                Icon(
                    Icons.Outlined.Close,
                    contentDescription = stringResource(R.string.browser_mirror_close_tab),
                )
            }
        }
    }
}

@Composable
private fun BrowserContent(
    state: BrowserMirrorUiState,
    address: String,
    setAddress: (String) -> Unit,
    controller: BrowserMirrorController,
    modifier: Modifier,
) {
    Column(modifier.padding(horizontal = 8.dp)) {
        BrowserToolbar(state, address, setAddress, controller)
        BrowserStatus(state, controller)
        BrowserFrameSurface(
            frame = state.frame,
            controller = controller,
            modifier = Modifier.fillMaxWidth().weight(1f).heightIn(min = 180.dp),
        )
        BrowserInputProxy(controller)
    }
}

@Composable
private fun BrowserToolbar(
    state: BrowserMirrorUiState,
    address: String,
    setAddress: (String) -> Unit,
    controller: BrowserMirrorController,
) {
    val tab = state.browser.activeTab
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = { tab?.let { controller.launchCommand(BrowserMirrorUiAction.Back(it.tabId).toCommand()) } },
            enabled = tab?.canGoBack == true,
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = stringResource(R.string.browser_mirror_back),
            )
        }
        IconButton(
            onClick = { tab?.let { controller.launchCommand(BrowserMirrorUiAction.Forward(it.tabId).toCommand()) } },
            enabled = tab?.canGoForward == true,
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowForward,
                contentDescription = stringResource(R.string.browser_mirror_forward),
            )
        }
        IconButton(
            onClick = { tab?.let { controller.launchCommand(BrowserMirrorUiAction.Reload(it.tabId).toCommand()) } },
            enabled = tab != null,
        ) {
            Icon(
                Icons.Outlined.Refresh,
                contentDescription = stringResource(R.string.browser_mirror_reload),
            )
        }
        OutlinedTextField(
            value = address,
            onValueChange = setAddress,
            label = { Text(stringResource(R.string.browser_mirror_address)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(
                onGo = {
                    tab?.takeIf { address.isNotBlank() }?.let {
                        controller.launchCommand(
                            BrowserMirrorUiAction.Navigate(it.tabId, address).toCommand(),
                        )
                    }
                },
            ),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun BrowserStatus(state: BrowserMirrorUiState, controller: BrowserMirrorController) {
    val tabsEmpty = state.browser.tabs.isEmpty()
    val text = when {
        state.loading -> stringResource(R.string.browser_mirror_loading)
        state.failure == BrowserMirrorFailure.NoSession ->
            stringResource(R.string.browser_mirror_no_session)
        state.failure == BrowserMirrorFailure.Offline ->
            stringResource(R.string.browser_mirror_offline)
        state.failure == BrowserMirrorFailure.NotReady ->
            stringResource(R.string.browser_mirror_not_ready)
        state.failure == BrowserMirrorFailure.ReadDenied ||
            state.failure == BrowserMirrorFailure.OperateDenied ->
            stringResource(R.string.browser_mirror_permission_denied)
        state.failure == BrowserMirrorFailure.AmbiguousCommand ->
            stringResource(R.string.browser_mirror_refreshing_after_command)
        state.failure == BrowserMirrorFailure.Remote ->
            stringResource(R.string.browser_mirror_remote_error)
        tabsEmpty -> stringResource(R.string.browser_mirror_empty)
        !state.watching -> stringResource(R.string.browser_mirror_stopped)
        state.mirrorStatus?.availability == BrowserMirrorAvailability.Starting ->
            stringResource(R.string.browser_mirror_starting)
        state.mirrorStatus?.availability == BrowserMirrorAvailability.Unavailable ->
            stringResource(R.string.browser_mirror_unavailable)
        state.frame == null -> stringResource(R.string.browser_mirror_waiting_frame)
        else -> null
    }
    if (text != null) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            Text(text, modifier = Modifier.padding(start = if (state.loading) 8.dp else 0.dp).weight(1f))
            val recoverable = state.failure != null ||
                state.mirrorStatus?.availability == BrowserMirrorAvailability.Unavailable ||
                tabsEmpty ||
                !state.watching
            if (recoverable) {
                TextButton(onClick = {
                    if (!state.watching) controller.requestWatch()
                    controller.launchRefresh()
                }) {
                    Text(stringResource(R.string.browser_mirror_retry))
                }
            }
        }
    }
}

@Composable
private fun BrowserFrameSurface(
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
private fun BrowserInputProxy(controller: BrowserMirrorController) {
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
