package com.poracode.app.ui.remoteintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.remoteintegrations.HostUpdateStatus
import com.poracode.app.session.remoteintegrations.IntegrationSlot
import com.poracode.app.session.remoteintegrations.RemoteIntegrationsState

@Composable
internal fun RemoteUpdatePane(
    state: RemoteIntegrationsState,
    access: RemoteIntegrationsAccess,
    composition: RemoteIntegrationsComposition,
    modifier: Modifier = Modifier,
) {
    var confirmInstall by remember { mutableStateOf(false) }
    val loading = IntegrationSlot.Update in state.loading
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            IntegrationSectionCard(stringResource(R.string.remote_integrations_update_status)) {
                if (loading && state.update == null) IntegrationLoading()
                val update = state.update
                if (update != null) {
                    Text(
                        stringResource(
                            R.string.remote_integrations_current_version,
                            update.currentVersion,
                        ),
                    )
                    UpdateStatusView(update.status)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OutlinedButton(
                            onClick = composition::checkUpdate,
                            enabled = access.canManageProjects && !loading,
                        ) { Text(stringResource(R.string.remote_integrations_check_update)) }
                        if (update.status is HostUpdateStatus.Downloaded) {
                            Button(
                                onClick = { confirmInstall = true },
                                enabled = access.canManageProjects && !loading,
                            ) { Text(stringResource(R.string.remote_integrations_install_update)) }
                        }
                    }
                }
                IntegrationFailureView(state.failures[IntegrationSlot.Update]) {
                    composition.refresh(RemoteIntegrationsSection.Update)
                }
                IntegrationMutationMessage(state.mutation)
            }
        }
    }
    if (confirmInstall) {
        AlertDialog(
            onDismissRequest = { confirmInstall = false },
            title = { Text(stringResource(R.string.remote_integrations_install_confirm_title)) },
            text = { Text(stringResource(R.string.remote_integrations_install_confirm_message)) },
            confirmButton = {
                Button(onClick = {
                    confirmInstall = false
                    composition.installUpdate()
                }) { Text(stringResource(R.string.remote_integrations_install)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmInstall = false }) {
                    Text(stringResource(R.string.remote_integrations_cancel))
                }
            },
        )
    }
}

@Composable
private fun UpdateStatusView(status: HostUpdateStatus) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (status) {
            HostUpdateStatus.Idle -> Text(stringResource(R.string.remote_integrations_update_idle))
            HostUpdateStatus.Checking -> Text(stringResource(R.string.remote_integrations_checking))
            is HostUpdateStatus.Available -> Text(
                stringResource(R.string.remote_integrations_version_available, status.version),
            )
            HostUpdateStatus.Current -> Text(stringResource(R.string.remote_integrations_up_to_date))
            is HostUpdateStatus.Downloading -> {
                Text(stringResource(R.string.remote_integrations_downloading, status.percent.toInt()))
                LinearProgressIndicator(
                    progress = { (status.percent / 100.0).toFloat() },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            is HostUpdateStatus.Downloaded -> Text(
                stringResource(R.string.remote_integrations_ready_to_install, status.version),
            )
            HostUpdateStatus.Failed -> Text(stringResource(R.string.remote_integrations_update_failed))
        }
    }
}
