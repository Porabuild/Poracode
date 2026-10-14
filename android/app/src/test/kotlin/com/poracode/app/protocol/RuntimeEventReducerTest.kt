package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.int
import com.poracode.app.model.obj
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeEventReducerTest {
    @Test
    fun unwrapThreadRuntimeEventSingle() {
        val value = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-event",
              "threadId": "t1",
              "event": {
                "type": "content.delta",
                "threadId": "t1",
                "itemId": "i1",
                "stream": "assistant_text",
                "delta": " hi"
              }
            }
            """.trimIndent(),
        )
        val batches = RuntimeEventReducer.collectRuntimeEvents(value)
        assertEquals(1, batches.size)
        assertEquals("t1", batches[0].threadId)
        assertEquals(1, batches[0].events.size)
        assertEquals("content.delta", batches[0].events[0].type)
        assertEquals(" hi", batches[0].events[0].delta)
    }

    @Test
    fun unwrapThreadRuntimeEventsArray() {
        val value = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-events",
              "threadId": "t1",
              "events": [
                { "type": "item.started", "threadId": "t1", "itemId": "i1", "itemType": "assistant_message" },
                { "type": "content.delta", "threadId": "t1", "itemId": "i1", "stream": "assistant_text", "delta": "A" }
              ]
            }
            """.trimIndent(),
        )
        val batches = RuntimeEventReducer.collectRuntimeEvents(value)
        assertEquals(1, batches.size)
        assertEquals(2, batches[0].events.size)
    }

    @Test
    fun unwrapThreadRuntimeEventsMulti() {
        val value = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-events-multi",
              "batches": [
                {
                  "threadId": "t1",
                  "events": [
                    { "type": "item.started", "threadId": "t1", "itemId": "a", "itemType": "assistant_message" }
                  ]
                },
                {
                  "threadId": "t2",
                  "events": [
                    { "type": "item.started", "threadId": "t2", "itemId": "b", "itemType": "user_message" }
                  ]
                }
              ]
            }
            """.trimIndent(),
        )
        val batches = RuntimeEventReducer.collectRuntimeEvents(value)
        assertEquals(2, batches.size)
        assertEquals(listOf("t1", "t2"), batches.map { it.threadId })
    }

    @Test
    fun goldenWsEventAppendsAssistantText() {
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-event.json"))
        assertTrue(message is RemoteWebSocketServerMessage.Event)
        val event = (message as RemoteWebSocketServerMessage.Event).event
        assertEquals(43, message.seq)

        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "item-fixture-assistant",
                type = "assistant_message",
                state = "started",
                payload = null,
                streams = mapOf("assistant_text" to "Hello"),
                parentItemId = null,
            ),
        )
        val batches = RuntimeEventReducer.collectRuntimeEvents(event)
        assertEquals(1, batches.size)
        RuntimeEventReducer.apply(batches[0].events, items)
        assertEquals(1, items.size)
        assertEquals("Hello live", items[0].streams["assistant_text"])
        assertEquals("Hello live", items[0].displayText)
    }

    @Test
    fun goldenWsEventDropsWhenItemMissing() {
        // Canonical: content.delta for unknown itemId is dropped (no stub fabrication).
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-event.json"))
        val event = (message as RemoteWebSocketServerMessage.Event).event
        val items = mutableListOf<PersistedRuntimeItem>()
        val batches = RuntimeEventReducer.collectRuntimeEvents(event)
        RuntimeEventReducer.apply(batches[0].events, items)
        assertEquals(0, items.size)
    }

    @Test
    fun goldenRuntimeEventsLifecycle() {
        val array = RemoteJson.parseToJsonElement(readFixture("runtime-events.json")) as JsonArray
        val items = mutableListOf<PersistedRuntimeItem>()
        for (element in array) {
            val obj = element.asObjectOrNull() ?: continue
            val type = obj.string("type") ?: continue
            if (type.startsWith("item.") || type == "content.delta") {
                val event = RuntimeEventReducer.RuntimeEvent(
                    type = type,
                    threadId = obj.string("threadId"),
                    itemId = obj.string("itemId"),
                    itemType = obj.string("itemType"),
                    stream = obj.string("stream"),
                    delta = obj.string("delta"),
                    payload = obj["payload"],
                    raw = obj,
                )
                RuntimeEventReducer.apply(event, items)
            }
        }
        assertEquals(1, items.size)
        assertEquals("completed", items[0].state)
        assertEquals("Fixture response", items[0].streams["assistant_text"])
        assertEquals("Fixture response", RuntimeEventReducer.extractTranscriptText(items[0]))
    }

    @Test
    fun itemLifecycleAndMonotonicMerge() {
        val items = mutableListOf<PersistedRuntimeItem>()
        val started = RuntimeEventReducer.RuntimeEvent(
            type = "item.started",
            threadId = "t1",
            itemId = "i1",
            itemType = "assistant_message",
            payload = buildJsonObject { put("content", buildJsonArray {}) },
        )
        val updated = RuntimeEventReducer.RuntimeEvent(
            type = "item.updated",
            payloadSpecified = true,
            threadId = "t1",
            itemId = "i1",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(buildJsonObject {
                            put("kind", "text")
                            put("text", "Fixture")
                        })
                    },
                )
            },
        )
        val delta = RuntimeEventReducer.RuntimeEvent(
            type = "content.delta",
            threadId = "t1",
            itemId = "i1",
            stream = "assistant_text",
            delta = "Fixture",
        )
        val completed = RuntimeEventReducer.RuntimeEvent(
            type = "item.completed",
            threadId = "t1",
            itemId = "i1",
            payloadSpecified = true,
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(buildJsonObject {
                            put("kind", "text")
                            put("text", "Fixture response")
                        })
                    },
                )
            },
        )
        RuntimeEventReducer.apply(listOf(started, updated, delta, completed), items)
        assertEquals(1, items.size)
        assertEquals("completed", items[0].state)
        assertEquals("Fixture", items[0].streams["assistant_text"])
        assertEquals("Fixture", items[0].displayText)
    }

    @Test
    fun dropsMissingContentDeltaAndUpdatedAndCompleted() {
        val items = mutableListOf<PersistedRuntimeItem>()
        RuntimeEventReducer.apply(
            RuntimeEventReducer.contentDeltaEvent(
                threadId = "t1",
                itemId = "missing",
                stream = "assistant_text",
                delta = "late",
            ),
            items,
        )
        assertEquals(0, items.size)

        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.updated",
            payloadSpecified = true,
                threadId = "t1",
                itemId = "missing",
                payload = buildJsonObject { put("x", 1) },
            ),
            items,
        )
        assertEquals(0, items.size)

        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.completed",
                threadId = "t1",
                itemId = "missing",
            ),
            items,
        )
        assertEquals(0, items.size)
    }

    @Test
    fun completedEmptyReasoningItemIsDeleted() {
        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "r1",
                type = "reasoning",
                state = "started",
                payload = null,
                streams = emptyMap(),
            ),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.completed",
                threadId = "t1",
                itemId = "r1",
                // payload absent (null) — keep previous; still empty reasoning_text.
            ),
            items,
        )
        assertEquals(0, items.size)
    }

    @Test
    fun completedReasoningWithTextIsRetained() {
        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "r1",
                type = "reasoning",
                state = "started",
                payload = null,
                streams = mapOf("reasoning_text" to "thinking…"),
            ),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.completed",
                threadId = "t1",
                itemId = "r1",
            ),
            items,
        )
        assertEquals(1, items.size)
        assertEquals("completed", items[0].state)
    }

    @Test
    fun completedAbsentPayloadKeepsExisting() {
        val existingPayload = buildJsonObject { put("keep", true) }
        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "i1",
                type = "assistant_message",
                state = "started",
                payload = existingPayload,
                streams = emptyMap(),
            ),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.completed",
                threadId = "t1",
                itemId = "i1",
                payload = null, // absent/undefined
            ),
            items,
        )
        assertEquals(existingPayload, items[0].payload)
    }

    @Test
    fun mergePayloadIsTopLevelShallowOverlay() {
        val existing = buildJsonObject {
            put(
                "nested",
                buildJsonObject {
                    put("a", 1)
                    put("b", 2)
                },
            )
            put("keep", "yes")
        }
        val incoming = buildJsonObject {
            put(
                "nested",
                buildJsonObject {
                    put("a", 9)
                },
            )
            put("extra", "new")
        }
        val merged = RuntimeEventReducer.mergePayload(existing, incoming)!!.asObjectOrNull()!!
        // Top-level keys overlay; nested is replaced wholesale (b dropped).
        assertEquals("yes", merged.string("keep"))
        assertEquals("new", merged.string("extra"))
        val nested = merged.obj("nested")!!
        assertEquals(9, nested.int("a"))
        assertNull(nested.int("b"))
    }

    @Test
    fun goldenThreadHistoryDisplayText() {
        val history = RemoteJson.decodeFromString(
            RemoteThreadSnapshot.serializer(),
            readFixture("thread-history.json"),
        )
        assertEquals(42, history.snapshotSeq)
        assertEquals(1, history.runtimeItems.size)
        assertEquals("Fixture response", history.runtimeItems[0].streams["assistant_text"])
        assertEquals("Fixture response", history.runtimeItems[0].displayText)
    }

    @Test
    fun shouldRefreshShellOnNestedTurnLifecycle() {
        val envelope = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-event",
              "threadId": "t1",
              "event": { "type": "turn.started", "threadId": "t1" }
            }
            """.trimIndent(),
        )
        assertTrue(
            "nested turn.started must refresh shell even when outer type is envelope",
            RuntimeEventReducer.shouldRefreshShell(envelope),
        )
    }

    @Test
    fun shouldRefreshShellOnNestedSessionAndRequestAndItem() {
        val sessionEnv = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-events",
              "threadId": "t1",
              "events": [
                { "type": "session.updated", "threadId": "t1" }
              ]
            }
            """.trimIndent(),
        )
        assertTrue(RuntimeEventReducer.shouldRefreshShell(sessionEnv))

        val requestEnv = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-event",
              "threadId": "t1",
              "event": { "type": "request.permission", "threadId": "t1" }
            }
            """.trimIndent(),
        )
        assertTrue(RuntimeEventReducer.shouldRefreshShell(requestEnv))

        val itemEnv = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-event",
              "threadId": "t1",
              "event": {
                "type": "item.started",
                "threadId": "t1",
                "itemId": "i1",
                "itemType": "assistant_message"
              }
            }
            """.trimIndent(),
        )
        assertTrue(RuntimeEventReducer.shouldRefreshShell(itemEnv))
    }

    @Test
    fun shouldRefreshShellOnOuterShellEvents() {
        val projects = RemoteJson.parseToJsonElement(
            """{"type":"remote-projects-changed"}""",
        )
        assertTrue(RuntimeEventReducer.shouldRefreshShell(projects))
        val pureDelta = RemoteJson.parseToJsonElement(
            """
            {
              "type": "thread-runtime-event",
              "threadId": "t1",
              "event": {
                "type": "content.delta",
                "threadId": "t1",
                "itemId": "i1",
                "stream": "assistant_text",
                "delta": "x"
              }
            }
            """.trimIndent(),
        )
        // content.delta alone is not a lifecycle shell signal.
        assertTrue(!RuntimeEventReducer.shouldRefreshShell(pureDelta))
    }


    @Test
    fun itemUpdatedWithoutPayloadKeyIsMalformedIgnored() {
        val obj = buildJsonObject {
            put("type", "item.updated")
            put("threadId", "t1")
            put("itemId", "i1")
            // no payload key
        }
        assertNull(RuntimeEventReducer.parseRuntimeEvent(obj))
    }

    @Test
    fun itemUpdatedWithExplicitJsonNullClearsPayload() {
        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "i1",
                type = "assistant_message",
                state = "started",
                payload = buildJsonObject { put("x", 1) },
                streams = emptyMap(),
            ),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.updated",
                threadId = "t1",
                itemId = "i1",
                payload = kotlinx.serialization.json.JsonNull,
                payloadSpecified = true,
            ),
            items,
        )
        assertNull(items[0].payload)
        assertEquals("updated", items[0].state)
    }

    @Test
    fun errorSynthesizesCompletedItemWithInjectedId() {
        val items = mutableListOf<PersistedRuntimeItem>()
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "error",
                threadId = "t1",
                message = "boom",
            ),
            items,
        )
        assertEquals(1, items.size)
        assertEquals("error", items[0].type)
        assertEquals("completed", items[0].state)
        assertTrue(items[0].id.startsWith("err-"))
    }

    @Test
    fun turnCompletedInterruptedPrunesTrailingReasoningTransparentPlanErrorChild() {
        val items = mutableListOf(
            PersistedRuntimeItem(id = "a", type = "assistant_message", state = "completed"),
            PersistedRuntimeItem(id = "r1", type = "reasoning", state = "started"),
            PersistedRuntimeItem(id = "plan", type = "plan", state = "completed"),
            PersistedRuntimeItem(id = "r2", type = "reasoning", state = "started"),
            PersistedRuntimeItem(id = "child", type = "tool_call", state = "started", parentItemId = "a"),
            PersistedRuntimeItem(id = "r3", type = "reasoning", state = "started"),
            PersistedRuntimeItem(id = "err", type = "error", state = "completed"),
            PersistedRuntimeItem(id = "r4", type = "reasoning", state = "started"),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "turn.completed",
                threadId = "t1",
                state = "interrupted",
            ),
            items,
        )
        // Trailing reasoning dropped; plan/error/child transparent so r3 before err also dropped?
        // Walk from end: r4 drop, err skip, r3 drop, child skip, r2 drop, plan skip, r1 drop, a stop.
        val ids = items.map { it.id }
        assertEquals(listOf("a", "plan", "child", "err"), ids)
    }

    @Test
    fun requestOpenedFifoReplaceAndResolvedRemoval() {
        var domain = ThreadRuntimeDomainState()
        val opened = RuntimeEventReducer.RuntimeEvent(
            type = "request.opened",
            threadId = "t1",
            requestId = "req-1",
            requestType = "permission",
            payload = buildJsonObject { put("tool", "bash") },
        )
        domain = RuntimeDomainReducer.apply(opened, "t1", domain, nowEpochMs = 1000)
        assertEquals(1, domain.openRequests.size)
        // replace same id
        val opened2 = opened.copy(requestType = "question")
        domain = RuntimeDomainReducer.apply(opened2, "t1", domain, nowEpochMs = 2000)
        assertEquals(1, domain.openRequests.size)
        assertEquals("question", domain.openRequests[0].requestType)
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "request.resolved", requestId = "req-1"),
            "t1",
            domain,
        )
        assertEquals(0, domain.openRequests.size)
    }

    @Test
    fun turnOpenCloseAndContextUpdated() {
        var domain = ThreadRuntimeDomainState()
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "turn.started"),
            "t1",
            domain,
        )
        assertEquals(true, domain.openTurn)
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "turn.completed", state = "completed"),
            "t1",
            domain,
        )
        assertEquals(false, domain.openTurn)
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "context.updated",
                payload = buildJsonObject {
                    put("usedTokens", 10)
                    put("maxTokens", 100)
                },
                payloadSpecified = true,
            ),
            "t1",
            domain,
        )
        assertEquals(10, domain.contextUsage?.usedTokens)
        assertEquals(100, domain.contextUsage?.maxTokens)
    }

    @Test
    fun warningAndUsageSpentAreIntentionalDomainNoOps() {
        val domain = ThreadRuntimeDomainState(
            contextUsage = ThreadContextUsage(usedTokens = 10, maxTokens = 100),
        )
        val warningResult = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "warning", message = "heads up"),
            "t1",
            domain,
        )
        val usageResult = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "usage.spent",
                payload = buildJsonObject { put("total", 5) },
                payloadSpecified = true,
            ),
            "t1",
            domain,
        )
        assertSame(domain, warningResult)
        assertSame(domain, usageResult)
    }

    @Test
    fun malformedEventsIgnored() {
        assertEquals(emptyList<RuntimeEventReducer.Batch>(), RuntimeEventReducer.collectRuntimeEvents(
            buildJsonObject { put("type", "thread-runtime-event") } // missing threadId/event
        ))
        assertNull(RuntimeEventReducer.parseRuntimeEvent(buildJsonObject { put("noType", true) }))
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name — expect protocol/remote/v3 on test classpath")
        return stream.bufferedReader().use { it.readText() }
    }
}
