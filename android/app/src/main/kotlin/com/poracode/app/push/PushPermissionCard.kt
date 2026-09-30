package com.poracode.app.push

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
fun PushPermissionCard(state: PushUiState, onAction: () -> Unit) {
    val content = when (state.availability) {
        PushAvailability.NotConfigured -> Triple(
            R.string.push_not_configured_title,
            R.string.push_not_configured_message,
            null,
        )
        PushAvailability.StorageUnavailable -> Triple(
            R.string.push_unavailable_title,
            R.string.push_unavailable_message,
            null,
        )
        PushAvailability.PermissionRequired -> Triple(
            R.string.push_permission_title,
            R.string.push_permission_message,
            R.string.push_permission_enable,
        )
        PushAvailability.PermissionDenied -> Triple(
            R.string.push_permission_denied_title,
            R.string.push_permission_denied_message,
            R.string.push_permission_open_settings,
        )
        PushAvailability.TokenPending, PushAvailability.Available -> return
    }
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(content.first), style = MaterialTheme.typography.titleSmall)
                Text(
                    stringResource(content.second),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            content.third?.let { label ->
                Button(onClick = onAction) { Text(stringResource(label)) }
            }
        }
    }
}
