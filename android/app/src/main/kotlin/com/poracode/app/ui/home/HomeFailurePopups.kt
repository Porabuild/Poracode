package com.poracode.app.ui.home

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeMetrics

/** Room under the list for the floating bottom row (`--m-floating-control-height` + gaps). */
internal val HomeFloatingDockClearance = 96.dp

@Composable
internal fun rememberHomeFailurePopups(
    globalError: String?,
    connectionError: String?,
    onAckGlobalError: (String) -> Unit,
): SnackbarHostState {
    val hostState = remember { SnackbarHostState() }
    val currentOnAckGlobalError by rememberUpdatedState(onAckGlobalError)

    LaunchedEffect(globalError) {
        val message = globalError ?: return@LaunchedEffect
        val result = hostState.showSnackbar(
            message = message,
            withDismissAction = true,
            duration = SnackbarDuration.Long,
        )
        if (result == SnackbarResult.Dismissed) currentOnAckGlobalError(message)
    }
    LaunchedEffect(connectionError) {
        val message = connectionError ?: return@LaunchedEffect
        hostState.showSnackbar(
            message = message,
            withDismissAction = true,
            duration = SnackbarDuration.Long,
        )
    }
    return hostState
}

@Composable
internal fun HomeFailurePopups(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier,
    aboveDock: Boolean = true,
) {
    val dockClearance = if (aboveDock) {
        Modifier.imePadding().navigationBarsPadding().padding(bottom = HomeFloatingDockClearance)
    } else {
        Modifier
    }
    SnackbarHost(
        hostState = hostState,
        modifier = modifier
            .padding(horizontal = PoracodeMetrics.pageInline)
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .then(dockClearance),
    )
}
