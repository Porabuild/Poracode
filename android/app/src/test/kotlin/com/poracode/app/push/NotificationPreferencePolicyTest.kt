package com.poracode.app.push

import com.poracode.app.storage.DeviceSettingsState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPreferencePolicyTest {
    @Test
    fun categoryAndForegroundPreferencesGatePresentation() {
        val state = DeviceSettingsState(
            foregroundNotificationsEnabled = true,
            notifyDone = false,
        )

        assertFalse(state.allowsForegroundNotification(RemoteUserNotificationCategory.Done))
        assertTrue(
            state.allowsForegroundNotification(RemoteUserNotificationCategory.NeedsAttention),
        )
        assertFalse(
            state.copy(foregroundNotificationsEnabled = false)
                .allowsForegroundNotification(RemoteUserNotificationCategory.Error),
        )
    }

    @Test
    fun wireCategoryParsingIsClosedAndUnknownValuesStayGeneric() {
        assertTrue(remoteNotificationCategory("done") == RemoteUserNotificationCategory.Done)
        assertTrue(remoteNotificationCategory("unknown") == null)
    }
}
