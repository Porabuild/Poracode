package com.poracode.app.push

import com.poracode.app.storage.DeviceSettingsState

internal fun DeviceSettingsState.allowsNotification(
    category: RemoteUserNotificationCategory?,
): Boolean = notificationsEnabled && when (category) {
    RemoteUserNotificationCategory.Done -> notifyDone
    RemoteUserNotificationCategory.NeedsAttention -> notifyNeedsAttention
    RemoteUserNotificationCategory.Error -> notifyError
    null -> true
}

internal fun DeviceSettingsState.allowsForegroundNotification(
    category: RemoteUserNotificationCategory?,
): Boolean = foregroundNotificationsEnabled && allowsNotification(category)

internal fun remoteNotificationCategory(value: String?): RemoteUserNotificationCategory? =
    when (value) {
        "done" -> RemoteUserNotificationCategory.Done
        "needsAttention" -> RemoteUserNotificationCategory.NeedsAttention
        "error" -> RemoteUserNotificationCategory.Error
        else -> null
    }
