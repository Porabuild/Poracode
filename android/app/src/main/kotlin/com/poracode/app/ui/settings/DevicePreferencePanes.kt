package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.push.PushAvailability
import com.poracode.app.push.PushPermissionCard
import com.poracode.app.push.PushUiState
import com.poracode.app.storage.ContentLanguage
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState

@Composable
internal fun DeviceNotificationsPane(
    state: PushUiState,
    local: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
    onAction: () -> Unit,
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SettingsCard {
                SettingsSwitchRow(
                    stringResource(R.string.settings_notifications_enabled),
                    local.notificationsEnabled,
                    preferences::setNotificationsEnabled,
                )
                SettingsSwitchRow(
                    stringResource(R.string.settings_notification_sound),
                    local.notificationSoundEnabled,
                    preferences::setNotificationSoundEnabled,
                    enabled = local.notificationsEnabled,
                )
                SettingsSwitchRow(
                    stringResource(R.string.settings_notification_foreground),
                    local.foregroundNotificationsEnabled,
                    preferences::setForegroundNotificationsEnabled,
                    enabled = local.notificationsEnabled,
                )
                SettingsValueRow(
                    stringResource(R.string.settings_notification_status),
                    stringResource(state.availability.statusResource()),
                )
                if (state.availability == PushAvailability.Available) {
                    SettingsValueRow(
                        stringResource(R.string.settings_notification_desktops),
                        state.registeredHostCount.toString(),
                    )
                }
            }
        }
        item {
            SettingsSection(stringResource(R.string.settings_notification_categories)) {
                SettingsSwitchRow(
                    stringResource(R.string.remote_notification_done),
                    local.notifyDone,
                    preferences::setNotifyDone,
                    enabled = local.notificationsEnabled,
                )
                SettingsSwitchRow(
                    stringResource(R.string.remote_notification_needs_attention),
                    local.notifyNeedsAttention,
                    preferences::setNotifyNeedsAttention,
                    enabled = local.notificationsEnabled,
                )
                SettingsSwitchRow(
                    stringResource(R.string.remote_notification_error),
                    local.notifyError,
                    preferences::setNotifyError,
                    enabled = local.notificationsEnabled,
                )
            }
        }
        item { PushPermissionCard(state, onAction) }
    }
}

@Composable
internal fun DeviceGitPane(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    val locale = LocalConfiguration.current.locales[0]
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SettingsCard {
                Text(
                    stringResource(R.string.settings_content_language_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                ContentLanguage.entries.forEach { language ->
                    SettingsChoiceRow(
                        label = if (language == ContentLanguage.MatchApp) {
                            stringResource(R.string.settings_content_language_match_app)
                        } else {
                            language.displayName(locale)
                        },
                        selected = state.contentLanguage == language,
                    ) { preferences.setContentLanguage(language) }
                }
            }
        }
    }
}

private fun PushAvailability.statusResource(): Int = when (this) {
    PushAvailability.NotConfigured -> R.string.push_not_configured_title
    PushAvailability.StorageUnavailable -> R.string.push_unavailable_title
    PushAvailability.PermissionRequired -> R.string.push_permission_title
    PushAvailability.PermissionDenied -> R.string.push_permission_denied_title
    PushAvailability.TokenPending -> R.string.settings_notification_registering
    PushAvailability.Available -> R.string.settings_notification_available
}
