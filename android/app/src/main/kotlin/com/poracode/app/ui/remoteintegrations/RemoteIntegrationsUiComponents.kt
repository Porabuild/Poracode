package com.poracode.app.ui.remoteintegrations

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
import com.poracode.app.session.remoteintegrations.IntegrationFailure
import com.poracode.app.session.remoteintegrations.IntegrationMutationOutcome

@Composable
internal fun RemoteIntegrationsAccessBanner(
    access: RemoteIntegrationsAccess,
    section: RemoteIntegrationsSection,
) {
    val missingScope = when (section) {
        RemoteIntegrationsSection.Update -> !access.canManageProjects
        RemoteIntegrationsSection.Schedules, RemoteIntegrationsSection.PrWatches -> !access.canRead
    }
    val message = when {
        !access.hasHost -> stringResource(R.string.remote_integrations_no_host)
        !access.compatible -> stringResource(R.string.remote_integrations_protocol_mismatch)
        !access.ready -> stringResource(R.string.remote_integrations_not_ready)
        !access.online -> stringResource(R.string.remote_integrations_offline)
        missingScope -> stringResource(R.string.remote_integrations_missing_scope)
        else -> null
    } ?: return
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(
            Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (!access.online) Icons.Outlined.CloudOff else Icons.Outlined.Lock, null)
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
internal fun IntegrationSectionCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
internal fun IntegrationLoading() {
    Row(
        Modifier.fillMaxWidth().padding(16.dp).semantics(mergeDescendants = true) {
            liveRegion = LiveRegionMode.Polite
        },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator()
        Text(stringResource(R.string.remote_integrations_loading))
    }
}

@Composable
internal fun IntegrationFailureView(
    failure: IntegrationFailure?,
    onRetry: (() -> Unit)? = null,
) {
    if (failure == null) return
    Column(
        Modifier.fillMaxWidth().padding(16.dp).semantics(mergeDescendants = true) {
            liveRegion = LiveRegionMode.Assertive
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error)
        Text(
            integrationFailureMessage(failure),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (onRetry != null) {
            Button(onClick = onRetry) { Text(stringResource(R.string.remote_integrations_retry)) }
        }
    }
}

@Composable
internal fun IntegrationMutationMessage(outcome: IntegrationMutationOutcome?) {
    if (outcome == null) return
    val error = !outcome.applied
    val message = when {
        outcome.applied -> stringResource(R.string.remote_integrations_change_applied)
        outcome.uncertain && outcome.refreshedAfterAmbiguity ->
            stringResource(R.string.remote_integrations_change_uncertain_refreshed)
        outcome.uncertain -> stringResource(R.string.remote_integrations_change_uncertain)
        else -> stringResource(R.string.remote_integrations_request_failed)
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
            null,
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
private fun integrationFailureMessage(failure: IntegrationFailure): String = when (failure) {
    IntegrationFailure.NoHost -> stringResource(R.string.remote_integrations_no_host)
    IntegrationFailure.Offline -> stringResource(R.string.remote_integrations_offline)
    IntegrationFailure.NotReady -> stringResource(R.string.remote_integrations_not_ready)
    IntegrationFailure.ProtocolMismatch ->
        stringResource(R.string.remote_integrations_protocol_mismatch)
    IntegrationFailure.AuthenticationRequired ->
        stringResource(R.string.remote_integrations_authentication_required)
    is IntegrationFailure.PermissionDenied ->
        stringResource(R.string.remote_integrations_missing_scope)
    is IntegrationFailure.Remote -> when (failure.code) {
        "host_update_unavailable" -> stringResource(R.string.remote_integrations_update_unavailable)
        "host_update_not_ready" -> stringResource(R.string.remote_integrations_update_not_ready)
        "schedules_unavailable" -> stringResource(R.string.remote_integrations_schedules_unavailable)
        "pr_watches_unavailable" -> stringResource(R.string.remote_integrations_pr_unavailable)
        else -> stringResource(R.string.remote_integrations_request_failed)
    }
}
