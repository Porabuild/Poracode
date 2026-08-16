package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.asObjectOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Strict 14-variant sealed union + invalid mutations + mixed batch.
 * Golden fixture: protocol/remote/v3/fixtures/runtime-events.json
 */
class RuntimeEventStrictUnionTest {
    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name")
        return stream.bufferedReader().readText()
    }

    @Test
    fun allFourteenGoldenEventsParseAndReduce() {
        val array = RemoteJson.parseToJsonElement(readFixture("runtime-events.json")) as JsonArray
        // Fixture may include multiple examples per type (e.g. turn.completed states);
        // the sealed union remains 14 discriminators.
        val items = mutableListOf<PersistedRuntimeItem>()
        var domain = ThreadRuntimeDomainState()
        val parsedTypes = mutableListOf<String>()
        for (element in array) {
            val obj = element.asObjectOrNull() ?: error("not object")
            val event = RuntimeEventReducer.parseRuntimeEvent(obj)
            assertNotNull("failed to parse ${obj["type"]}", event)
            parsedTypes += event!!.type
            domain = RuntimeEventReducer.applyBatch(
                events = listOf(event),
                threadId = "thread-fixture-001",
                items = items,
                domain = domain,
                nowEpochMs = 1L,
            )
        }
        assertEquals(
            setOf(
                "session.started", "session.exited",
                "turn.started", "turn.completed",
                "item.started", "item.updated", "item.completed",
                "content.delta",
                "context.updated", "usage.spent",
                "request.opened", "request.resolved",
                "warning", "error",
            ),
            parsedTypes.toSet(),
        )
        assertEquals(14, parsedTypes.toSet().size)
        assertTrue(items.any { it.type == "error" && it.state == "completed" })
        assertTrue(items.any { it.id == "item-fixture-assistant" && it.state == "completed" })
        assertEquals(false, domain.openTurn)
        assertEquals(128, domain.contextUsage?.usedTokens)
        assertEquals(8192, domain.contextUsage?.maxTokens)
        assertTrue(domain.openRequests.isEmpty())
    }

    @Test
    fun itemUpdatedWithoutPayloadKeySkipped() {
        val obj = buildJsonObject {
            put("type", "item.updated")
            put("threadId", "t1")
            put("itemId", "i1")
        }
        assertNull(RuntimeEventReducer.parseRuntimeEvent(obj))
    }

    @Test
    fun itemUpdatedWithJsonNullPayloadAccepted() {
        val obj = buildJsonObject {
            put("type", "item.updated")
            put("threadId", "t1")
            put("itemId", "i1")
            put("payload", JsonNull)
        }
        val event = RuntimeEventReducer.parseRuntimeEvent(obj)
        assertNotNull(event)
        assertTrue(event!!.payloadSpecified)
        assertTrue(event.payload is JsonNull)
    }

    @Test
    fun unknownTypeAndMalformedSkipped() {
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "unicorn.spotted")
                    put("threadId", "t")
                },
            ),
        )
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "turn.started")
                    put("threadId", "t")
                },
            ),
        )
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "content.delta")
                    put("threadId", "t")
                    put("itemId", "i")
                    put("stream", "not_a_stream")
                    put("delta", "x")
                },
            ),
        )
    }

    @Test
    fun mixedBatchSkipsInvalidKeepsValid() {
        val envelope = buildJsonObject {
            put("type", "thread-runtime-events")
            put("threadId", "t1")
            put(
                "events",
                buildJsonArray {
                    add(
                        buildJsonObject {
                            put("type", "item.started")
                            put("threadId", "t1")
                            put("itemId", "a")
                            put("itemType", "assistant_message")
                        },
                    )
                    add(
                        buildJsonObject {
                            put("type", "item.updated")
                            put("threadId", "t1")
                            put("itemId", "a")
                        },
                    )
                    add(
                        buildJsonObject {
                            put("type", "content.delta")
                            put("threadId", "t1")
                            put("itemId", "a")
                            put("stream", "assistant_text")
                            put("delta", "hi")
                        },
                    )
                },
            )
        }
        val batches = RuntimeEventReducer.collectRuntimeEvents(envelope)
        assertEquals(1, batches.size)
        assertEquals(2, batches[0].events.size)
        assertEquals(listOf("item.started", "content.delta"), batches[0].events.map { it.type })
    }

    @Test
    fun interruptedTurnPrunesTrailingReasoning() {
        val items = mutableListOf(
            PersistedRuntimeItem(id = "a", type = "assistant_message", state = "completed"),
            PersistedRuntimeItem(id = "r1", type = "reasoning", state = "started"),
            PersistedRuntimeItem(id = "p1", type = "plan", state = "started"),
            PersistedRuntimeItem(id = "r2", type = "reasoning", state = "started"),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "turn.completed",
                threadId = "t1",
                state = "interrupted",
            ),
            items,
        )
        assertEquals(listOf("a", "p1"), items.map { it.id })
    }

    @Test
    fun pendingRequestHiddenFromTranscriptButRecoveredOnHydrate() {
        val items = listOf(
            PersistedRuntimeItem(id = "msg", type = "assistant_message", state = "completed"),
            PersistedRuntimeItem(
                id = "pending_request:req-1",
                type = RuntimeEventReducer.PENDING_REQUEST_ITEM_TYPE,
                state = "started",
                payload = buildJsonObject {
                    put("requestId", "req-1")
                    put("requestType", "tool_user_input")
                    put("payload", buildJsonObject { put("summary", "Allow?") })
                },
            ),
            // Malformed / orphan — skipped
            PersistedRuntimeItem(
                id = "pending_request:orphan",
                type = RuntimeEventReducer.PENDING_REQUEST_ITEM_TYPE,
                state = "started",
                payload = buildJsonObject { put("summary", "no outer shape") },
            ),
        )
        val visible = RuntimeEventReducer.visibleTranscriptItems(items)
        assertEquals(listOf("msg"), visible.map { it.id })
        val open = RuntimeEventReducer.openRequestsFromRuntimeItems(items, "t1", nowEpochMs = 9)
        assertEquals(1, open.size)
        assertEquals("req-1", open[0].requestId)
        assertEquals("tool_user_input", open[0].requestType)
    }

    @Test
    fun optionalWrongTypeAndNumericStringCoercionRejected() {
        // turnId as number — reject
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "session.started")
                    put("threadId", "t")
                    put("turnId", 123)
                },
            ),
        )
        // threadId as number — reject
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "warning")
                    put("threadId", 1)
                    put("message", "x")
                },
            ),
        )
        // counter as numeric string — reject
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "usage.spent")
                    put("threadId", "t")
                    put(
                        "usage",
                        buildJsonObject {
                            put("counterKind", "per-call")
                            put("counter", "128")
                            put("scopeId", "s")
                            put("epoch", 0)
                            put("sampleId", "sid")
                        },
                    )
                },
            ),
        )
        // context.updated usage must be object
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "context.updated")
                    put("threadId", "t")
                    put("usage", "not-an-object")
                },
            ),
        )
        // occurredAt Long timestamp accepted
        val bigTs = 1_700_000_000_000L
        val ok = RuntimeEventReducer.parseRuntimeEvent(
            buildJsonObject {
                put("type", "usage.spent")
                put("threadId", "t")
                put(
                    "usage",
                    buildJsonObject {
                        put("counterKind", "per-call")
                        put("counter", 1)
                        put("scopeId", "s")
                        put("epoch", 0)
                        put("sampleId", "sid")
                        put("occurredAt", bigTs)
                    },
                )
            },
        )
        assertNotNull(ok)
        // fraction rejected
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "usage.spent")
                    put("threadId", "t")
                    put(
                        "usage",
                        buildJsonObject {
                            put("counterKind", "per-call")
                            put("counter", 1.5)
                            put("scopeId", "s")
                            put("epoch", 0)
                            put("sampleId", "sid")
                        },
                    )
                },
            ),
        )
    }

    @Test
    fun mutationMatrixRejectsWrongOptionalAndRequiredTypes() {
        val array = RemoteJson.parseToJsonElement(readFixture("runtime-events.json")) as JsonArray
        // Mutate every fixture event with a wrong-type optional/required field.
        val mutations = listOf(
            "threadId" to kotlinx.serialization.json.JsonPrimitive(99),
            "type" to kotlinx.serialization.json.JsonPrimitive(1),
        )
        for (element in array) {
            val obj = element.asObjectOrNull() ?: continue
            val base = obj.toMutableMap()
            for ((key, bad) in mutations) {
                if (!base.containsKey(key)) continue
                val mutated = JsonObject(base + (key to bad))
                assertNull(
                    "expected reject for $key wrong type on ${base["type"]}",
                    RuntimeEventReducer.parseRuntimeEvent(mutated),
                )
            }
        }
        // Optional present with wrong type on session.started.turnId
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "session.started")
                    put("threadId", "t")
                    put("turnId", true)
                },
            ),
        )
        // parentItemId wrong type
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "item.started")
                    put("threadId", "t")
                    put("itemId", "i")
                    put("itemType", "assistant_message")
                    put("parentItemId", 42)
                },
            ),
        )
    }

    @Test
    fun enumMutationsRejectUnknownItemTypeStateRequestTypeOutcome() {
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "item.started")
                    put("threadId", "t")
                    put("itemId", "i")
                    put("itemType", "not_a_real_item")
                },
            ),
        )
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "turn.completed")
                    put("threadId", "t")
                    put("turnId", "turn")
                    put("state", "running")
                },
            ),
        )
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "request.opened")
                    put("threadId", "t")
                    put("requestId", "r")
                    put("requestType", "unknown_request")
                    put("payload", buildJsonObject { put("summary", "s") })
                },
            ),
        )
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "request.resolved")
                    put("threadId", "t")
                    put("requestId", "r")
                    put("outcome", "maybe")
                },
            ),
        )
    }

    @Test
    fun payloadOnlyCompletedReasoningWithoutReasoningTextStreamIsDropped() {
        val items = mutableListOf(
            PersistedRuntimeItem(
                id = "r",
                type = "reasoning",
                state = "started",
                payload = buildJsonObject { put("text", "hidden") },
                streams = emptyMap(),
            ),
        )
        RuntimeEventReducer.apply(
            RuntimeEventReducer.RuntimeEvent(
                type = "item.completed",
                threadId = "t",
                itemId = "r",
                payloadSpecified = true,
                payload = buildJsonObject { put("text", "hidden") },
            ),
            items,
        )
        assertTrue(items.none { it.id == "r" })
    }
}
