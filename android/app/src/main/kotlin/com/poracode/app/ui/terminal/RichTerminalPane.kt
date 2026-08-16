package com.poracode.app.ui.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
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
    modifier: Modifier = Modifier,
) {
    val state by runtime.terminal.state.collectAsStateWithLifecycle()
    val transcript = state.cursor?.transcript.orEmpty()
    val buffer = remember(state.lease?.terminalId) { TerminalTextBuffer() }
    val document = remember(transcript, buffer) { buffer.update(transcript) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val outputDescription = stringResource(R.string.terminal_output_description)
    var input by remember(state.lease?.terminalId) { mutableStateOf("") }
    var measuredSize by remember { mutableStateOf(0 to 0) }
    val busy = state.activeOperations.isNotEmpty()
    val writable = canOperate && state.connection.phase == TerminalConnectionPhase.Live &&
        state.processState != TerminalProcessState.Exited

    LaunchedEffect(document.revision) {
        if (document.lines.isNotEmpty()) listState.scrollToItem(document.lines.lastIndex)
    }
    LaunchedEffect(measuredSize, canOperate, state.lease?.terminalId, state.connection.phase) {
        if (!canOperate || state.lease == null ||
            state.connection.phase != TerminalConnectionPhase.Live
        ) {
            return@LaunchedEffect
        }
        delay(150)
        val (width, height) = measuredSize
        if (width <= 0 || height <= 0) return@LaunchedEffect
        val columns = with(density) { (width / 8.5.dp.toPx()).toInt().coerceAtLeast(1) }
        val rows = with(density) { (height / 19.dp.toPx()).toInt().coerceAtLeast(1) }
        runtime.terminal.resize(columns, rows)
    }

    Column(modifier.fillMaxSize()) {
        TerminalStatusRow(
            phase = state.connection.phase,
            failure = state.connection.failure,
            processState = state.processState,
            busy = busy,
            onReconnect = runtime::reconnectTerminal,
        )
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color(0xFF101214))
                .onSizeChanged { measuredSize = it.width to it.height }
                .semantics {
                    contentDescription = outputDescription
                }
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            itemsIndexed(document.lines, key = { index, _ -> index }) { _, line ->
                Text(
                    text = line.ifEmpty { " " },
                    color = Color(0xFFE5E7EB),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    softWrap = false,
                )
            }
        }
        OutlinedTextField(
            value = input,
            onValueChange = { input = it.take(MAX_INPUT_UTF16_UNITS) },
            enabled = writable,
            label = { Text(stringResource(R.string.terminal_input_label)) },
            placeholder = { Text(stringResource(R.string.terminal_input_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = {
                sendInput(runtime, input, scope) { input = "" }
            }),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp)
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
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Button(
                enabled = writable && input.isNotEmpty(),
                onClick = { sendInput(runtime, input, scope) { input = "" } },
            ) { Text(stringResource(R.string.terminal_send)) }
            OutlinedButton(
                enabled = writable,
                onClick = { scope.launch { runtime.terminal.write("\u0003") } },
            ) { Text(stringResource(R.string.terminal_control_c)) }
            OutlinedButton(
                enabled = writable,
                onClick = { scope.launch { runtime.terminal.write("\t") } },
            ) { Text(stringResource(R.string.terminal_tab)) }
            Box(Modifier.weight(1f))
            OutlinedButton(
                enabled = canOperate && !busy && projectLocation != null,
                onClick = {
                    val location = projectLocation ?: return@OutlinedButton
                    scope.launch {
                        runtime.startTerminal(
                            terminalStartInput(location, measuredSize, density),
                        )
                    }
                },
            ) { Text(stringResource(R.string.terminal_start)) }
            OutlinedButton(
                enabled = canOperate && !busy,
                onClick = { scope.launch { runtime.terminal.close() } },
            ) { Text(stringResource(R.string.terminal_close)) }
        }
    }
}

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
): TerminalStartInput {
    val shellId = java.util.UUID.randomUUID().toString()
    val projectLocation = RemoteJson.encodeToJsonElement(
        ProjectLocation.serializer(),
        location,
    ) as kotlinx.serialization.json.JsonObject
    val (width, height) = measuredSize
    val columns = if (width > 0) with(density) { (width / 8.5.dp.toPx()).toInt().coerceAtLeast(20) } else null
    val rows = if (height > 0) with(density) { (height / 19.dp.toPx()).toInt().coerceAtLeast(5) } else null
    return TerminalStartInput(
        shellId = shellId,
        projectLocation = projectLocation,
        initialColumns = columns,
        initialRows = rows,
    )
}

private const val MAX_INPUT_UTF16_UNITS = 8_192
