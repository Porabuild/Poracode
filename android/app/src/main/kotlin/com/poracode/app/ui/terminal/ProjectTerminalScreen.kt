package com.poracode.app.ui.terminal

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.session.richchat.RichChatSessionRuntime
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectTerminalScreen(
    runtime: RichChatSessionRuntime,
    canOperate: Boolean,
    projectName: String?,
    projectLocation: ProjectLocation?,
    activationKey: String?,
    initialCommand: String? = null,
    terminalTextSizeSp: Int = 13,
    onBack: () -> Unit,
) {
    val initialTerminalLease = remember(activationKey, initialCommand) {
        runtime.terminal.state.value.lease
    }
    val terminalState by runtime.terminal.state.collectAsStateWithLifecycle()
    var initialCommandSent by remember(activationKey, initialCommand) { mutableStateOf(false) }
    LaunchedEffect(
        activationKey,
        initialCommand,
        terminalState.lease,
        terminalState.connection.phase,
    ) {
        val command = initialCommand ?: return@LaunchedEffect
        if (shouldSendProjectInitialCommand(
                command = command,
                sent = initialCommandSent,
                hasLease = terminalState.lease != null,
                freshLease = terminalState.lease != initialTerminalLease,
                phase = terminalState.connection.phase,
            )
        ) {
            // At-most-once: a disconnected write can have an ambiguous outcome, so never replay it.
            initialCommandSent = true
            runtime.terminal.write("${command.trimEnd()}\n")
        }
    }
    BackHandler(onBack = onBack)
    DisposableEffect(runtime) {
        runtime.presentProjectTerminalSurface()
        onDispose(runtime::dismissProjectTerminalSurface)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(projectName ?: stringResource(R.string.terminal_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        RichTerminalPane(
            runtime = runtime,
            canOperate = canOperate,
            projectLocation = projectLocation,
            autoStartKey = activationKey,
            textSizeSp = terminalTextSizeSp,
            modifier = Modifier.fillMaxSize().padding(padding),
        )
    }
}

internal fun shouldSendProjectInitialCommand(
    command: String,
    sent: Boolean,
    hasLease: Boolean,
    freshLease: Boolean,
    phase: TerminalConnectionPhase,
): Boolean = command.isNotBlank() && !sent && hasLease && freshLease &&
    phase == TerminalConnectionPhase.Live
