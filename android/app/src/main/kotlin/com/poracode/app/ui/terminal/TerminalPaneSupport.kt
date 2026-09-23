package com.poracode.app.ui.terminal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.TerminalStartInput
import kotlinx.coroutines.launch

/**
 * Presentation helpers extracted from [RichTerminalPane] so the pane stays under
 * the repo's 500-line production-file gate: line styling for the ANSI-styled
 * transcript, the status row, and the composer input/start dimension helpers.
 */

/** Builds one line's [AnnotatedString], falling back to the plain string when there is no style. */
internal fun terminalLineAnnotatedString(
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

@Composable
internal fun TerminalStatusRow(
    phase: TerminalConnectionPhase,
    failure: TerminalConnectionFailure?,
    processState: TerminalProcessState?,
    busy: Boolean,
    showRetry: Boolean,
    hasTerminalLease: Boolean,
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
        if (phase == TerminalConnectionPhase.Failed || showRetry) {
            OutlinedButton(onClick = onReconnect, enabled = !busy) {
                // With a lease the tap re-watches (Reconnect); with none it starts a
                // fresh shell, so the label matches the action it performs.
                Text(
                    stringResource(
                        if (hasTerminalLease) R.string.terminal_reconnect else R.string.terminal_start,
                    ),
                )
            }
        }
    }
}

@Composable
internal fun terminalStatusText(
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

internal fun sendInput(
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

internal fun terminalStartInput(
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

internal fun terminalDimensions(
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

internal const val MAX_INPUT_UTF16_UNITS = 8_192
