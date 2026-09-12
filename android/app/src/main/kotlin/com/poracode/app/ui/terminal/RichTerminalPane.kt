package com.poracode.app.ui.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.TerminalStartInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun RichTerminalPane(
    runtime: RichChatSessionRuntime,
    canOperate: Boolean,
    projectLocation: ProjectLocation?,
    autoStartKey: String? = null,
    textSizeSp: Int = 13,
    modifier: Modifier = Modifier,
) {
    val state by runtime.terminal.state.collectAsStateWithLifecycle()
    val transcript = state.cursor?.transcript.orEmpty()
    val buffer = remember(state.lease?.terminalId) { TerminalTextBuffer() }
    var document by remember(buffer) {
        mutableStateOf(TerminalRenderedDocument(emptyList(), emptyList(), 0L))
    }
    LaunchedEffect(transcript, buffer) {
        document = buffer.update(transcript)
    }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val textMeasurer = rememberTextMeasurer()
    val terminalCellSize = remember(textSizeSp, density.density, density.fontScale) {
        textMeasurer.measure(
            text = AnnotatedString("M"),
            style = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = textSizeSp.sp,
                lineHeight = (textSizeSp + 5).sp,
            ),
        ).size.let { it.width.coerceAtLeast(1) to it.height.coerceAtLeast(1) }
    }
    val outputDescription = stringResource(R.string.terminal_output_description)
    var input by remember(state.lease?.terminalId) { mutableStateOf("") }
    var measuredSize by remember { mutableStateOf(0 to 0) }
    var autoStartRequested by remember(projectLocation, autoStartKey) { mutableStateOf(false) }
    var ctrlModifierActive by remember(state.lease?.terminalId) { mutableStateOf(false) }
    var showsCloseConfirmation by remember { mutableStateOf(false) }
    val busy = state.activeOperations.isNotEmpty()
    val writable = canOperate && state.connection.phase == TerminalConnectionPhase.Live &&
        state.processState != TerminalProcessState.Exited
    // Follow intent is a user signal kept separate from the layout-derived at-bottom check:
    // a viewport shrink (open keyboard) or relayout must not stop following, while an
    // explicit user drag into history must. A drag ending at the bottom (or scrolling back
    // near the bottom) re-arms following; re-arming waits for the gesture to finish so an
    // in-progress flick never toggles intent, and intent resets per terminal lease.
    var followOutput by remember(state.lease?.terminalId) { mutableStateOf(true) }
    var terminalDragActive by remember(state.lease?.terminalId) { mutableStateOf(false) }
    val isAtBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf true
            last.index >= info.totalItemsCount - 2
        }
    }
    LaunchedEffect(listState, state.lease?.terminalId) {
        listState.interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is DragInteraction.Start -> {
                    terminalDragActive = true
                    followOutput = false
                }
                is DragInteraction.Stop, is DragInteraction.Cancel -> {
                    terminalDragActive = false
                    if (isAtBottom) followOutput = true
                }
            }
        }
    }
    LaunchedEffect(isAtBottom, terminalDragActive) {
        if (isAtBottom && !terminalDragActive) followOutput = true
    }

    LaunchedEffect(
        autoStartKey,
        projectLocation,
        canOperate,
        busy,
        state.lease?.terminalId,
    ) {
        val location = projectLocation
        if (shouldAutoStartProjectTerminal(
                autoStartKey = autoStartKey,
                autoStartRequested = autoStartRequested,
                canOperate = canOperate,
                busy = busy,
                hasTerminalLease = state.lease != null,
                hasProjectLocation = location != null,
            )
        ) {
            autoStartRequested = true
            runtime.startTerminal(
                terminalStartInput(
                    requireNotNull(location), measuredSize, density, terminalCellSize,
                ),
            )
        }
    }

    LaunchedEffect(document.revision, measuredSize.second) {
        // Follow new output only while follow intent holds: still at the bottom, or pinned
        // across keyboard/layout resizes. A user reading history is not yanked around.
        if (document.lines.isNotEmpty() && followOutput) {
            listState.scrollToItem(document.lines.lastIndex)
        }
    }
    LaunchedEffect(
        measuredSize,
        canOperate,
        state.lease?.terminalId,
        state.connection.phase,
        terminalCellSize,
    ) {
        if (!canOperate || state.lease == null ||
            state.connection.phase != TerminalConnectionPhase.Live
        ) {
            return@LaunchedEffect
        }
        delay(150)
        val (columns, rows) = terminalDimensions(measuredSize, density, terminalCellSize)
            ?: return@LaunchedEffect
        runtime.terminal.resize(columns, rows)
    }

    // imePadding lifts the input/accessory rows above the keyboard (edge-to-edge +
    // adjustResize), so the composer stays visible while typing and the weighted output
    // keeps the remaining height instead of being covered.
    Column(modifier.fillMaxSize().imePadding()) {
        TerminalStatusRow(
            phase = state.connection.phase,
            failure = state.connection.failure,
            processState = state.processState,
            busy = busy,
            onReconnect = runtime::reconnectTerminal,
        )
        SelectionContainer(Modifier.weight(1f)) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF101214))
                    .onSizeChanged { measuredSize = it.width to it.height }
                    .semantics {
                        contentDescription = outputDescription
                    }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            ) {
                itemsIndexed(document.styledLines, key = { index, _ -> index }) { index, runs ->
                    Text(
                        text = terminalLineAnnotatedString(runs, document.lines.getOrElse(index) { "" }),
                        fontFamily = FontFamily.Monospace,
                        fontSize = textSizeSp.sp,
                        lineHeight = (textSizeSp + 5).sp,
                        softWrap = false,
                    )
                }
            }
        }
Row(
            Modifier.fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it.take(MAX_INPUT_UTF16_UNITS) },
                enabled = writable,
                label = { Text(stringResource(R.string.terminal_input_label)) },
                placeholder = { Text(stringResource(R.string.terminal_input_placeholder)) },
                singleLine = true,
                // Verbatim terminal input: no autocorrect/capitalization rewriting, but the
                // default (Unicode) keyboard so any text can be typed. ImeAction.Send kept.
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Send,
                ),
                keyboardActions = KeyboardActions(onSend = {
                    sendInput(runtime, input, scope) { input = "" }
                }),
                modifier = Modifier
                    .weight(1f)
                    .onPreviewKeyEvent { event ->
                        if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                        val sequence = when (event.key) {
                            Key.DirectionUp -> "\u001b[A"
                            Key.DirectionDown -> "\u001b[B"
                            Key.DirectionRight -> "\u001b[C"
                            Key.DirectionLeft -> "\u001b[D"
                            else -> return@onPreviewKeyEvent false
                        }
                        scope.launch { runtime.terminal.write(sequence) }
                        true
                    },
            )
            // Ctrl+C and Send stay visible right next to the composer on every screen size;
            // less frequent management actions live at the end of the scrollable key row.
            OutlinedButton(
                enabled = writable,
                onClick = { scope.launch { runtime.terminal.write("\u0003") } },
            ) { Text(stringResource(R.string.terminal_control_c)) }
            Button(
                enabled = writable && input.isNotEmpty(),
                onClick = { sendInput(runtime, input, scope) { input = "" } },
            ) { Text(stringResource(R.string.terminal_send)) }
        }
        TerminalKeyAccessory(
            isEnabled = writable,
            ctrlActive = ctrlModifierActive,
            onCtrlToggle = { ctrlModifierActive = !ctrlModifierActive },
            onKey = { key ->
                val sequence = terminalVirtualKeySequence(key, ctrlModifierActive)
                ctrlModifierActive = false
                scope.launch { runtime.terminal.write(sequence) }
            },
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            trailingContent = {
                OutlinedButton(
                    enabled = writable,
                    onClick = { scope.launch { runtime.terminal.write("\t") } },
                ) { Text(stringResource(R.string.terminal_tab)) }
                OutlinedButton(
                    enabled = canStartProjectTerminal(
                        canOperate = canOperate,
                        busy = busy,
                        hasTerminalLease = state.lease != null,
                        hasProjectLocation = projectLocation != null,
                    ),
                    onClick = {
                        val location = projectLocation ?: return@OutlinedButton
                        scope.launch {
                            runtime.startTerminal(
                                terminalStartInput(location, measuredSize, density, terminalCellSize),
                            )
                        }
                    },
                ) { Text(stringResource(R.string.terminal_start)) }
                OutlinedButton(
                    enabled = canOperate && !busy && state.lease != null,
                    onClick = { showsCloseConfirmation = true },
                ) { Text(stringResource(R.string.terminal_close)) }
            },
        )
    }
    if (showsCloseConfirmation) {
        AlertDialog(
            onDismissRequest = { showsCloseConfirmation = false },
            title = { Text(stringResource(R.string.terminal_close_confirm_title)) },
            text = { Text(stringResource(R.string.terminal_close_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showsCloseConfirmation = false
                    scope.launch { runtime.terminal.close() }
                }) { Text(stringResource(R.string.terminal_close)) }
            },
            dismissButton = {
                TextButton(onClick = { showsCloseConfirmation = false }) {
                    Text(stringResource(R.string.terminal_cancel))
                }
            },
        )
    }
}

/** Builds one line's [AnnotatedString], falling back to the plain string when there is no style. */
private fun terminalLineAnnotatedString(
    runs: List<TerminalStyledRun>,
    plainLine: String,
): AnnotatedString {
    if (runs.isEmpty()) return AnnotatedString(plainLine.ifEmpty { " " })
    return buildAnnotatedString {
        for (run in runs) {
            var foreground = terminalAnsiColor(run.style.foreground) ?: Color(0xFFE5E7EB)
            var background = terminalAnsiColor(run.style.background) ?: Color.Transparent
            if (run.style.inverse) {
                val swap = foreground
                foreground = if (background == Color.Transparent) Color(0xFF101214) else background
                background = swap
            }
            withStyle(
                SpanStyle(
                    color = foreground,
                    background = background,
                    fontWeight = if (run.style.bold) FontWeight.Bold else FontWeight.Normal,
                    fontStyle = if (run.style.italic) FontStyle.Italic else FontStyle.Normal,
                    textDecoration = if (run.style.underline) TextDecoration.Underline else TextDecoration.None,
                ),
            ) {
                append(run.text)
            }
        }
    }
}

internal fun shouldAutoStartProjectTerminal(
    autoStartKey: String?,
    autoStartRequested: Boolean,
    canOperate: Boolean,
    busy: Boolean,
    hasTerminalLease: Boolean,
    hasProjectLocation: Boolean,
): Boolean = autoStartKey != null && !autoStartRequested &&
    canStartProjectTerminal(canOperate, busy, hasTerminalLease, hasProjectLocation)

internal fun canStartProjectTerminal(
    canOperate: Boolean,
    busy: Boolean,
    hasTerminalLease: Boolean,
    hasProjectLocation: Boolean,
): Boolean =
    canOperate &&
    !busy &&
    !hasTerminalLease &&
    hasProjectLocation

@Composable
private fun TerminalStatusRow(
    phase: TerminalConnectionPhase,
    failure: TerminalConnectionFailure?,
    processState: TerminalProcessState?,
    busy: Boolean,
    onReconnect: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 40.dp).padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = terminalStatusText(phase, failure, processState),
            style = MaterialTheme.typography.labelMedium,
            color = if (failure == null) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.error
            },
            modifier = Modifier.weight(1f),
        )
        if (phase == TerminalConnectionPhase.Failed) {
            OutlinedButton(onClick = onReconnect, enabled = !busy) {
                Text(stringResource(R.string.terminal_reconnect))
            }
        }
    }
}

@Composable
private fun terminalStatusText(
    phase: TerminalConnectionPhase,
    failure: TerminalConnectionFailure?,
    processState: TerminalProcessState?,
): String = when {
    failure == TerminalConnectionFailure.Authentication ->
        stringResource(R.string.terminal_status_authentication)
    failure == TerminalConnectionFailure.Permission ->
        stringResource(R.string.terminal_status_permission)
    failure == TerminalConnectionFailure.Unsupported ->
        stringResource(R.string.terminal_status_unsupported)
    failure == TerminalConnectionFailure.Protocol ->
        stringResource(R.string.terminal_status_protocol)
    failure == TerminalConnectionFailure.Offline -> stringResource(R.string.terminal_status_offline)
    phase == TerminalConnectionPhase.Reconnecting ->
        stringResource(R.string.terminal_status_reconnecting)
    phase == TerminalConnectionPhase.Connecting -> stringResource(R.string.terminal_status_connecting)
    phase == TerminalConnectionPhase.WaitingForBaseline ->
        stringResource(R.string.terminal_status_synchronizing)
    phase == TerminalConnectionPhase.Suspended -> stringResource(R.string.terminal_status_suspended)
    phase == TerminalConnectionPhase.Failed -> stringResource(R.string.terminal_status_failed)
    processState == TerminalProcessState.Exited -> stringResource(R.string.terminal_status_exited)
    phase == TerminalConnectionPhase.Live -> stringResource(R.string.terminal_status_live)
    else -> stringResource(R.string.terminal_status_idle)
}

private fun sendInput(
    runtime: RichChatSessionRuntime,
    input: String,
    scope: kotlinx.coroutines.CoroutineScope,
    onSuccess: () -> Unit,
) {
    if (input.isEmpty()) return
    scope.launch {
        if (runtime.terminal.write("$input\n") is RichChatOperationResult.Success) onSuccess()
    }
}

private fun terminalStartInput(
    location: ProjectLocation,
    measuredSize: Pair<Int, Int>,
    density: androidx.compose.ui.unit.Density,
    cellSize: Pair<Int, Int>,
): TerminalStartInput {
    val shellId = java.util.UUID.randomUUID().toString()
    val projectLocation = RemoteJson.encodeToJsonElement(
        ProjectLocation.serializer(),
        location,
    ) as kotlinx.serialization.json.JsonObject
    val dimensions = terminalDimensions(measuredSize, density, cellSize)
    val columns = dimensions?.first?.coerceAtLeast(20)
    val rows = dimensions?.second?.coerceAtLeast(5)
    return TerminalStartInput(
        shellId = shellId,
        projectLocation = projectLocation,
        initialColumns = columns,
        initialRows = rows,
    )
}

private fun terminalDimensions(
    measuredSize: Pair<Int, Int>,
    density: androidx.compose.ui.unit.Density,
    cellSize: Pair<Int, Int>,
): Pair<Int, Int>? {
    val (width, height) = measuredSize
    if (width <= 0 || height <= 0) return null
    val horizontalPadding = with(density) { 20.dp.toPx() }
    val verticalPadding = with(density) { 16.dp.toPx() }
    val contentWidth = (width - horizontalPadding).coerceAtLeast(1f)
    val contentHeight = (height - verticalPadding).coerceAtLeast(1f)
    return (contentWidth / cellSize.first).toInt().coerceAtLeast(1) to
        (contentHeight / cellSize.second).toInt().coerceAtLeast(1)
}

private const val MAX_INPUT_UTF16_UNITS = 8_192
