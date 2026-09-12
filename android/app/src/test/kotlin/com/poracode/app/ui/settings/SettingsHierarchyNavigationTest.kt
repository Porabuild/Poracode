package com.poracode.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SettingsHierarchyNavigationTest {
    @Test
    fun deviceDetailsReturnToTheDeviceIndex() {
        val deviceDetails = listOf(
            SettingsRoute.General,
            SettingsRoute.Appearance,
            SettingsRoute.Notifications,
            SettingsRoute.Terminal,
            SettingsRoute.Git,
        )

        deviceDetails.forEach { route ->
            assertEquals(SettingsRoute.DeviceIndex, route.parent())
        }
    }

    @Test
    fun desktopDetailsReturnThroughTheDesktopIndex() {
        val desktopDetails = SettingsRoute.entries - setOf(
            SettingsRoute.DeviceIndex,
            SettingsRoute.General,
            SettingsRoute.Appearance,
            SettingsRoute.Notifications,
            SettingsRoute.Terminal,
            SettingsRoute.Git,
            SettingsRoute.DesktopIndex,
        )

        desktopDetails.forEach { route ->
            assertEquals(SettingsRoute.DesktopIndex, route.parent())
        }
        assertEquals(SettingsRoute.DeviceIndex, SettingsRoute.DesktopIndex.parent())
        assertNull(SettingsRoute.DeviceIndex.parent())
    }

    @Test
    fun depthTracksTheHierarchySoTransitionsKnowDirection() {
        assertEquals(0, SettingsRoute.DeviceIndex.depth())
        SettingsRoute.entries.forEach { route ->
            val parent = route.parent() ?: return@forEach
            assertEquals(parent.depth() + 1, route.depth())
        }
    }
}
