package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSessionConfigOption
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.session.AppSession
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The per-thread live session inventory field: `thread-state` folds it with the
 * documented tri-state (absence preserves, explicit null retires, an array —
 * including an empty one — is authoritative), a foreign-owner event can never
 * write it, and the `RemoteThread` wire decode stays absent-tolerant.
 */
class CatalogSessionConfigOptionsTest {
    private val baseRow = RemoteThread(
        id = "t1",
        projectId = "p1",
        title = "Thread",
        agentKind = "devin",
        status = "idle",
        attention = "none",
        createdAt = "2026-10-08T00:00:00Z",
        updatedAt = "2026-10-08T00:00:00Z",
        config = ThreadConfig(),
        sessionConfigOptions = listOf(RemoteSessionConfigOption(type = "boolean", id = "cached")),
    )

    @Test
    fun exitRetiresInventoriesEvenForAlreadyInactiveRows() {
        for (status in listOf("idle", "inactive", "error")) {
            val state = AppSession.UiState(snapshot = RemoteShellSnapshot(
                snapshotSeq = 0,
                threads = listOf(baseRow.copy(status = status)),
                updatedAt = baseRow.updatedAt,
            ))
            val retired = CatalogStore.applyThreadExit(state, baseRow.id, 1L)
            assertNull(retired.snapshot!!.threads.single().sessionConfigOptions)
            assertEquals(if (status == "error") "error" else "inactive", retired.snapshot!!.threads.single().status)
        }
    }

    @Test
    fun absentFieldPreservesTheCachedInventory() {
        val mutation = mutation("""{"status":"working","attention":"working"}""")
        val next = mutation!!(baseRow)!!

        assertEquals(1, next.sessionConfigOptions?.size)
        assertEquals("working", next.status)
    }

    @Test
    fun explicitNullRetiresTheInventory() {
        val mutation = mutation(
            """{"status":"idle","attention":"none","sessionConfigOptions":null}""",
        )
        val next = mutation!!(baseRow)!!

        assertNull(next.sessionConfigOptions)
    }

    @Test
    fun emptyArrayRetainsTheAuthoritativeEmptyInventory() {
        val mutation = mutation("""{"status":"idle","attention":"none","sessionConfigOptions":[]}""")
        val next = mutation!!(baseRow)!!

        // Non-null empty: the active native session genuinely advertises no controls.
        assertNotNull(next.sessionConfigOptions)
        assertTrue(next.sessionConfigOptions!!.isEmpty())
    }

    @Test
    fun inventoryReplacesWithDecodedDescriptorsAndNativeLabelsStayContent() {
        val mutation = mutation(
            """
            {
              "status": "idle",
              "attention": "none",
              "sessionConfigOptions": [
                {
                  "type": "select",
                  "id": "model",
                  "name": "Session model",
                  "role": "model",
                  "currentValue": "fusion-alpha",
                  "values": [
                    {"value": "fusion-alpha", "name": "Fusion Alpha", "group": "fusion"},
                    {"value": "fusion-beta", "name": "Fusion Beta", "group": "fusion"}
                  ],
                  "groups": [{"id": "fusion", "name": "Fusion Pairs"}]
                },
                {
                  "type": "select",
                  "id": "thought_level",
                  "role": "effort",
                  "currentValue": "low",
                  "values": [
                    {"value": "low", "name": "Low"},
                    {"value": "medium", "name": "Medium"},
                    {"value": "high", "name": "High"},
                    {"value": "xhigh", "name": "XHigh"},
                    {"value": "max", "name": "Max"}
                  ],
                  "groups": []
                },
                {"type": "boolean", "id": "fast", "role": "fast", "currentValue": true},
                {"type": "other", "id": "mystery", "controlType": "slider"}
              ]
            }
            """.trimIndent(),
        )
        val next = mutation!!(baseRow)!!
        val inventory = next.sessionConfigOptions

        assertNotNull(inventory)
        assertEquals(4, inventory!!.size)
        val model = inventory.first()
        assertEquals("select", model.type)
        assertEquals("model", model.role)
        assertEquals("fusion-alpha", model.currentStringValue)
        assertEquals("Fusion Pairs", model.groups?.single()?.name)
        assertEquals("fusion", model.values?.first()?.group)
        val effort = inventory[1]
        assertEquals(5, effort.values?.size)
        assertEquals("low", effort.currentStringValue)
        val fast = inventory[2]
        assertEquals(true, fast.currentBooleanValue)
        // Unknown control type decodes as inert data (never a decode failure).
        assertEquals("other", inventory[3].type)
        assertEquals("slider", inventory[3].controlType)
    }

    @Test
    fun structurallyMalformedInventoryRetiresInsteadOfStalling() {
        val mutation = mutation(
            """{"status":"idle","attention":"none","sessionConfigOptions":"not-an-array"}""",
        )
        val next = mutation!!(baseRow)!!

        // A present value this client cannot represent must never leave a stale
        // inventory behind; retirement falls back to the static catalog.
        assertNull(next.sessionConfigOptions)
    }

    @Test
    fun foreignOwnerEventNeverTouchesTheRow() {
        val mutation = mutation(
            """
            {
              "status": "idle",
              "attention": "none",
              "agentKind": "other",
              "sessionConfigOptions": []
            }
            """.trimIndent(),
        )

        // A straggler state from a provider that no longer owns the thread is
        // ignored wholesale — the mutation refuses the row, so it can neither
        // write nor clear the inventory.
        assertNull(mutation!!(baseRow))
        assertEquals(1, baseRow.sessionConfigOptions?.size)
    }

    @Test
    fun remoteThreadDecodeToleratesAbsentAndParsesPresentInventory() {
        val absent = RemoteJson.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "t1", "projectId": "p1", "title": "Thread", "agentKind": "devin",
              "status": "idle", "attention": "none",
              "createdAt": "2026-10-08T00:00:00Z", "updatedAt": "2026-10-08T00:00:00Z"
            }
            """.trimIndent(),
        )
        assertNull(absent.sessionConfigOptions)

        val present = RemoteJson.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "t1", "projectId": "p1", "title": "Thread", "agentKind": "devin",
              "status": "idle", "attention": "none",
              "createdAt": "2026-10-08T00:00:00Z", "updatedAt": "2026-10-08T00:00:00Z",
              "sessionConfigOptions": [
                {"type": "boolean", "id": "fast", "role": "fast", "currentValue": false},
                {"type": "unsupported", "id": "mystery", "controlType": "slider"}
              ]
            }
            """.trimIndent(),
        )
        assertEquals(2, present.sessionConfigOptions?.size)
        assertEquals(false, present.sessionConfigOptions?.first()?.currentBooleanValue)
        assertEquals("unsupported", present.sessionConfigOptions?.last()?.type)
    }

    private fun mutation(eventJson: String): ((RemoteThread) -> RemoteThread?)? =
        CatalogStore.threadStateMutation(
            RemoteJson.parseToJsonElement(eventJson).jsonObject,
            nowIso = "2026-10-08T01:00:00Z",
        )
}
