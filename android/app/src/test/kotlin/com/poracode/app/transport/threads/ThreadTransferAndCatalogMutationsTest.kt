package com.poracode.app.transport.threads

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ThreadTransferAndCatalogMutationsTest {
    @Test
    fun buildsRelativeThreadReorderPayload() {
        val payload = CatalogMutationsV1.reorderThreadPayload(
            threadId = "t-2",
            beforeThreadId = "t-1",
        )
        assertEquals(JsonPrimitive("reorder"), payload["kind"])
        assertEquals(JsonPrimitive("t-2"), payload["threadId"])
        assertEquals(JsonPrimitive("t-1"), payload["beforeThreadId"])
    }

    @Test
    fun buildsNullableWorkspaceProjectPatch() {
        val clearPayload = CatalogMutationsV1.setProjectWorkspacePayload("p-1", null)
        assertEquals(JsonNull, (clearPayload["patch"] as JsonObject)["workspaceId"])

        val setPayload = CatalogMutationsV1.setProjectWorkspacePayload("p-1", "ws-1")
        assertEquals(JsonPrimitive("ws-1"), (setPayload["patch"] as JsonObject)["workspaceId"])
    }
}
