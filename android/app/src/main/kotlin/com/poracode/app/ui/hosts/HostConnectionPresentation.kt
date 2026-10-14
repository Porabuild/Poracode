package com.poracode.app.ui.hosts

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.HostRecord
import com.poracode.app.transport.RemoteWebSocketClient

@Composable
internal fun hostConnectionStateLabel(state: RemoteWebSocketClient.ConnectionState): String =
    stringResource(
        when (state) {
            RemoteWebSocketClient.ConnectionState.Idle -> R.string.socket_idle
            RemoteWebSocketClient.ConnectionState.Connecting -> R.string.socket_connecting
            RemoteWebSocketClient.ConnectionState.Online -> R.string.hosts_connected
            RemoteWebSocketClient.ConnectionState.Reconnecting -> R.string.socket_reconnecting
            RemoteWebSocketClient.ConnectionState.Suspended -> R.string.socket_suspended
            RemoteWebSocketClient.ConnectionState.Failed -> R.string.socket_failed
            RemoteWebSocketClient.ConnectionState.SessionExpired -> R.string.socket_session_expired
        },
    )

/**
 * Mode is always named explicitly (ADR §9): a host-owned environment record is
 * never presented as a device-local SSH pairing, so a user can tell where
 * credentials and work live.
 */
@Composable
internal fun hostModeLabel(host: HostRecord): String = stringResource(
    if (host.environment != null) {
        R.string.environments_mode_host_owned
    } else {
        R.string.environments_mode_device_local
    },
)
