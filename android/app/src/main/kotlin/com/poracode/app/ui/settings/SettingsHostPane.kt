package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostLease

@Composable
internal fun SettingsHostPane(
    host: SettingsHostMetadata?,
    lease: SettingsHostLease?,
    access: SettingsUiAccess,
    modifier: Modifier = Modifier,
) {
    if (host == null || lease == null) {
        Column(
            modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Outlined.Computer, contentDescription = null)
            Text(stringResource(R.string.settings_no_host), Modifier.padding(top = 12.dp))
        }
        return
    }
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            host.label,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )
        SettingsSection(stringResource(R.string.settings_host_connection)) {
            val status = when {
                access.online && access.ready -> stringResource(R.string.settings_status_online)
                access.ready -> stringResource(R.string.settings_status_offline)
                else -> stringResource(R.string.settings_status_loading)
            }
            SettingsValueRow(stringResource(R.string.settings_host_status), status)
            SettingsValueRow(
                stringResource(R.string.settings_host_version),
                host.appVersion.ifBlank { stringResource(R.string.settings_value_unknown) },
            )
            SettingsValueRow(
                stringResource(R.string.settings_host_platform),
                host.platform?.takeIf(String::isNotBlank)
                    ?: stringResource(R.string.settings_value_unknown),
            )
            SettingsValueRow(
                stringResource(R.string.settings_host_mode),
                host.hostMode?.takeIf(String::isNotBlank)
                    ?: stringResource(R.string.settings_value_unknown),
            )
            SettingsValueRow(
                stringResource(R.string.settings_host_protocol),
                stringResource(R.string.settings_protocol_value, lease.protocolVersion),
            )
        }
        SettingsSection(stringResource(R.string.settings_host_access)) {
            SettingsAccessRow(
                stringResource(R.string.settings_read_access),
                access.canRead,
            )
            SettingsAccessRow(
                stringResource(R.string.settings_write_access),
                access.canWrite,
            )
        }
    }
}

@Composable
private fun SettingsAccessRow(label: String, allowed: Boolean) {
    val value = stringResource(
        if (allowed) R.string.settings_access_allowed else R.string.settings_access_not_allowed,
    )
    SettingsValueRow(label, value)
}
