package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteUserNotificationPresentationTest {
    private val route = PushRouteV1(
        clientConnectionId = "11111111-1111-4111-8111-111111111111",
        desktopId = "desktop-a",
        threadId = "thread-1",
    )
    private val event = RemoteUserNotificationEvent(
        threadId = "thread-1",
        category = RemoteUserNotificationCategory.NeedsAttention,
        projectName = "Project",
        threadTitle = "Thread",
        status = "needs_reply",
    )

    @Test
    fun strictProjectionAcceptsKnownShapeAndRejectsMalformedKnownEvent() {
        val valid = Json.parseToJsonElement(
            """{"type":"remote-user-notification","threadId":"thread-1","category":"done","projectName":"Project","threadTitle":"Thread","status":"finished"}""",
        )
        assertEquals(RemoteUserNotificationCategory.Done, event(valid)?.category)
        val malformed = Json.parseToJsonElement(
            """{"type":"remote-user-notification","threadId":"thread-1","category":"done","projectName":"Project","threadTitle":"Thread","status":"unknown"}""",
        )
        assertTrue(runCatching { event(malformed) }.isFailure)
    }

    @Test
    fun replayOpenThreadAndCrossIngressDuplicatesDoNotCreateTwoAlerts() {
        var now = 1_000L
        val center = RemoteUserNotificationPresentationCenter({ now })
        center.receiveWebSocket(event, route, replay = true, foreground = true, threadOpen = false)
        assertNull(center.banner.value)

        center.receiveWebSocket(event, route, replay = false, foreground = true, threadOpen = true)
        assertNull(center.banner.value)
        assertFalse(center.shouldPresentPush(route))

        now += 16_000
        assertTrue(center.shouldPresentPush(route))
        center.receiveWebSocket(event, route, replay = false, foreground = true, threadOpen = false)
        assertNull(center.banner.value)
    }

    @Test
    fun bannerIsClearedWhenSelectedHostIdentityChanges() {
        val center = RemoteUserNotificationPresentationCenter()
        center.receiveWebSocket(event, route, replay = false, foreground = true, threadOpen = false)
        assertEquals("thread-1", center.banner.value?.notification?.threadId)

        center.retainHost(
            ClientConnectionId("22222222-2222-4222-8222-222222222222"),
            "desktop-b",
        )

        assertNull(center.banner.value)
    }

    @Test
    fun preferencePredicateSuppressesForegroundBannerBeforeDeduplication() {
        val center = RemoteUserNotificationPresentationCenter(shouldPresent = { false })

        center.receiveWebSocket(event, route, replay = false, foreground = true, threadOpen = false)

        assertNull(center.banner.value)
        assertTrue(center.shouldPresentPush(route))
    }

    @Test
    fun readyCeilingSuppressesOnlyReplayedNotificationSequences() {
        val gate = RemoteNotificationReplayGate()
        gate.noteReady(20)

        assertTrue(gate.isReplay(19))
        assertTrue(gate.isReplay(20))
        assertFalse(gate.isReplay(21))
    }

    private fun event(value: kotlinx.serialization.json.JsonElement) =
        RemoteUserNotificationEvent.decodeIfPresent(value)
}
