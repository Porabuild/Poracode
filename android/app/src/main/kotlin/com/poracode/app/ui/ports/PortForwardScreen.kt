package com.poracode.app.ui.ports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ports.ActivePortForward
import com.poracode.app.model.ports.DetectedPort
import com.poracode.app.model.ports.DetectedPortProtocol
import com.poracode.app.model.ports.PortForwardFailure
import com.poracode.app.session.ports.PortForwardController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortForwardScreen(
    controller: PortForwardController,
    onBack: () -> Unit,
    openBrowser: (String) -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    var portText by rememberSaveable { mutableStateOf("") }
    val port = portText.toIntOrNull()

    LaunchedEffect(controller) { controller.refresh() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ports_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.ports_back),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = controller::refresh, enabled = !state.loading) {
                        Icon(
                            Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.ports_refresh),
                        )
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = portText,
                        onValueChange = { value ->
                            portText = value.filter(Char::isDigit).take(5)
                        },
                        label = { Text(stringResource(R.string.ports_target_port)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = { port?.let { controller.start(it, openBrowser) } },
                        enabled = port in 1..65_535 && !state.starting,
                    ) {
                        if (state.starting) {
                            CircularProgressIndicator(
                                modifier = Modifier.padding(end = 8.dp),
                                strokeWidth = 2.dp,
                            )
                        }
                        Text(stringResource(R.string.ports_start_open))
                    }
                }
            }

            state.failure?.let { failure ->
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                failureLabel(failure),
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = controller::clearFailure) {
                                Text(stringResource(R.string.ports_dismiss))
                            }
                        }
                    }
                }
            }

            item { SectionTitle(stringResource(R.string.ports_detected)) }
            if (state.detected.isEmpty()) {
                item { SecondaryText(stringResource(R.string.ports_no_detected)) }
            } else {
                items(state.detected, key = { "detected-${it.port}" }) { detected ->
                    DetectedPortRow(
                        port = detected,
                        enabled = !state.starting,
                        onForward = { controller.start(detected.port, openBrowser) },
                    )
                }
            }

            item { SectionTitle(stringResource(R.string.ports_active)) }
            if (state.forwards.isEmpty()) {
                item { SecondaryText(stringResource(R.string.ports_no_active)) }
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
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun DetectedPortRow(port: DetectedPort, enabled: Boolean, onForward: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(port.label ?: stringResource(R.string.ports_port_number, port.port))
                SecondaryText(
                    stringResource(
                        if (port.protocol == DetectedPortProtocol.Http) {
                            R.string.ports_protocol_http
                        } else {
                            R.string.ports_protocol_unknown
                        },
                    ),
                )
            }
            OutlinedButton(onClick = onForward, enabled = enabled) {
                Text(stringResource(R.string.ports_forward_port))
            }
        }
    }
}

@Composable
private fun ActiveForwardRow(
    forward: ActivePortForward,
    busy: Boolean,
    onOpen: () -> Unit,
    onStop: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.ports_forward_summary, forward.listenPort, forward.targetPort))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onOpen, enabled = !busy) {
                    Icon(Icons.Outlined.OpenInBrowser, contentDescription = null)
                    Text(
                        stringResource(R.string.ports_open),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                OutlinedButton(onClick = onStop, enabled = !busy) {
                    Text(
                        stringResource(
                            if (busy) R.string.ports_busy else R.string.ports_stop,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(value: String) = Text(
    value,
    style = MaterialTheme.typography.titleMedium,
    modifier = Modifier.padding(top = 8.dp),
)

@Composable
private fun SecondaryText(value: String) = Text(
    value,
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
        PortForwardFailure.AmbiguousDelivery -> R.string.ports_failure_ambiguous
        PortForwardFailure.Unavailable -> R.string.ports_failure_unavailable
    },
)
