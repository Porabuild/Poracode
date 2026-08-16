package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.settings.SettingsHostInformationEntry
import com.poracode.app.session.settings.SettingsInformationSlot
import java.text.NumberFormat

@Composable
internal fun SettingsProfilePane(
    entry: SettingsHostInformationEntry?,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsIdentityDraft) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val projection = projectProfile(
        entry?.profileDevices,
        entry?.profileCoreStats,
        entry?.profileTokenStats,
        entry?.profileIdentity,
    )
    val loading = entry?.loading.orEmpty().any {
        it == SettingsInformationSlot.ProfileDevices ||
            it == SettingsInformationSlot.ProfileCoreStats ||
            it == SettingsInformationSlot.ProfileTokenStats
    }
    val failure = entry?.failures?.get(SettingsInformationSlot.ProfileDevices)
        ?: entry?.failures?.get(SettingsInformationSlot.ProfileCoreStats)
        ?: entry?.failures?.get(SettingsInformationSlot.ProfileTokenStats)
        ?: entry?.failures?.get(SettingsInformationSlot.ProfileIdentity)
    val hasProfile = entry?.profileCoreStats != null || entry?.profileIdentity != null
    if (!hasProfile && failure == null && access.canRead) {
        SettingsLoading(stringResource(R.string.settings_loading_profile))
        return
    }
    LazyColumn(
        modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (failure != null) item { SettingsFailure(failure, onRetry) }
        if (hasProfile) {
            item {
                SettingsIdentityEditor(
                    projection = projection,
                    access = access,
                    mutation = mutation,
                    leaseKey = leaseKey,
                    onSave = onSave,
                )
            }
            item { SettingsActivityCard(projection) }
            item { SettingsDevicesCard(projection.devices) }
        }
    }
}

@Composable
private fun SettingsIdentityEditor(
    projection: SettingsProfileProjection,
    access: SettingsUiAccess,
    mutation: SettingsMutationState,
    leaseKey: String?,
    onSave: (SettingsIdentityDraft) -> Unit,
) {
    var name by rememberSaveable(leaseKey) { mutableStateOf(projection.identity.name) }
    var handle by rememberSaveable(leaseKey) { mutableStateOf(projection.identity.handle) }
    var color by rememberSaveable(leaseKey) { mutableStateOf(projection.identity.avatarColor) }
    LaunchedEffect(projection.identity, mutation.profileSaving) {
        if (!mutation.profileSaving) {
            name = projection.identity.name
            handle = projection.identity.handle
            color = projection.identity.avatarColor
        }
    }
    val draft = SettingsIdentityDraft(name, handle, color)
    SettingsSection(stringResource(R.string.settings_profile_identity)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Person, contentDescription = null)
            Text(stringResource(R.string.settings_profile_identity_description))
        }
        OutlinedTextField(
            value = name,
            onValueChange = { if (it.length <= 80) name = it },
            label = { Text(stringResource(R.string.settings_profile_name)) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = handle,
            onValueChange = { if (it.length <= 41) handle = it },
            label = { Text(stringResource(R.string.settings_profile_handle)) },
            prefix = { Text("@") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = color,
            onValueChange = { if (it.length <= 64) color = it },
            label = { Text(stringResource(R.string.settings_profile_color)) },
            supportingText = if (!draft.isValid) {
                { Text(stringResource(R.string.settings_profile_color_error)) }
            } else {
                null
            },
            isError = !draft.isValid,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSave(draft) },
            enabled = access.canWrite && draft.isValid && !mutation.profileSaving &&
                draft != projection.identity,
            modifier = Modifier.align(Alignment.End),
        ) {
            Text(
                stringResource(
                    if (mutation.profileSaving) R.string.settings_saving
                    else R.string.settings_save_profile,
                ),
            )
        }
        if (!access.canWrite) {
            Text(
                stringResource(R.string.settings_write_denied),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        SettingsMutationMessage(mutation.profileOutcome)
    }
}

@Composable
private fun SettingsActivityCard(profile: SettingsProfileProjection) {
    val format = NumberFormat.getIntegerInstance()
    SettingsSection(stringResource(R.string.settings_profile_activity)) {
        SettingsValueRow(
            stringResource(R.string.settings_profile_threads),
            profile.totalThreads?.let(format::format) ?: stringResource(R.string.settings_value_unknown),
        )
        SettingsValueRow(
            stringResource(R.string.settings_profile_prompts),
            profile.totalPrompts?.let(format::format) ?: stringResource(R.string.settings_value_unknown),
        )
        SettingsValueRow(
            stringResource(R.string.settings_profile_messages),
            profile.messagesSent?.let(format::format) ?: stringResource(R.string.settings_value_unknown),
        )
        SettingsValueRow(
            stringResource(R.string.settings_profile_streak),
            profile.currentStreakDays?.let {
                stringResource(R.string.settings_profile_days, format.format(it))
            } ?: stringResource(R.string.settings_value_unknown),
        )
        SettingsValueRow(
            stringResource(R.string.settings_profile_tokens),
            if (profile.tokenStatsAvailable) {
                profile.lifetimeTokens?.let(format::format)
                    ?: stringResource(R.string.settings_value_unknown)
            } else {
                stringResource(R.string.settings_profile_tokens_unavailable)
            },
        )
    }
}

@Composable
private fun SettingsDevicesCard(devices: List<SettingsProfileDeviceRow>) {
    SettingsSection(stringResource(R.string.settings_profile_devices)) {
        if (devices.isEmpty()) {
            Text(
                stringResource(R.string.settings_profile_devices_empty),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        devices.forEach { device ->
            val label = if (device.current) {
                stringResource(R.string.settings_profile_current_device, device.label)
            } else {
                device.label
            }
            SettingsValueRow(
                label,
                device.platform.ifBlank { stringResource(R.string.settings_value_unknown) },
            )
        }
    }
}
