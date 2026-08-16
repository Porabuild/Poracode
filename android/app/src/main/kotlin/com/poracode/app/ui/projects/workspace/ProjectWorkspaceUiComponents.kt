package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectOperationFailure

@Composable
internal fun ProjectWorkspaceAccessBanner(
    lease: ProjectHostLease?,
    access: ProjectWorkspaceAccess,
) {
    val message = when {
        lease == null -> stringResource(R.string.workspace_no_session)
        !access.exactHost -> stringResource(R.string.workspace_wrong_desktop)
        !access.online -> stringResource(R.string.workspace_offline)
        !access.ready -> stringResource(R.string.workspace_not_ready)
        !access.canRead -> stringResource(R.string.workspace_read_denied)
        else -> null
    } ?: return
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
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
internal fun ProjectWorkspaceFailureCard(
    failure: ProjectOperationFailure?,
    saving: Boolean = false,
    modifier: Modifier = Modifier,
) {
    if (failure == null) return
    val message = if (saving) {
        if (failure.isAmbiguousSaveFailure()) {
            stringResource(R.string.workspace_save_uncertain)
        } else {
            stringResource(R.string.workspace_save_failed)
        }
    } else {
        workspaceFailureText(failure)
    }
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Row(
            Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.WarningAmber, contentDescription = null)
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun workspaceFailureText(failure: ProjectOperationFailure): String = when (failure) {
    ProjectOperationFailure.NoSession -> stringResource(R.string.workspace_no_session)
    ProjectOperationFailure.Offline -> stringResource(R.string.workspace_offline)
    ProjectOperationFailure.SessionNotReady -> stringResource(R.string.workspace_not_ready)
    ProjectOperationFailure.AuthenticationRequired ->
        stringResource(R.string.workspace_authentication_required)
    is ProjectOperationFailure.AuthorizationDenied ->
        stringResource(R.string.workspace_permission_denied)
    ProjectOperationFailure.InvalidProjectIdentity ->
        stringResource(R.string.workspace_project_changed)
    ProjectOperationFailure.InvalidResponse ->
        stringResource(R.string.workspace_invalid_response)
    is ProjectOperationFailure.Remote -> stringResource(R.string.workspace_request_failed)
}

@Composable
internal fun WorkspaceMetadata(
    primary: String,
    secondary: String? = null,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        Text(primary, style = MaterialTheme.typography.labelLarge)
        if (secondary != null) {
            Text(
                secondary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
