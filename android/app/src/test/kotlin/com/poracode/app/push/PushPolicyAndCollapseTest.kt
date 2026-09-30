package com.poracode.app.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPolicyAndCollapseTest {
    @Test
    fun immutableChannelContractAndPermissionTransitions() {
        assertEquals("poracode_attention_v1", PushChannels.ATTENTION_ID)
        assertEquals("poracode_status_v1", PushChannels.STATUS_ID)
        assertEquals(PushChannels.STATUS_ID, PushChannels.forMessage(true))
        assertEquals(PushPermissionPolicy.Action.Unavailable, policy(false, false, false))
        assertEquals(PushPermissionPolicy.Action.Request, policy(true, false, false))
        assertEquals(PushPermissionPolicy.Action.OpenSettings, policy(true, false, true))
        assertEquals(PushPermissionPolicy.Action.Enabled, policy(true, true, true))
        assertEquals(
            PushPermissionPolicy.Action.Enabled,
            PushPermissionPolicy.action(true, 32, false, false),
        )
    }

    @Test
    fun collapseFixtureMatchesServerAlgorithmAndBound() {
        val value = PushCollapseIdentity.routed(
            PushRouteV1(
                clientConnectionId = "11111111-1111-4111-8111-111111111111",
                desktopId = "desktop-a",
                threadId = "thread-a",
            ),
        )
        assertEquals("pc1.t6aFV9M0iuvZ_KriNzNjvi1jnb0", value)
        assertTrue(value.toByteArray().size <= PushCollapseIdentity.MAX_BYTES)
    }

    private fun policy(configured: Boolean, granted: Boolean, asked: Boolean) =
        PushPermissionPolicy.action(configured, 37, granted, asked)
}
