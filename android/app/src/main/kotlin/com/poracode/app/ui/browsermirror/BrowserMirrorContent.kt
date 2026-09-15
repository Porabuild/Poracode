package com.poracode.app.ui.browsermirror

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.browsermirror.BrowserMirrorAvailability
import com.poracode.app.session.browsermirror.BrowserMirrorController
import com.poracode.app.session.browsermirror.BrowserMirrorFailure
import com.poracode.app.session.browsermirror.BrowserMirrorUiState

@Composable
internal fun BrowserContent(
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
        Text(
            stringResource(R.string.browser_mirror_privacy_notice),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
        )
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
