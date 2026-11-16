package com.poracode.app.ui.ports

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ports.ActivePortForward
import com.poracode.app.model.ports.DetectedPort
import com.poracode.app.model.ports.DetectedPortProtocol
import com.poracode.app.model.ports.PortForwardFailure
import com.poracode.app.session.ports.PortForwardController
import com.poracode.app.ui.components.PoracodeBottomBar
import com.poracode.app.ui.components.PoracodeCircleButton
import com.poracode.app.ui.components.PoracodeHazeHost
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeSectionLabel
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import androidx.compose.material3.FilledTonalButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortForwardScreen(
    controller: PortForwardController,
    onBack: () -> Unit,
    openBrowser: (String) -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    var portText by rememberSaveable { mutableStateOf("") }
    var showStart by rememberSaveable { mutableStateOf(false) }
    val port = portText.toIntOrNull()
    val colors = PoracodeTheme.colors

    LaunchedEffect(controller) { controller.refresh() }

    Scaffold(
        topBar = {
            PoracodeTopAppBar(
                title = { Text(stringResource(R.string.ports_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            PoracodeIcons.ArrowBack,
                            contentDescription = stringResource(R.string.ports_back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        PoracodeHazeHost { backdrop ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = PoracodeMetrics.pageInline)
                    .then(backdrop),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.ports_intro),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }

                state.failure?.let { failure ->
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    colors.danger.copy(alpha = 0.12f),
                                    RoundedCornerShape(PoracodeRadius.row),
                                )
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                PoracodeIcons.ErrorOutline,
                                contentDescription = null,
                                tint = colors.danger,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                failureLabel(failure),
                                color = colors.danger,
                                style = PoracodeTextStyles.rowDescription,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(start = 8.dp),
                            )
                            TextButton(onClick = controller::clearFailure) {
                                Text(stringResource(R.string.ports_dismiss))
                            }
                        }
                    }
                }

                item {
                    PoracodeSectionLabel(
                        stringResource(R.string.ports_detected),
                        Modifier.padding(top = 6.dp),
                    )
                }
                if (state.detected.isEmpty()) {
                    item { EmptyText(stringResource(R.string.ports_no_detected)) }
                } else {
                    items(state.detected, key = { "detected-${it.port}" }) { detected ->
                        DetectedPortRow(
                            port = detected,
                            enabled = !state.starting,
                            onForward = { controller.start(detected.port, openBrowser) },
                        )
                    }
                }

                item {
                    PoracodeSectionLabel(
                        stringResource(R.string.ports_active),
                        Modifier.padding(top = 6.dp),
                    )
                }
                if (state.forwards.isEmpty()) {
                    item { EmptyText(stringResource(R.string.ports_no_active)) }
                } else {
                    items(state.forwards, key = ActivePortForward::id) { forward ->
                        ActiveForwardRow(
                            forward = forward,
                            busy = forward.id in state.busyForwardIds,
                            onOpen = { controller.open(forward.id, openBrowser) },
                            onStop = { controller.stop(forward.id) },
                        )
                    }
                }
                item { Spacer(Modifier.height(96.dp)) }
            }
            PoracodeBottomBar(
                Modifier.align(Alignment.BottomCenter),
                leading = {
                    PoracodeCircleButton(
                        icon = PoracodeIcons.Refresh,
                        contentDescription = stringResource(R.string.ports_refresh),
                        onClick = controller::refresh,
                        enabled = !state.loading,
                    )
                },
                trailing = {
                    PoracodeCircleButton(
                        icon = PoracodeIcons.Add,
                        contentDescription = stringResource(R.string.ports_forward_port),
                        onClick = { showStart = true },
                    )
                },
            )
            if (showStart) {
                PoracodeSheet(
                    onDismissRequest = { showStart = false },
                    title = stringResource(R.string.ports_forward_a_port),
                ) {
                    PoracodeTextField(
                        value = portText,
                        onValueChange = { value ->
                            portText = value.filter(Char::isDigit).take(5)
                        },
                        label = { Text(stringResource(R.string.ports_target_port)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    FilledTonalButton(
                        onClick = {
                            port?.let { controller.start(it, openBrowser) }
                            showStart = false
                        },
                        enabled = port in 1..65_535 && !state.starting,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (state.starting) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .padding(end = 8.dp)
                                    .size(16.dp),
                                strokeWidth = 2.dp,
                            )
                        }
                        Text(stringResource(R.string.ports_start_open))
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun DetectedPortRow(port: DetectedPort, enabled: Boolean, onForward: () -> Unit) {
    val colors = PoracodeTheme.colors
    PoracodeListRow(
        onClick = onForward,
        enabled = enabled,
        onClickLabel = stringResource(R.string.ports_forward_port),
    ) {
        Icon(
            PoracodeIcons.SettingsEthernet,
            contentDescription = null,
            modifier = Modifier.size(15.dp),
            tint = colors.muted,
        )
        Column(Modifier.weight(1f)) {
            Text(
                "localhost:${port.port}",
                style = MaterialTheme.typography.labelLarge,
                color = colors.foreground,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            Text(
                port.label ?: stringResource(
                    if (port.protocol == DetectedPortProtocol.Http) {
                        R.string.ports_protocol_http
                    } else {
                        R.string.ports_protocol_unknown
                    },
                ),
                style = PoracodeTextStyles.rowDescription,
                color = colors.muted,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        Icon(
            PoracodeIcons.NorthEast,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = colors.muted,
        )
    }
}

@Composable
private fun ActiveForwardRow(
    forward: ActivePortForward,
    busy: Boolean,
    onOpen: () -> Unit,
    onStop: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val stopLabel = stringResource(R.string.ports_stop)
    PoracodeListRow {
        Icon(
            PoracodeIcons.SettingsEthernet,
            contentDescription = null,
            modifier = Modifier.size(15.dp),
            tint = colors.muted,
        )
        Column(Modifier.weight(1f)) {
            Text(
                "localhost:${forward.listenPort}",
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                color = colors.foreground,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            Text(
                stringResource(R.string.ports_forward_summary, forward.listenPort, forward.targetPort),
                style = PoracodeTextStyles.rowDescription,
                color = colors.muted,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        PoracodeIconButton(
            icon = PoracodeIcons.NorthEast,
            contentDescription = stringResource(R.string.ports_open),
            onClick = onOpen,
            enabled = !busy,
            tint = colors.muted,
        )
        if (busy) {
            Box(
                Modifier
                    .size(PoracodeMetrics.tapTarget)
                    .semantics {
                        contentDescription = stopLabel
                    },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = colors.muted,
                )
            }
        } else {
            PoracodeIconButton(
                icon = PoracodeIcons.Close,
                contentDescription = stopLabel,
                onClick = onStop,
                enabled = !busy,
                tint = colors.muted,
            )
        }
    }
}

@Composable
private fun EmptyText(value: String) = Text(
    value,
    style = MaterialTheme.typography.bodySmall,
    color = PoracodeTheme.colors.muted,
)

@Composable
private fun failureLabel(failure: PortForwardFailure): String = stringResource(
    when (failure) {
        PortForwardFailure.Offline -> R.string.ports_failure_offline
        PortForwardFailure.MissingScope -> R.string.ports_failure_scope
        PortForwardFailure.Unauthorized -> R.string.ports_failure_auth
        PortForwardFailure.NotFound -> R.string.ports_failure_not_found
        PortForwardFailure.InvalidInput -> R.string.ports_failure_input
        PortForwardFailure.InvalidResponse -> R.string.ports_failure_response
        PortForwardFailure.BrowserUnavailable -> R.string.ports_failure_browser_unavailable
        PortForwardFailure.AmbiguousDelivery -> R.string.ports_failure_ambiguous
        PortForwardFailure.Unavailable -> R.string.ports_failure_unavailable
    },
)
