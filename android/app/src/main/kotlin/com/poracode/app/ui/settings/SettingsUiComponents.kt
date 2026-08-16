package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsOperationFailure

@Composable
internal fun SettingsAccessBanner(
    access: SettingsUiAccess,
    needsRead: Boolean,
) {
    val message = when {
        !access.hasSelection -> stringResource(R.string.settings_no_host)
        !access.compatible -> stringResource(R.string.settings_protocol_mismatch)
        !access.ready -> stringResource(R.string.settings_not_ready)
        !access.online -> stringResource(R.string.settings_offline)
        needsRead && !access.canRead -> stringResource(R.string.settings_read_denied)
        else -> null
    } ?: return
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (!access.online) Icons.Outlined.CloudOff else Icons.Outlined.Lock,
                contentDescription = null,
            )
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
internal fun SettingsSection(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Card(modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            content()
        }
    }
}

@Composable
internal fun SettingsValueRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun SettingsLoading(message: String) {
    Row(
        Modifier.fillMaxWidth().padding(16.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator()
        Text(message)
    }
}

@Composable
internal fun SettingsFailure(
    failure: SettingsOperationFailure?,
    onRetry: (() -> Unit)? = null,
) {
    if (failure == null) return
    val message = settingsFailureMessage(failure)
    Column(
        Modifier.fillMaxWidth().padding(16.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Assertive },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Outlined.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
        )
        Text(
            message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (onRetry != null) {
            Button(onClick = onRetry) { Text(stringResource(R.string.settings_retry)) }
        }
    }
}

@Composable
internal fun SettingsMutationMessage(outcome: SettingsMutationOutcome?) {
    val (message, error) = when (outcome) {
        SettingsMutationOutcome.Applied -> stringResource(R.string.settings_saved) to false
        SettingsMutationOutcome.Stale -> stringResource(R.string.settings_host_changed) to true
        is SettingsMutationOutcome.Failed -> if (outcome.refreshedAfterAmbiguousResult) {
            stringResource(R.string.settings_change_uncertain) to true
        } else {
            settingsFailureMessage(outcome.failure) to true
        }
        null -> return
    }
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            liveRegion = if (error) LiveRegionMode.Assertive else LiveRegionMode.Polite
        },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (error) Icons.Outlined.ErrorOutline else Icons.Outlined.Sync,
            contentDescription = null,
            tint = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        )
        Text(
            message,
            color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun settingsFailureMessage(failure: SettingsOperationFailure): String = when (failure) {
    SettingsOperationFailure.NoSession -> stringResource(R.string.settings_no_host)
    SettingsOperationFailure.Offline -> stringResource(R.string.settings_offline)
    SettingsOperationFailure.SessionNotReady -> stringResource(R.string.settings_not_ready)
    SettingsOperationFailure.ProtocolMismatch ->
        stringResource(R.string.settings_protocol_mismatch)
    SettingsOperationFailure.AuthenticationRequired ->
        stringResource(R.string.settings_authentication_required)
    is SettingsOperationFailure.AuthorizationDenied ->
        stringResource(R.string.settings_permission_denied)
    is SettingsOperationFailure.Remote -> if (failure.requestMayHaveCommitted) {
        stringResource(R.string.settings_change_uncertain)
    } else {
        stringResource(R.string.settings_request_failed)
    }
}
