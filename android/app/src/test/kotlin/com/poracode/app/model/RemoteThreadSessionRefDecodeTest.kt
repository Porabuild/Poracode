package com.poracode.app.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The thread row's optional `sessionRef` decode: additive on hosts that carry
 * it, invisible on older hosts, and unknown future fields never break the
 * snapshot decode.
 */
class RemoteThreadSessionRefDecodeTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    @Test
    fun decodesSessionRefWithExecutionIdentity() {
        val thread = json.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "thread-a", "projectId": "p", "title": "t",
              "agentKind": "devin", "status": "idle", "attention": "idle",
              "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
              "sessionRef": {
                "providerSessionId": "sess-1",
                "discoveredAt": "2026-10-07T00:00:01Z",
                "executionIdentity": "acct-9"
              }
            }
            """.trimIndent(),
        )
        assertEquals("sess-1", thread.sessionRef?.providerSessionId)
        assertEquals("acct-9", thread.sessionRef?.executionIdentity)
    }

    @Test
    fun absentSessionRefAndUnknownFieldsStayCompatible() {
        val thread = json.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "thread-a", "projectId": "p", "title": "t",
              "agentKind": "claude", "status": "idle", "attention": "idle",
              "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
              "someFutureField": {"nested": true}
            }
            """.trimIndent(),
        )
        assertNull(thread.sessionRef)
        assertTrue(thread.isArchived.not())
    }

    @Test
    fun sessionRefWithoutExecutionIdentityDecodes() {
        val thread = json.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "thread-a", "projectId": "p", "title": "t",
              "agentKind": "devin", "status": "idle", "attention": "idle",
              "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
              "sessionRef": {"providerSessionId": "s", "discoveredAt": "d"}
            }
            """.trimIndent(),
        )
        assertEquals("s", thread.sessionRef?.providerSessionId)
        assertNull(thread.sessionRef?.executionIdentity)
    }
}
