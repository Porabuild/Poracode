package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Sync
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
internal fun ProjectAccessBanner(lease: ProjectHostLease?, access: ProjectUiAccess) {
    val message = when {
        lease == null -> stringResource(R.string.projects_no_session)
        !access.online -> stringResource(R.string.projects_offline)
        !access.ready -> stringResource(R.string.projects_session_not_ready)
        !access.canManage -> stringResource(R.string.projects_manage_denied)
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
internal fun ProjectFailureText(
    failure: ProjectOperationFailure?,
    modifier: Modifier = Modifier,
) {
    if (failure == null) return
    Text(
        projectFailureMessage(failure),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = modifier,
    )
}

@Composable
internal fun ProjectSection(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Card(modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
internal fun SavingStatus(pending: Boolean, saving: Boolean, failed: Boolean) {
    val text = when {
        failed -> stringResource(R.string.projects_save_failed)
        saving -> stringResource(R.string.projects_saving)
        pending -> stringResource(R.string.projects_changes_pending)
        else -> stringResource(R.string.projects_saved)
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (pending || saving) Icon(Icons.Outlined.Sync, contentDescription = null)
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = if (failed) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

@Composable
private fun projectFailureMessage(failure: ProjectOperationFailure): String = when (failure) {
    ProjectOperationFailure.NoSession -> stringResource(R.string.projects_no_session)
    ProjectOperationFailure.Offline -> stringResource(R.string.projects_offline)
    ProjectOperationFailure.SessionNotReady ->
        stringResource(R.string.projects_session_not_ready)
    ProjectOperationFailure.AuthenticationRequired ->
        stringResource(R.string.projects_authentication_required)
    is ProjectOperationFailure.AuthorizationDenied ->
        stringResource(R.string.projects_permission_denied)
    ProjectOperationFailure.InvalidProjectIdentity ->
        stringResource(R.string.projects_project_changed)
    ProjectOperationFailure.InvalidResponse ->
        stringResource(R.string.projects_invalid_response)
    is ProjectOperationFailure.Remote -> if (failure.requestMayHaveCommitted) {
        stringResource(R.string.projects_request_uncertain)
    } else {
        stringResource(R.string.projects_request_failed)
    }
}
